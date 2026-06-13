import { test } from "node:test";
import assert from "node:assert/strict";
import { proximasTransicoes } from "../services/operacoes";
import { proximasTransicoesManutencao } from "../services/manutencoes";

test("locação avança um passo por vez + cancelar", () => {
  assert.deepEqual(proximasTransicoes("locacao", "orcamento"), ["reservada", "cancelada"]);
  assert.deepEqual(proximasTransicoes("locacao", "reservada"), ["ativa", "cancelada"]);
  assert.deepEqual(proximasTransicoes("locacao", "ativa"), ["finalizada", "cancelada"]);
});

test("estados terminais não têm transições", () => {
  assert.deepEqual(proximasTransicoes("locacao", "finalizada"), []);
  assert.deepEqual(proximasTransicoes("guincho", "concluido"), []);
  assert.deepEqual(proximasTransicoes("venda", "concluida"), []);
  assert.deepEqual(proximasTransicoes("locacao", "cancelada"), []);
});

test("guincho e compra/venda seguem o próprio fluxo", () => {
  assert.deepEqual(proximasTransicoes("guincho", "solicitado"), ["a_caminho", "cancelada"]);
  assert.deepEqual(proximasTransicoes("venda", "negociacao"), ["fechada", "cancelada"]);
  assert.deepEqual(proximasTransicoes("compra", "fechada"), ["concluida", "cancelada"]);
});

test("manutenção: agendada → em_andamento → concluida", () => {
  assert.deepEqual(proximasTransicoesManutencao("agendada"), ["em_andamento", "cancelada"]);
  assert.deepEqual(proximasTransicoesManutencao("em_andamento"), ["concluida", "cancelada"]);
  assert.deepEqual(proximasTransicoesManutencao("concluida"), []);
});
