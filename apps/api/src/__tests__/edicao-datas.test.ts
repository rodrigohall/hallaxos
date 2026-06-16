import { test, after } from "node:test";
import assert from "node:assert/strict";
import {
  lancamentoEditarSchema, manutencaoEditarSchema, operacaoEditarSchema,
  guinchoCriarSchema, transicaoSchema,
} from "@hallaxos/shared";
import { pool } from "../db/client";
import { AppError } from "../lib/erros";

// ── Pure: os contratos novos aceitam edição depois de lançado + datas retroativas ──

test("lancamentoEditarSchema aceita data_pagamento e forma_pagamento", () => {
  const r = lancamentoEditarSchema.parse({ valor: 10, data_pagamento: "2026-05-01", forma_pagamento: "pix" });
  assert.equal(r.valor, 10);
  assert.equal(r.data_pagamento, "2026-05-01");
});

test("manutencaoEditarSchema aceita datas de início/conclusão e km (retroativo)", () => {
  const r = manutencaoEditarSchema.parse({ data_inicio: "2026-05-01", data_conclusao: "2026-05-02", km_no_momento: 1000 });
  assert.equal(r.data_inicio, "2026-05-01");
  assert.equal(r.km_no_momento, 1000);
});

test("operacaoEditarSchema parseia descritivos + datas", () => {
  const r = operacaoEditarSchema.parse({ observacoes: "x", data_inicio: "2026-05-01", data_fim: "2026-05-02" });
  assert.equal(r.data_fim, "2026-05-02");
});

test("create de operação aceita data_inicio (retroativo) e transição aceita data", () => {
  const g = guinchoCriarSchema.parse({
    cliente_id: "00000000-0000-0000-0000-000000000001",
    origem_endereco: "Rua A", destino_endereco: "Rua B",
    veiculo_cliente_descricao: "Carro", data_inicio: "2026-01-10",
  });
  assert.equal(g.data_inicio, "2026-01-10");
  const t = transicaoSchema.parse({ status: "finalizada", data: "2026-01-15" });
  assert.equal(t.data, "2026-01-15");
});

// ── Integração (gated): exercita o comportamento real contra um Postgres ──
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("edição/datas (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  const { criarManutencao, iniciarManutencao, concluirManutencao } = await import("../services/manutencoes");
  const { criarConta, criarCategoriaFinanceira, criarLancamento, editarLancamento } = await import("../services/financeiro");
  const { criarGuincho, editarOperacao } = await import("../services/operacoes");

  after(async () => {
    await pool.end();
  });

  const userId = crypto.randomUUID();
  const cpf = crypto.randomUUID().replace(/-/g, "").slice(0, 11);

  async function semear() {
    await pool.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, papel, ativo) VALUES ($1,'Teste',$2,'x','admin',true)`,
      [userId, `t-${userId}@x.com`]
    );
  }

  // Bug reportado: iniciar a manutenção dava "erro interno". A causa era ler o
  // registro DENTRO da transação aberta; agora lê após o commit. Este teste
  // exercita iniciar → em_andamento sem erro (e a conclusão retroativa).
  test("manutenção: agendar → iniciar (sem erro) → concluir com data retroativa", async () => {
    await semear();
    const catId = crypto.randomUUID();
    const ativoId = crypto.randomUUID();
    await pool.query(`INSERT INTO ativo_categorias (id, nome, eh_veicular) VALUES ($1,'Cat',false)`, [catId]);
    await pool.query(`INSERT INTO ativos (id, categoria_id, nome, status) VALUES ($1,$2,'Ativo','disponivel')`, [ativoId, catId]);

    const manut = await criarManutencao(
      { ativo_id: ativoId, tipo: "preventiva", descricao: "Revisão teste", fornecedor_id: null, data_agendada: null, observacoes: null },
      userId
    );
    const iniciada = await iniciarManutencao(manut.id, userId, "2026-05-01");
    assert.equal((iniciada as unknown as { status: string }).status, "em_andamento");

    const concluida = await concluirManutencao(
      manut.id, { parcelas: 1, custo: null, km_no_momento: null, data_conclusao: "2026-05-02", observacoes: null },
      userId
    );
    assert.equal((concluida as unknown as { status: string }).status, "concluida");
  });

  // Editar um lançamento JÁ PAGO reescreve indicadores → só admin (decisão #48).
  test("financeiro: editar lançamento pago é negado a não-admin e permitido ao admin", async () => {
    const conta = await criarConta("Caixa Teste", 0);
    const cat = await criarCategoriaFinanceira("Cat Teste", "despesa");
    const lancs = await criarLancamento(
      {
        tipo: "despesa", descricao: "Pago teste", categoria_id: cat.id, conta_id: conta.id,
        pessoa_id: null, valor: 100, data_vencimento: "2026-05-01", data_pagamento: "2026-05-01",
        parcelas: 1, pago: true, forma_pagamento: "pix",
      },
      userId
    );
    const l = lancs[0]!;
    assert.equal(l.status, "pago");

    await assert.rejects(
      () => editarLancamento(l.id, { valor: 200 }, { id: userId, papel: "operador" }),
      (e: unknown) => e instanceof AppError && e.status === 403
    );
    const editado = await editarLancamento(l.id, { valor: 200 }, { id: userId, papel: "admin" });
    assert.equal(Number(editado.valor), 200);
  });

  // Operação editável depois de lançada: descritivos + datas (decisão #49).
  test("operação: criar guincho e editar observações/datas depois", async () => {
    const pessoaId = crypto.randomUUID();
    await pool.query(`INSERT INTO pessoas (id, tipo, nome, cpf_cnpj) VALUES ($1,'pf','Cliente',$2)`, [pessoaId, cpf]);
    const op = await criarGuincho(
      {
        cliente_id: pessoaId, origem_endereco: "Rua A", destino_endereco: "Rua B",
        veiculo_cliente_descricao: "Carro", veiculo_cliente_placa: undefined, caminhao_id: null,
        motorista_id: null, valor_total: 100, observacoes: undefined, data_inicio: "2026-05-01",
      },
      userId
    );
    const editada = await editarOperacao(op.id, { observacoes: "corrigido", data_inicio: "2026-04-01" }, userId);
    assert.equal((editada as { observacoes: string | null }).observacoes, "corrigido");
  });
}
