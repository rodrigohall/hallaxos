import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lancamentoCriarSchema, manutencaoCriarSchema, locacaoCriarSchema,
  guinchoCriarSchema, cpfCnpjSchema,
} from "@hallaxos/shared";

test("lançamento: parcelas default 1 e limite 60", () => {
  const ok = lancamentoCriarSchema.parse({
    tipo: "receita", descricao: "Teste", categoria_id: crypto.randomUUID(),
    conta_id: crypto.randomUUID(), valor: 100, data_vencimento: "2026-06-30",
  });
  assert.equal(ok.parcelas, 1);
  assert.throws(() => lancamentoCriarSchema.parse({
    tipo: "receita", descricao: "X", categoria_id: crypto.randomUUID(),
    conta_id: crypto.randomUUID(), valor: 1, data_vencimento: "2026-06-30", parcelas: 61,
  }));
});

test("lançamento: valor deve ser positivo", () => {
  assert.throws(() => lancamentoCriarSchema.parse({
    tipo: "despesa", descricao: "X", categoria_id: crypto.randomUUID(),
    conta_id: crypto.randomUUID(), valor: 0, data_vencimento: "2026-06-30",
  }));
});

test("manutenção exige ativo, tipo e descrição", () => {
  assert.throws(() => manutencaoCriarSchema.parse({ tipo: "revisao", descricao: "ok" }));
  const ok = manutencaoCriarSchema.parse({
    ativo_id: crypto.randomUUID(), tipo: "revisao", descricao: "Revisão 30k",
  });
  assert.equal(ok.tipo, "revisao");
});

test("locação exige diária positiva e devolução prevista", () => {
  assert.throws(() => locacaoCriarSchema.parse({
    cliente_id: crypto.randomUUID(), ativo_id: crypto.randomUUID(),
    valor_diaria: 0, data_devolucao_prevista: "2026-07-01",
  }));
});

test("guincho exige origem e destino", () => {
  assert.throws(() => guinchoCriarSchema.parse({
    cliente_id: crypto.randomUUID(), origem_endereco: "ab",
    destino_endereco: "Oficina", veiculo_cliente_descricao: "Gol",
  }));
});

test("CPF/CNPJ normaliza e valida tamanho", () => {
  assert.equal(cpfCnpjSchema.parse("390.533.447-05"), "39053344705");
  assert.throws(() => cpfCnpjSchema.parse("123"));
});
