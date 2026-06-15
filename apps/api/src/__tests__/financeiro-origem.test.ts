import { test } from "node:test";
import assert from "node:assert/strict";
import { transicaoSchema, pessoaCriarSchema, PAPEIS_PESSOA } from "@hallaxos/shared";
import { montarParcelas, type GerarLancamentos } from "../services/origemFinanceira";

const baseOrigem: Omit<GerarLancamentos, "parcelas" | "plano"> = {
  origem: { operacaoId: crypto.randomUUID() },
  entidade: { tipo: "operacao", id: crypto.randomUUID() },
  tipo: "receita",
  categoriaNome: "Locação",
  descricao: "Locação OP-0001",
  valor: 100,
};

test("padrão: N parcelas mensais somam o total (sobra na 1ª)", () => {
  const p = montarParcelas({ ...baseOrigem, valor: 100, parcelas: 3 });
  assert.equal(p.length, 3);
  assert.equal(p.reduce((s, x) => s + x.valorCent, 0), 10000);
  assert.equal(p[0]!.valorCent, 3334); // 3334 + 3333 + 3333 = 10000
  assert.equal(p[1]!.valorCent, 3333);
});

test("plano só com datas: rateia o total nas datas informadas", () => {
  const p = montarParcelas({
    ...baseOrigem, valor: 90, parcelas: 1,
    plano: [{ dataVencimento: "2026-07-10" }, { dataVencimento: "2026-08-10" }],
  });
  assert.equal(p.length, 2);
  assert.deepEqual(p.map((x) => x.dataVencimento), ["2026-07-10", "2026-08-10"]);
  assert.equal(p.reduce((s, x) => s + x.valorCent, 0), 9000);
});

test("plano com valores que batem com o total é aceito", () => {
  const p = montarParcelas({
    ...baseOrigem, valor: 100, parcelas: 1,
    plano: [{ dataVencimento: "2026-07-10", valor: 60 }, { dataVencimento: "2026-08-10", valor: 40 }],
  });
  assert.deepEqual(p.map((x) => x.valorCent), [6000, 4000]);
});

test("plano com valores que NÃO batem é rejeitado", () => {
  assert.throws(() => montarParcelas({
    ...baseOrigem, valor: 100, parcelas: 1,
    plano: [{ dataVencimento: "2026-07-10", valor: 60 }, { dataVencimento: "2026-08-10", valor: 30 }],
  }), /não confere com o total/);
});

test("transição aceita bloco financeiro opcional e mantém retrocompatibilidade", () => {
  const semFinanceiro = transicaoSchema.parse({ status: "finalizada" });
  assert.equal(semFinanceiro.parcelas, 1);
  assert.equal(semFinanceiro.financeiro, undefined);

  const comFinanceiro = transicaoSchema.parse({
    status: "finalizada",
    financeiro: {
      conta_id: crypto.randomUUID(),
      forma_pagamento: "pix",
      parcelas: [{ data_vencimento: "2026-07-10" }, { data_vencimento: "2026-08-10" }],
    },
  });
  assert.equal(comFinanceiro.financeiro?.parcelas.length, 2);
  assert.equal(comFinanceiro.financeiro?.forma_pagamento, "pix");
});

test("oficina é papel de pessoa e eh_oficina entra no schema", () => {
  assert.ok(PAPEIS_PESSOA.includes("oficina"));
  const p = pessoaCriarSchema.parse({
    tipo: "pj", nome: "Auto Center Silva", cpf_cnpj: "11444777000161", eh_oficina: true,
  });
  assert.equal(p.eh_oficina, true);
});
