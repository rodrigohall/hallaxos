// Registro pelo copiloto (Sprint 17 · decisão #79). O copiloto entende "hoje
// fizemos um guincho de 400 de X pra Y, cliente fulano, lança aí", monta um
// RegistroCopiloto, e o humano confirma com UM toque. Este módulo:
//
//   conferirRegistro  — o que falta/está errado + o resumo legível do card;
//                       roda na proposta (sem escrever) e de novo na confirmação.
//   executarRegistro  — grava tudo numa transação só, PELOS SERVICES DE SEMPRE:
//                       criarPessoa → criarGuincho → transicionar ×3 → pagar.
//
// Nada aqui reimplementa regra de negócio: a máquina de estados, a geração de
// lançamentos, os bloqueios de ativo e a timeline continuam nos services, e a
// autoria é do humano que confirmou. O que este módulo acrescenta é a ordem dos
// passos, a transação única e a chave que impede o duplo toque (decisão #43
// preservada: a IA propõe, o humano confirma, os endpoints de sempre executam).
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  pode, registroCopilotoCompletoSchema,
  type PagamentoRegistro, type PapelUsuario, type RegistroCopiloto, type TransicaoInput,
} from "@hallaxos/shared";
import { db, emTransacaoUnica } from "../db/client";
import { lancamentos } from "../db/schema";
import { regraNegocio, semPermissao } from "../lib/erros";
import { hojeEmDourados } from "../lib/hoje";
import { criarPessoa } from "./pessoas";
import { criarAtivo } from "./ativos";
import { criarCompra, criarGuincho, criarLocacao, criarVenda, transicionar } from "./operacoes";
import { criarLancamento, pagarLancamento } from "./financeiro";
import { contaPadrao } from "./origemFinanceira";
import { registrarEvento } from "./timeline";

export interface LinhaResumo {
  rotulo: string;
  valor: string;
}

export interface Conferencia {
  /** Vazio = pode confirmar. Cada item é uma frase pronta para o usuário. */
  problemas: string[];
  titulo: string;
  linhas: LinhaResumo[];
}

export interface LinkRegistro {
  entidade_tipo: "pessoa" | "ativo" | "operacao" | "lancamento";
  entidade_id: string;
  titulo: string;
}

export interface ResultadoRegistro {
  titulo: string;
  links: LinkRegistro[];
  /** true quando a mesma chave já tinha sido lançada (duplo toque, reenvio). */
  repetido: boolean;
}

const ROTULO_TIPO: Record<RegistroCopiloto["tipo"], string> = {
  guincho: "Guincho", locacao: "Locação", venda: "Venda", compra: "Compra", lancamento: "Lançamento",
};
const ROTULO_FORMA: Record<string, string> = {
  dinheiro: "dinheiro", pix: "Pix", cartao_credito: "cartão de crédito", cartao_debito: "cartão de débito",
  boleto: "boleto", transferencia: "transferência",
};
const ROTULO_SITUACAO_LOCACAO = { reservada: "reservada", ativa: "em andamento", finalizada: "finalizada" } as const;

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (d: string) => d.split("-").reverse().join("/");
/** CPF/CNPJ como se confere num documento: 111.444.777-35 / 11.444.777/0001-61. */
const documento = (d: string) =>
  d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
    : d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

/** Data simples vira meio-dia em Dourados (UTC−4, sem horário de verão desde
 *  2019): `new Date("2026-10-20")` seria meia-noite UTC, ou seja 19/10 às 20h lá. */
const momento = (d: string) => `${d}T12:00:00-04:00`;

/** Diárias de uma locação entre retirada e devolução — a mesma conta do
 *  services/operacoes (mínimo 1), para o card mostrar o valor que será gerado. */
export function diariasEntre(retirada: string, devolucao: string): number {
  const dias = (Date.parse(devolucao) - Date.parse(retirada)) / 86400_000;
  return Math.max(1, Math.ceil(dias));
}

/** Valor que o registro move no financeiro. */
export function valorDoRegistro(r: RegistroCopiloto): number {
  if (r.tipo === "locacao") return r.valor_diaria * diariasEntre(r.data_retirada, r.data_devolucao);
  return r.valor;
}

type Exigencia = [Parameters<typeof pode>[1], Parameters<typeof pode>[2], string];

/** Cada passo do registro exige a mesma permissão que a tela exigiria. */
function exigencias(r: RegistroCopiloto): Exigencia[] {
  const lista: Exigencia[] = [];
  if (r.tipo === "lancamento") {
    lista.push(["lancamentos", "criar", "lançar no financeiro"]);
    return lista;
  }
  lista.push(["operacoes", "criar", "criar operações"], ["operacoes", "transicionar", "avançar operações"]);
  if (r.cliente.novo) lista.push(["pessoas", "criar", "cadastrar clientes"]);
  if (r.tipo === "compra" && r.ativo.novo) lista.push(["ativos", "criar", "cadastrar ativos"]);
  if (r.pagamento?.situacao === "pago") lista.push(["lancamentos", "transicionar", "dar baixa em pagamentos"]);
  return lista;
}

async function linha<T>(consulta: ReturnType<typeof sql>): Promise<T | undefined> {
  return (await db.execute(consulta)).rows[0] as T | undefined;
}

/**
 * Confere um registro contra o banco sem escrever nada. Devolve os problemas
 * (o que o copiloto deve perguntar ou corrigir) e as linhas do card.
 */
export async function conferirRegistro(entrada: unknown, papel: PapelUsuario): Promise<Conferencia & { registro?: RegistroCopiloto }> {
  const parse = registroCopilotoCompletoSchema.safeParse(entrada);
  if (!parse.success) {
    // As mensagens do schema já são perguntas ("Informe o destino"); o que
    // escapar em inglês do zod ganha o caminho do campo, para o modelo saber
    // o que corrigir.
    const problemas = [
      ...new Set(
        parse.error.issues.map((i) =>
          /^(Required|Invalid|Expected|String must|Number must|Array must)/.test(i.message)
            ? `Campo ${i.path.join(".") || "registro"}: ${i.message}`
            : i.message
        )
      ),
    ];
    return { problemas, titulo: "Registro incompleto", linhas: [] };
  }
  const r = parse.data;
  const problemas: string[] = [];
  const linhas: LinhaResumo[] = [];
  const hoje = hojeEmDourados().data;
  const quando = r.data ?? hoje;

  for (const [recurso, acao, oque] of exigencias(r)) {
    if (!pode(papel, recurso, acao)) problemas.push(`Seu papel não pode ${oque}.`);
  }

  // ── Pessoa (cliente / comprador / vendedor) ──
  if (r.tipo !== "lancamento") {
    const rotulo = r.tipo === "compra" ? "Vendedor" : "Cliente";
    if (r.cliente.id) {
      const p = await linha<{ nome: string }>(sql`SELECT nome FROM pessoas WHERE id = ${r.cliente.id} AND deleted_at IS NULL`);
      if (!p) problemas.push(`${rotulo} não encontrado no cadastro — procure de novo ou cadastre como novo.`);
      else linhas.push({ rotulo, valor: p.nome });
    } else if (r.cliente.novo) {
      const n = r.cliente.novo;
      const existente = await linha<{ id: string; nome: string }>(
        sql`SELECT id, nome FROM pessoas WHERE cpf_cnpj = ${n.cpf_cnpj} AND deleted_at IS NULL`
      );
      if (existente) {
        problemas.push(`Já existe cadastro com este CPF/CNPJ: ${existente.nome} (id ${existente.id}). Use o cadastro existente.`);
      }
      linhas.push({ rotulo, valor: `${n.nome} (novo · ${n.tipo === "pj" ? "CNPJ" : "CPF"} ${documento(n.cpf_cnpj)})` });
    }
  }

  // ── Específico por tipo ──
  const ativo = async (id: string) =>
    linha<{ codigo: string; nome: string; status: string }>(
      sql`SELECT codigo, nome, status FROM ativos WHERE id = ${id} AND deleted_at IS NULL`
    );

  if (r.tipo === "guincho") {
    if (quando > hoje) problemas.push("A data do guincho está no futuro — o registro é de um guincho já feito.");
    linhas.push({ rotulo: "Trajeto", valor: `${r.origem_endereco} → ${r.destino_endereco}` });
    linhas.push({
      rotulo: "Veículo transportado",
      valor: r.veiculo_cliente_descricao + (r.veiculo_cliente_placa ? ` · ${r.veiculo_cliente_placa}` : ""),
    });
    if (r.caminhao_id) {
      const c = await ativo(r.caminhao_id);
      if (!c) problemas.push("Caminhão guincho não encontrado.");
      else linhas.push({ rotulo: "Caminhão", valor: `${c.codigo} · ${c.nome}` });
    }
    if (r.motorista_id) {
      const m = await linha<{ nome: string }>(sql`SELECT nome FROM pessoas WHERE id = ${r.motorista_id} AND deleted_at IS NULL`);
      if (!m) problemas.push("Motorista não encontrado.");
      else linhas.push({ rotulo: "Motorista", valor: m.nome });
    }
  } else if (r.tipo === "locacao") {
    const a = await ativo(r.ativo_id);
    if (!a) problemas.push("Veículo da locação não encontrado.");
    else {
      if (a.status !== "disponivel") problemas.push(`${a.nome} não está disponível agora (situação: ${a.status}).`);
      linhas.push({ rotulo: "Veículo", valor: `${a.codigo} · ${a.nome}` });
    }
    if (r.situacao !== "reservada" && r.data_retirada > hoje) problemas.push("A retirada está no futuro — então a locação ainda está reservada.");
    if (r.situacao === "finalizada" && r.data_devolucao > hoje) problemas.push("A devolução está no futuro — então a locação ainda não foi finalizada.");
    const dias = diariasEntre(r.data_retirada, r.data_devolucao);
    linhas.push({ rotulo: "Situação", valor: ROTULO_SITUACAO_LOCACAO[r.situacao] });
    linhas.push({
      rotulo: "Período",
      valor: `${dataBr(r.data_retirada)} → ${dataBr(r.data_devolucao)} · ${dias} diária${dias > 1 ? "s" : ""} de ${reais(r.valor_diaria)}`,
    });
  } else if (r.tipo === "venda") {
    if (quando > hoje) problemas.push("A data da venda está no futuro.");
    const a = await ativo(r.ativo_id);
    if (!a) problemas.push("Ativo vendido não encontrado.");
    else {
      if (["vendido", "baixado"].includes(a.status)) problemas.push(`${a.nome} já está ${a.status}.`);
      linhas.push({ rotulo: "Ativo", valor: `${a.codigo} · ${a.nome}` });
    }
    linhas.push({ rotulo: "Documentação", valor: r.transferido ? "já transferida" : "a transferir" });
  } else if (r.tipo === "compra") {
    if (quando > hoje) problemas.push("A data da compra está no futuro.");
    if (r.ativo.id) {
      const a = await ativo(r.ativo.id);
      if (!a) problemas.push("Ativo comprado não encontrado.");
      else linhas.push({ rotulo: "Ativo", valor: `${a.codigo} · ${a.nome}` });
    } else if (r.ativo.novo) {
      const n = r.ativo.novo;
      const cat = await linha<{ nome: string; eh_veicular: boolean }>(
        sql`SELECT nome, eh_veicular FROM ativo_categorias WHERE id = ${n.categoria_id}`
      );
      if (!cat) problemas.push("Categoria do ativo não encontrada.");
      else if (cat.eh_veicular && !n.veiculo) {
        problemas.push(`A categoria ${cat.nome} exige os dados do veículo: placa, marca e modelo.`);
      }
      // A placa é única no cadastro e o veículo sem placa entra como texto vazio:
      // o segundo sem placa colide. Pelo copiloto, veículo novo vem com placa.
      if (n.veiculo && !n.veiculo.placa) problemas.push("Informe a placa do veículo comprado.");
      if (n.veiculo?.placa) {
        const dup = await linha<{ ativo_id: string }>(sql`SELECT ativo_id FROM ativos_veiculos WHERE placa = ${n.veiculo.placa}`);
        if (dup) problemas.push(`Já existe um ativo com a placa ${n.veiculo.placa}.`);
      }
      const v = n.veiculo;
      linhas.push({
        rotulo: "Ativo",
        valor: `${n.nome} (novo${cat ? ` · ${cat.nome}` : ""}${v ? ` · ${v.marca} ${v.modelo}${v.placa ? ` · ${v.placa}` : ""}` : ""})`,
      });
    }
    linhas.push({ rotulo: "Documentação", valor: r.transferido ? "já transferida" : "a transferir" });
  } else {
    const cat = await linha<{ nome: string; tipo: string }>(
      sql`SELECT nome, tipo FROM categorias_financeiras WHERE id = ${r.categoria_id}`
    );
    if (!cat) problemas.push("Categoria financeira não encontrada.");
    else if (cat.tipo !== r.natureza) problemas.push(`A categoria ${cat.nome} é de ${cat.tipo}, não de ${r.natureza}.`);
    linhas.push({ rotulo: "Descrição", valor: r.descricao });
    if (cat) linhas.push({ rotulo: "Categoria", valor: cat.nome });
    if (r.pessoa_id) {
      const p = await linha<{ nome: string }>(sql`SELECT nome FROM pessoas WHERE id = ${r.pessoa_id} AND deleted_at IS NULL`);
      if (!p) problemas.push("Pessoa do lançamento não encontrada.");
      else linhas.push({ rotulo: "Pessoa", valor: p.nome });
    }
    if (r.ativo_id) {
      const a = await ativo(r.ativo_id);
      if (!a) problemas.push("Ativo do lançamento não encontrado.");
      else linhas.push({ rotulo: "Ativo", valor: `${a.codigo} · ${a.nome}` });
    }
  }

  // ── Dinheiro ──
  const total = valorDoRegistro(r);
  linhas.push({ rotulo: r.tipo === "locacao" ? "Total" : "Valor", valor: reais(total) });
  if (r.pagamento) {
    const p = r.pagamento;
    let contaNome: string | undefined;
    if (p.conta_id) {
      const c = await linha<{ nome: string }>(sql`SELECT nome FROM contas WHERE id = ${p.conta_id}`);
      if (!c) problemas.push("Conta financeira não encontrada.");
      contaNome = c?.nome;
    }
    if (p.situacao === "pago") {
      if ((p.data_pagamento ?? quando) > hoje) problemas.push("A data do pagamento está no futuro — então ainda está pendente.");
      linhas.push({
        rotulo: "Pagamento",
        valor: `pago em ${dataBr(p.data_pagamento ?? quando)} · ${ROTULO_FORMA[p.forma_pagamento]}${contaNome ? ` · ${contaNome}` : ""}`,
      });
    } else {
      const a = r.tipo === "lancamento" && r.natureza === "despesa" || r.tipo === "compra" ? "a pagar" : "a receber";
      linhas.push({
        rotulo: "Pagamento",
        valor:
          `${a} · vence ${dataBr(p.data_vencimento)}` +
          (p.parcelas > 1 ? ` · ${p.parcelas}x de ${reais(total / p.parcelas)}` : "") +
          (contaNome ? ` · ${contaNome}` : ""),
      });
    }
  }
  if (r.tipo !== "locacao" && r.data) linhas.splice(0, 0, { rotulo: "Data", valor: dataBr(r.data) });
  if (r.observacoes) linhas.push({ rotulo: "Observações", valor: r.observacoes });

  return { problemas, titulo: `${ROTULO_TIPO[r.tipo]} · ${reais(total)}`, linhas, registro: r };
}

// ─────────────────────────── Execução ───────────────────────────

/** Vencimentos mensais a partir do primeiro (mesma regra dos parcelamentos). */
function mensais(primeiro: string, n: number): { data_vencimento: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(primeiro + "T12:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + i);
    return { data_vencimento: d.toISOString().slice(0, 10) };
  });
}

/** O plano que a transição usa para gerar os lançamentos da operação. */
function financeiroDa(p: PagamentoRegistro, quando: string): TransicaoInput["financeiro"] {
  if (p.situacao === "pago") {
    return { conta_id: p.conta_id, forma_pagamento: p.forma_pagamento, parcelas: [{ data_vencimento: p.data_pagamento ?? quando }] };
  }
  return { conta_id: p.conta_id, forma_pagamento: null, parcelas: mensais(p.data_vencimento, p.parcelas) };
}

/** Dá baixa nos lançamentos que a transição acabou de gerar, quando já foi pago. */
async function quitarGerados(operacaoId: string, p: PagamentoRegistro, quando: string, usuarioId: string) {
  if (p.situacao !== "pago") return;
  const gerados = await db
    .select({ id: lancamentos.id })
    .from(lancamentos)
    .where(and(eq(lancamentos.operacaoId, operacaoId), eq(lancamentos.status, "previsto"), isNull(lancamentos.deletedAt)));
  for (const l of gerados) {
    await pagarLancamento(
      l.id,
      { data_pagamento: p.data_pagamento ?? quando, conta_id: p.conta_id, forma_pagamento: p.forma_pagamento },
      usuarioId
    );
  }
}

async function linksDosLancamentos(operacaoId: string): Promise<LinkRegistro[]> {
  const ls = await db
    .select({ id: lancamentos.id, descricao: lancamentos.descricao })
    .from(lancamentos)
    .where(and(eq(lancamentos.operacaoId, operacaoId), isNull(lancamentos.deletedAt)));
  return ls.map((l) => ({ entidade_tipo: "lancamento" as const, entidade_id: l.id, titulo: l.descricao }));
}

async function resolverPessoa(
  p: { id?: string; novo?: { tipo: "pf" | "pj"; nome: string; cpf_cnpj: string; telefone?: string | null } },
  usuarioId: string,
  links: LinkRegistro[]
): Promise<string> {
  if (p.id) {
    const [{ nome }] = (await db.execute(sql`SELECT nome FROM pessoas WHERE id = ${p.id}`)).rows as [{ nome: string }];
    links.push({ entidade_tipo: "pessoa", entidade_id: p.id, titulo: nome });
    return p.id;
  }
  const criada = await criarPessoa({ ...p.novo!, telefone: p.novo!.telefone ?? null }, usuarioId);
  links.push({ entidade_tipo: "pessoa", entidade_id: criada.id, titulo: `${criada.nome} (novo cadastro)` });
  return criada.id;
}

/**
 * Executa um registro confirmado. Tudo numa transação: se o pagamento falhar,
 * o cliente novo, a operação e as transições também não ficam. A `chave` vem da
 * proposta; repetir a mesma chave devolve o resultado da primeira vez.
 */
export async function executarRegistro(
  chave: string,
  entrada: unknown,
  usuario: { id: string; papel: PapelUsuario }
): Promise<ResultadoRegistro> {
  return emTransacaoUnica(async () => {
    // Duplo toque / reenvio: trava pela chave e devolve o que já foi lançado.
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${chave}, 0))`);
    const anterior = (
      await db.execute(sql`SELECT dados FROM timeline WHERE dados->>'copiloto_chave' = ${chave} LIMIT 1`)
    ).rows[0] as { dados: { resultado: ResultadoRegistro } } | undefined;
    if (anterior) return { ...anterior.dados.resultado, repetido: true };

    const conferencia = await conferirRegistro(entrada, usuario.papel);
    if (conferencia.problemas.length || !conferencia.registro) {
      if (conferencia.problemas.some((p) => p.startsWith("Seu papel"))) throw semPermissao();
      throw regraNegocio(conferencia.problemas.join(" "));
    }
    const r = conferencia.registro;
    const hoje = hojeEmDourados().data;
    const quando = r.data ?? hoje;
    const links: LinkRegistro[] = [];
    const transicao = (status: TransicaoInput["status"], extra: Partial<TransicaoInput> = {}): TransicaoInput =>
      ({ status, parcelas: 1, ...extra });

    let principal: { tipo: "operacao" | "lancamento"; id: string; titulo: string };

    if (r.tipo === "lancamento") {
      const p = r.pagamento;
      const criados = await criarLancamento(
        {
          tipo: r.natureza,
          descricao: r.descricao,
          categoria_id: r.categoria_id,
          conta_id: p.conta_id ?? (await contaPadrao(db)),
          pessoa_id: r.pessoa_id ?? null,
          ativo_id: r.ativo_id ?? null,
          valor: r.valor,
          data_vencimento: p.situacao === "pago" ? (p.data_pagamento ?? quando) : p.data_vencimento,
          data_pagamento: p.situacao === "pago" ? (p.data_pagamento ?? quando) : null,
          parcelas: p.situacao === "pendente" ? p.parcelas : 1,
          pago: p.situacao === "pago",
          forma_pagamento: p.situacao === "pago" ? p.forma_pagamento : null,
        },
        usuario.id
      );
      for (const l of criados) links.push({ entidade_tipo: "lancamento", entidade_id: l.id, titulo: l.descricao });
      principal = { tipo: "lancamento", id: criados[0]!.id, titulo: r.descricao };
    } else {
      const clienteId = await resolverPessoa(r.cliente, usuario.id, links);
      const dataInicio = r.data ? momento(r.data) : undefined;
      const quandoTransicao = r.data ? momento(r.data) : undefined;
      let op: { id: string; codigo: string };

      if (r.tipo === "guincho") {
        op = await criarGuincho(
          {
            cliente_id: clienteId,
            origem_endereco: r.origem_endereco,
            destino_endereco: r.destino_endereco,
            veiculo_cliente_descricao: r.veiculo_cliente_descricao,
            veiculo_cliente_placa: r.veiculo_cliente_placa,
            caminhao_id: r.caminhao_id ?? null,
            motorista_id: r.motorista_id ?? null,
            valor_total: r.valor,
            observacoes: r.observacoes,
            data_inicio: dataInicio,
          },
          usuario.id
        );
        // A máquina de estados não pula etapas: o guincho percorre as quatro.
        await transicionar(op.id, transicao("a_caminho", { data: quandoTransicao }), usuario);
        await transicionar(op.id, transicao("em_execucao", { data: quandoTransicao }), usuario);
        await transicionar(op.id, transicao("concluido", { data: quandoTransicao, financeiro: financeiroDa(r.pagamento, quando) }), usuario);
        await quitarGerados(op.id, r.pagamento, quando, usuario.id);
      } else if (r.tipo === "locacao") {
        op = await criarLocacao(
          {
            cliente_id: clienteId,
            ativo_id: r.ativo_id,
            valor_diaria: r.valor_diaria,
            caucao: 0,
            data_devolucao_prevista: momento(r.data_devolucao),
            observacoes: r.observacoes,
            data_inicio: momento(r.data_retirada),
          },
          usuario.id
        );
        await transicionar(op.id, transicao("reservada"), usuario);
        if (r.situacao !== "reservada") {
          await transicionar(op.id, transicao("ativa", { data: momento(r.data_retirada) }), usuario);
        }
        if (r.situacao === "finalizada") {
          const pagamento = r.pagamento!;
          await transicionar(
            op.id,
            transicao("finalizada", { data: momento(r.data_devolucao), financeiro: financeiroDa(pagamento, r.data_devolucao) }),
            usuario
          );
          await quitarGerados(op.id, pagamento, r.data_devolucao, usuario.id);
        }
      } else {
        // Venda e compra: negociação → fechada (gera o financeiro) → concluída
        // (documentação transferida), igual ao fluxo da tela.
        let ativoId: string;
        if (r.tipo === "compra" && r.ativo.novo) {
          const n = r.ativo.novo;
          const criado = await criarAtivo(
            {
              nome: n.nome,
              categoria_id: n.categoria_id,
              valor_aquisicao: r.valor,
              data_aquisicao: new Date(momento(quando)),
              veiculo: n.veiculo ? { ...n.veiculo, km_atual: n.veiculo.km_atual ?? 0 } : null,
              // A compra nasce logo abaixo, com o vendedor de verdade — o atalho
              // do formulário de ativo criaria outra (decisão #58).
              gerar_compra: false,
            },
            usuario.id
          );
          ativoId = criado.id;
          links.push({ entidade_tipo: "ativo", entidade_id: criado.id, titulo: `${criado.codigo} · ${criado.nome} (novo)` });
        } else {
          ativoId = r.tipo === "compra" ? r.ativo.id! : r.ativo_id;
          const [{ codigo, nome }] = (await db.execute(sql`SELECT codigo, nome FROM ativos WHERE id = ${ativoId}`)).rows as [
            { codigo: string; nome: string },
          ];
          links.push({ entidade_tipo: "ativo", entidade_id: ativoId, titulo: `${codigo} · ${nome}` });
        }
        const dados = { cliente_id: clienteId, ativo_id: ativoId, valor_total: r.valor, observacoes: r.observacoes, data_inicio: dataInicio };
        op = r.tipo === "venda" ? await criarVenda(dados, usuario.id) : await criarCompra(dados, usuario.id);
        await transicionar(op.id, transicao("fechada", { data: quandoTransicao, financeiro: financeiroDa(r.pagamento, quando) }), usuario);
        await quitarGerados(op.id, r.pagamento, quando, usuario.id);
        if (r.transferido) await transicionar(op.id, transicao("concluida", { data: quandoTransicao }), usuario);
      }

      links.unshift({ entidade_tipo: "operacao", entidade_id: op.id, titulo: `${op.codigo} · ${ROTULO_TIPO[r.tipo]}` });
      links.push(...(await linksDosLancamentos(op.id)));
      principal = { tipo: "operacao", id: op.id, titulo: op.codigo };
    }

    const resultado: ResultadoRegistro = {
      titulo: `${ROTULO_TIPO[r.tipo]} registrado: ${principal.titulo}`,
      links,
      repetido: false,
    };
    await registrarEvento(db, {
      entidadeTipo: principal.tipo,
      entidadeId: principal.id,
      evento: "atualizado",
      descricao: "Registrado pelo copiloto e confirmado pelo usuário",
      dados: { copiloto_chave: chave, resultado },
      usuarioId: usuario.id,
    });
    return resultado;
  });
}
