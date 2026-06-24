import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  idSchema, paginacaoSchema, lancamentoCriarSchema, lancamentoEditarSchema,
  lancamentoFiltrosSchema, lancamentoPagarSchema, contaCriarSchema,
  categoriaFinanceiraCriarSchema, planilhaFiltrosSchema,
} from "@hallaxos/shared";
import {
  anularLancamento, cancelarLancamento, criarCategoriaFinanceira, criarConta,
  criarLancamento, editarLancamento, estornarLancamento, fluxoCaixa,
  listarCategoriasFinanceiras, listarContas, listarLancamentos, pagarLancamento,
  pagarLancamentosLote, vincularLancamentos,
} from "../services/financeiro";
import { dre, resultadoPorAtivo, planilhaPivot } from "../services/relatorios";
import { exigirLogin, exigirPermissao } from "../plugins/auth";
import { semPermissao } from "../lib/erros";

const params = z.object({ id: idSchema });
const motivo = z.object({ motivo: z.string().trim().min(3, "Informe o motivo") });

export default async function rotasFinanceiro(app: FastifyInstance) {
  app.get("/lancamentos", { preHandler: exigirPermissao("lancamentos", "ler") }, async (req) => {
    const f = lancamentoFiltrosSchema.parse(req.query);
    const { pagina, por_pagina } = paginacaoSchema.parse(req.query);
    const { dados, total } = await listarLancamentos({
      tipo: f.tipo, status: f.status, categoriaId: f.categoria_id, contaId: f.conta_id,
      pessoaId: f.pessoa_id, busca: f.busca, operacaoTipo: f.operacao_tipo,
      de: f.de, ate: f.ate,
      pagina, porPagina: por_pagina,
    });
    return { dados, meta: { total, pagina, por_pagina } };
  });

  app.post("/lancamentos", { preHandler: exigirPermissao("lancamentos", "criar") }, async (req, reply) => {
    const input = lancamentoCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarLancamento(input, exigirLogin(req).id) };
  });

  app.patch("/lancamentos/:id", { preHandler: exigirPermissao("lancamentos", "editar") }, async (req) => {
    const { id } = params.parse(req.params);
    const u = exigirLogin(req);
    return { dados: await editarLancamento(id, lancamentoEditarSchema.parse(req.body), { id: u.id, papel: u.papel }) };
  });

  app.post("/lancamentos/:id/pagar", { preHandler: exigirPermissao("lancamentos", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await pagarLancamento(id, lancamentoPagarSchema.parse(req.body), exigirLogin(req).id) };
  });

  // Vinculação automática: lança lancamentos avulsos a operações/manutenções por heurística
  // (pessoa_id + janela de 7 dias). dry_run=true retorna o preview sem gravar.
  // Restrito a admin.
  app.post("/lancamentos/vincular", async (req) => {
    const u = exigirLogin(req);
    if (u.papel !== "admin") throw semPermissao();
    const { dry_run } = z.object({ dry_run: z.boolean().default(true) }).parse(req.body);
    return { dados: await vincularLancamentos(dry_run, u.id) };
  });

  app.post("/lancamentos/pagar-lote", { preHandler: exigirPermissao("lancamentos", "transicionar") }, async (req) => {
    const { ids, ...pagamento } = z.object({
      ids: z.array(z.string().uuid()).min(1).max(200),
      data_pagamento: z.string().date(),
      conta_id: z.string().uuid().optional(),
      forma_pagamento: lancamentoPagarSchema.shape.forma_pagamento,
    }).parse(req.body);
    return { dados: await pagarLancamentosLote(ids, pagamento, exigirLogin(req).id) };
  });

  app.post("/lancamentos/:id/cancelar", { preHandler: exigirPermissao("lancamentos", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await cancelarLancamento(id, motivo.parse(req.body).motivo, exigirLogin(req).id) };
  });

  app.post("/lancamentos/:id/estornar", { preHandler: exigirPermissao("lancamentos", "transicionar") }, async (req) => {
    const { id } = params.parse(req.params);
    return { dados: await estornarLancamento(id, motivo.parse(req.body).motivo, exigirLogin(req).id) };
  });

  // Anular um lançamento lançado errado: tira-o dos indicadores preservando a
  // trilha e o vínculo de origem. Só admin (anular um pago reescreve números).
  app.post("/lancamentos/:id/anular", { preHandler: exigirPermissao("lancamentos", "transicionar") }, async (req) => {
    const usuario = exigirLogin(req);
    if (usuario.papel !== "admin") throw semPermissao();
    const { id } = params.parse(req.params);
    return { dados: await anularLancamento(id, motivo.parse(req.body).motivo, usuario.id) };
  });

  app.get("/contas", { preHandler: exigirPermissao("contas", "ler") }, async () => ({
    dados: await listarContas(),
  }));
  app.post("/contas", { preHandler: exigirPermissao("contas", "criar") }, async (req, reply) => {
    const input = contaCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarConta(input.nome, input.saldo_inicial) };
  });

  app.get("/categorias-financeiras", { preHandler: exigirPermissao("categorias_financeiras", "ler") }, async () => ({
    dados: await listarCategoriasFinanceiras(),
  }));
  app.post("/categorias-financeiras", { preHandler: exigirPermissao("categorias_financeiras", "criar") }, async (req, reply) => {
    const input = categoriaFinanceiraCriarSchema.parse(req.body);
    reply.code(201);
    return { dados: await criarCategoriaFinanceira(input.nome, input.tipo) };
  });

  app.get("/financeiro/fluxo-caixa", { preHandler: exigirPermissao("dashboard_financeiro", "ler") }, async (req) => {
    const q = z.object({ de: z.string().date(), ate: z.string().date() }).parse(req.query);
    return { dados: await fluxoCaixa(q.de, q.ate) };
  });

  app.get(
    "/relatorios/resultado-por-ativo",
    { preHandler: exigirPermissao("relatorios_financeiros", "ler") },
    async (req) => {
      const q = z.object({ de: z.string().date().optional(), ate: z.string().date().optional() }).parse(req.query);
      return { dados: await resultadoPorAtivo(q.de, q.ate) };
    }
  );

  app.get("/relatorios/dre", { preHandler: exigirPermissao("relatorios_financeiros", "ler") }, async (req) => {
    const { ano } = z.object({ ano: z.coerce.number().int().min(2020).max(2100) }).parse(req.query);
    return { dados: await dre(ano) };
  });

  app.get("/relatorios/planilha", { preHandler: exigirPermissao("relatorios_financeiros", "ler") }, async (req) => {
    const f = planilhaFiltrosSchema.parse(req.query);
    return {
      dados: await planilhaPivot({
        linha: f.linha,
        coluna: f.coluna,
        medida: f.medida,
        ano: f.ano,
        de: f.de,
        ate: f.ate,
        contaId: f.conta_id,
        origemFiltro: f.origem,
        statusFiltro: f.status,
      }),
    };
  });
}
