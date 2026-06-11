// Seed de desenvolvimento: cria usuários, cadastros e movimento suficiente
// para o dashboard nascer vivo. Idempotente — roda uma vez, depois vira no-op.
import { sql } from "drizzle-orm";
import { db, pool } from "./client";
import { usuarios } from "./schema";
import { novoId } from "../lib/ids";
import { hashSenha } from "../services/auth";
import { criarPessoa, garantirPapel } from "../services/pessoas";
import { registrarEvento } from "../services/timeline";
import { indexar } from "../services/busca";

async function seed() {
  const existentes = await db.select({ id: usuarios.id }).from(usuarios).limit(1);
  if (existentes.length > 0) {
    console.log("Seed já aplicado — nada a fazer.");
    return;
  }

  console.log("Aplicando seed de desenvolvimento...");

  // ── Usuários (senha padrão de dev: hallax123) ──
  const senha = await hashSenha("hallax123");
  const [adminId, gestorId, operadorId, financeiroId] = [novoId(), novoId(), novoId(), novoId()];
  await db.insert(usuarios).values([
    { id: adminId, nome: "Rodrigo Hall", email: "admin@hallax.com", senhaHash: senha, papel: "admin" },
    { id: gestorId, nome: "Gestora Hallax", email: "gestor@hallax.com", senhaHash: senha, papel: "gestor" },
    { id: operadorId, nome: "Operador Hallax", email: "operador@hallax.com", senhaHash: senha, papel: "operador" },
    { id: financeiroId, nome: "Financeiro Hallax", email: "financeiro@hallax.com", senhaHash: senha, papel: "financeiro" },
  ]);
  for (const id of [adminId, gestorId, operadorId, financeiroId]) {
    await registrarEvento(db, {
      entidadeTipo: "usuario", entidadeId: id, evento: "criado",
      descricao: "Usuário criado pelo seed", usuarioId: adminId,
    });
  }

  // ── Pessoas (pelo service: timeline + busca entram de graça) ──
  const joao = await criarPessoa({
    tipo: "pf", nome: "João Pereira", cpf_cnpj: "39053344705",
    telefone: "62999110001", email: "joao.pereira@gmail.com",
    cidade: "Goiânia", uf: "GO",
    cnh_numero: "01234567890", cnh_categoria: "B",
    cnh_validade: new Date(Date.now() + 20 * 86400_000), // vence em 20 dias → alerta
  } as never, adminId);
  const maria = await criarPessoa({
    tipo: "pf", nome: "Maria Souza", cpf_cnpj: "52998224725",
    telefone: "62999110002", cidade: "Goiânia", uf: "GO",
  } as never, adminId);
  const oficina = await criarPessoa({
    tipo: "pj", nome: "Oficina Mecânica Central LTDA", nome_fantasia: "Oficina Central",
    cpf_cnpj: "19131243000197", telefone: "6232110003", cidade: "Goiânia", uf: "GO",
  } as never, adminId);
  const transportadora = await criarPessoa({
    tipo: "pj", nome: "TransLog Transportes LTDA", nome_fantasia: "TransLog",
    cpf_cnpj: "45723174000110", telefone: "6232110004", cidade: "Aparecida de Goiânia", uf: "GO",
  } as never, adminId);

  await garantirPapel(db, joao.id, "cliente");
  await garantirPapel(db, maria.id, "cliente");
  await garantirPapel(db, oficina.id, "fornecedor");
  await garantirPapel(db, transportadora.id, "cliente");

  // ── Categorias, contas ──
  const sqlExec = (q: ReturnType<typeof sql>) => db.execute(q);
  const cat = {
    carro: novoId(), guincho: novoId(), empilhadeira: novoId(), equipamento: novoId(), movel: novoId(),
  };
  await sqlExec(sql`
    INSERT INTO ativo_categorias (id, nome, eh_veicular) VALUES
      (${cat.carro}, 'Carro', true),
      (${cat.guincho}, 'Caminhão Guincho', true),
      (${cat.empilhadeira}, 'Empilhadeira', false),
      (${cat.equipamento}, 'Equipamento', false),
      (${cat.movel}, 'Móvel', false)`);

  const fin = { locacao: novoId(), guincho: novoId(), venda: novoId(), manutencao: novoId(), combustivel: novoId(), administrativo: novoId() };
  await sqlExec(sql`
    INSERT INTO categorias_financeiras (id, nome, tipo) VALUES
      (${fin.locacao}, 'Locação', 'receita'),
      (${fin.guincho}, 'Guincho', 'receita'),
      (${fin.venda}, 'Venda de Ativos', 'receita'),
      (${fin.manutencao}, 'Manutenção', 'despesa'),
      (${fin.combustivel}, 'Combustível', 'despesa'),
      (${fin.administrativo}, 'Administrativo', 'despesa')`);

  const contaCaixa = novoId();
  const contaBanco = novoId();
  await sqlExec(sql`
    INSERT INTO contas (id, nome, saldo_inicial) VALUES
      (${contaCaixa}, 'Caixa', 1000),
      (${contaBanco}, 'Banco Inter PJ', 25000)`);

  // ── Ativos ──
  const corolla = novoId();
  const onix = novoId();
  const guincho1 = novoId();
  const empilhadeira = novoId();
  const camaElastica = novoId();
  await sqlExec(sql`
    INSERT INTO ativos (id, categoria_id, nome, status, valor_aquisicao, valor_fipe, data_aquisicao, localizacao) VALUES
      (${corolla}, ${cat.carro}, 'Toyota Corolla XEi 2022', 'alugado', 115000, 124300, '2024-03-10', 'Com cliente'),
      (${onix}, ${cat.carro}, 'Chevrolet Onix LT 2023', 'disponivel', 78000, 82500, '2024-07-22', 'Pátio'),
      (${guincho1}, ${cat.guincho}, 'Guincho Mercedes Accelo', 'em_uso_interno', 210000, 198000, '2023-01-15', 'Em serviço'),
      (${empilhadeira}, ${cat.empilhadeira}, 'Empilhadeira Yale 2.5t', 'disponivel', 65000, NULL, '2022-05-02', 'Galpão'),
      (${camaElastica}, ${cat.equipamento}, 'Cama Elástica Profissional 4m', 'disponivel', 4500, NULL, '2025-02-01', 'Galpão')`);
  await sqlExec(sql`
    INSERT INTO ativos_veiculos (ativo_id, placa, marca, modelo, ano_fabricacao, ano_modelo, cor, combustivel, km_atual) VALUES
      (${corolla}, 'RTX2B45', 'Toyota', 'Corolla XEi', 2021, 2022, 'Prata', 'flex', 45230),
      (${onix}, 'SQP7C12', 'Chevrolet', 'Onix LT', 2023, 2023, 'Branco', 'flex', 22100),
      (${guincho1}, 'QWE9F88', 'Mercedes-Benz', 'Accelo 1016', 2022, 2023, 'Branco', 'diesel', 98750)`);

  const ativosSeed = [
    { id: corolla, nome: "Toyota Corolla XEi 2022", sub: "Ativo · alugado", placa: "RTX2B45" },
    { id: onix, nome: "Chevrolet Onix LT 2023", sub: "Ativo · disponível", placa: "SQP7C12" },
    { id: guincho1, nome: "Guincho Mercedes Accelo", sub: "Ativo · em uso interno", placa: "QWE9F88" },
    { id: empilhadeira, nome: "Empilhadeira Yale 2.5t", sub: "Ativo · disponível", placa: null },
    { id: camaElastica, nome: "Cama Elástica Profissional 4m", sub: "Ativo · disponível", placa: null },
  ];
  for (const a of ativosSeed) {
    await registrarEvento(db, {
      entidadeTipo: "ativo", entidadeId: a.id, evento: "criado",
      descricao: `Ativo ${a.nome} cadastrado`, usuarioId: adminId,
    });
    const [{ codigo }] = (await db.execute(sql`SELECT codigo FROM ativos WHERE id = ${a.id}`))
      .rows as [{ codigo: string }];
    await indexar(db, {
      entidadeTipo: "ativo", entidadeId: a.id, titulo: a.nome, subtitulo: `${a.sub} · ${codigo}`,
      // Placa é alfanumérica: entra nos termos de texto E (só dígitos) nos numéricos
      termos: [a.nome, codigo, a.placa], termosNumericos: [codigo, a.placa],
    });
  }

  // ── Operações: locação ativa (atrasada), reserva futura, guincho em execução ──
  const hoje = new Date();
  const dias = (n: number) => new Date(hoje.getTime() + n * 86400_000);

  const locacaoAtiva = novoId();
  await sqlExec(sql`
    INSERT INTO operacoes (id, tipo, cliente_id, responsavel_id, status, valor_total, data_inicio)
    VALUES (${locacaoAtiva}, 'locacao', ${joao.id}, ${operadorId}, 'ativa', 1750, ${dias(-7).toISOString()})`);
  await sqlExec(sql`
    INSERT INTO operacoes_locacao (operacao_id, valor_diaria, data_retirada, data_devolucao_prevista, km_saida)
    VALUES (${locacaoAtiva}, 250, ${dias(-7).toISOString()}, ${dias(-1).toISOString()}, 44800)`);
  await sqlExec(sql`
    INSERT INTO operacao_ativos (operacao_id, ativo_id, papel) VALUES (${locacaoAtiva}, ${corolla}, 'objeto')`);

  const reserva = novoId();
  await sqlExec(sql`
    INSERT INTO operacoes (id, tipo, cliente_id, responsavel_id, status, valor_total, data_inicio)
    VALUES (${reserva}, 'locacao', ${maria.id}, ${operadorId}, 'reservada', 900, ${dias(2).toISOString()})`);
  await sqlExec(sql`
    INSERT INTO operacoes_locacao (operacao_id, valor_diaria, data_devolucao_prevista)
    VALUES (${reserva}, 300, ${dias(5).toISOString()})`);
  await sqlExec(sql`
    INSERT INTO operacao_ativos (operacao_id, ativo_id, papel) VALUES (${reserva}, ${onix}, 'objeto')`);

  const guinchoOp = novoId();
  await sqlExec(sql`
    INSERT INTO operacoes (id, tipo, cliente_id, responsavel_id, status, valor_total, data_inicio)
    VALUES (${guinchoOp}, 'guincho', ${transportadora.id}, ${operadorId}, 'em_execucao', 450, now())`);
  await sqlExec(sql`
    INSERT INTO operacoes_guincho (operacao_id, origem_endereco, destino_endereco, veiculo_cliente_descricao, veiculo_cliente_placa)
    VALUES (${guinchoOp}, 'BR-153, km 12', 'Oficina Central — Setor Norte', 'Fiat Strada branca', 'PQR1A23')`);
  await sqlExec(sql`
    INSERT INTO operacao_ativos (operacao_id, ativo_id, papel) VALUES (${guinchoOp}, ${guincho1}, 'recurso')`);

  for (const [id, desc] of [
    [locacaoAtiva, "Locação do Corolla para João Pereira ativada"],
    [reserva, "Reserva do Onix para Maria Souza registrada"],
    [guinchoOp, "Guincho solicitado pela TransLog em execução"],
  ] as const) {
    await registrarEvento(db, {
      entidadeTipo: "operacao", entidadeId: id, evento: "criado", descricao: desc, usuarioId: operadorId,
    });
    const [{ codigo }] = (await db.execute(sql`SELECT codigo FROM operacoes WHERE id = ${id}`))
      .rows as [{ codigo: string }];
    await indexar(db, {
      entidadeTipo: "operacao", entidadeId: id, titulo: `${codigo} — ${desc}`,
      subtitulo: "Operação", termos: [codigo, desc], termosNumericos: [codigo],
    });
  }

  // ── Manutenção agendada ──
  const manutencao = novoId();
  await sqlExec(sql`
    INSERT INTO manutencoes (id, ativo_id, tipo, status, descricao, fornecedor_id, data_agendada)
    VALUES (${manutencao}, ${onix}, 'revisao', 'agendada', 'Revisão dos 25 mil km',
            ${oficina.id}, ${dias(3).toISOString().slice(0, 10)})`);
  await registrarEvento(db, {
    entidadeTipo: "manutencao", entidadeId: manutencao, evento: "criado",
    descricao: "Revisão dos 25 mil km agendada na Oficina Central", usuarioId: operadorId,
  });

  // ── Lançamentos: pagos hoje, previstos, vencidos ──
  const lanc = (
    tipo: string, descricao: string, categoria: string, valor: number,
    vencimento: Date, pagamento: Date | null, operacaoId: string | null, manutencaoId: string | null,
    pessoaId: string | null
  ) =>
    sqlExec(sql`
      INSERT INTO lancamentos (id, tipo, descricao, categoria_id, conta_id, pessoa_id,
                               operacao_id, manutencao_id, valor, data_vencimento, data_pagamento, status, forma_pagamento)
      VALUES (${novoId()}, ${tipo}::tipo_lancamento, ${descricao}, ${categoria}, ${contaBanco}, ${pessoaId},
              ${operacaoId}, ${manutencaoId}, ${valor},
              ${vencimento.toISOString().slice(0, 10)},
              ${pagamento ? pagamento.toISOString().slice(0, 10) : null},
              ${pagamento ? "pago" : "previsto"}::status_lancamento,
              ${pagamento ? "pix" : null})`);

  await lanc("receita", "Locação Corolla — 1ª semana", fin.locacao, 1750, dias(-1), hoje, locacaoAtiva, null, joao.id);
  await lanc("receita", "Guincho TransLog — BR-153", fin.guincho, 450, hoje, hoje, guinchoOp, null, transportadora.id);
  await lanc("despesa", "Combustível frota", fin.combustivel, 320, hoje, hoje, null, null, null);
  await lanc("despesa", "Revisão dos 25 mil km (previsão)", fin.manutencao, 850, dias(3), null, null, manutencao, oficina.id);
  await lanc("despesa", "Aluguel do galpão", fin.administrativo, 3500, dias(-3), null, null, null, null); // vencido
  await lanc("receita", "Reserva Onix — Maria Souza", fin.locacao, 900, dias(2), null, reserva, null, maria.id);

  // ── Evento de agenda manual ──
  await sqlExec(sql`
    INSERT INTO eventos_agenda (id, titulo, descricao, data_inicio, responsavel_id)
    VALUES (${novoId()}, 'Reunião semanal da operação', 'Alinhamento geral',
            ${new Date(hoje.toISOString().slice(0, 10) + "T17:00:00-03:00").toISOString()}, ${gestorId})`);

  console.log("Seed aplicado.");
  console.log("Login: admin@hallax.com / hallax123 (também gestor@, operador@, financeiro@)");
}

seed()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
