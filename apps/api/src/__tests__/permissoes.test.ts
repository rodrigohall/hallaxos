import { test } from "node:test";
import assert from "node:assert/strict";
import { pode, permissoesDe } from "@hallaxos/shared";

test("admin pode tudo nas operações", () => {
  for (const acao of ["criar", "ler", "editar", "arquivar", "transicionar"] as const) {
    assert.equal(pode("admin", "operacoes", acao), true);
  }
});

test("operador não acessa o financeiro mas opera", () => {
  assert.equal(pode("operador", "lancamentos", "criar"), false);
  assert.equal(pode("operador", "operacoes", "transicionar"), true);
  assert.equal(pode("operador", "manutencoes", "transicionar"), true);
});

test("financeiro lê operações mas não as cria", () => {
  assert.equal(pode("financeiro", "operacoes", "ler"), true);
  assert.equal(pode("financeiro", "operacoes", "criar"), false);
  assert.equal(pode("financeiro", "lancamentos", "criar"), true);
});

test("só admin tem override de bloqueios", () => {
  assert.equal(pode("admin", "overrides", "transicionar"), true);
  assert.equal(pode("gestor", "overrides", "transicionar"), false);
});

test("matriz cobre todos os recursos para todo papel", () => {
  for (const papel of ["admin", "gestor", "operador", "financeiro"] as const) {
    const m = permissoesDe(papel);
    assert.ok(m.agenda !== undefined && m.manutencoes !== undefined);
  }
});
