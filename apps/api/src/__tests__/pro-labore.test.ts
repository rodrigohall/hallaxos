// Pró-labore — a aritmética do acordo salarial.
//
// É a conta que decide quanto sai do caixa para o dono, então erra caro e erra
// em silêncio: um piso aplicado no período em vez de mês a mês infla a comissão
// sem que nada quebre. Estes testes prendem as quatro decisões do acordo.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularParcelas, PARAMETROS_PADRAO, type SaldoMes,
} from "../services/proLabore";
import { pode } from "@hallaxos/shared";

const mes = (mes: string, guincho: number, locacao = 0, fracao = 1): SaldoMes => ({
  mes, fracao, lucroGuincho: guincho, lucroLocacao: locacao,
});

test("mês abaixo do piso não gera comissão de excedente", () => {
  const r = calcularParcelas([mes("2026-08", 6000, 3000)], 0, PARAMETROS_PADRAO);
  assert.equal(r.excedenteTotal, 0);
  assert.equal(r.comissaoExcedente, 0);
  // O fixo continua devido: é fixo.
  assert.equal(r.fixo, 1200);
  assert.equal(r.total, 1200);
});

test("guincho e locação somam no mesmo piso", () => {
  // 7.000 + 5.000 = 12.000 → excedente de 2.000 → 20% = 400.
  const r = calcularParcelas([mes("2026-08", 7000, 5000)], 0, PARAMETROS_PADRAO);
  assert.equal(r.excedenteTotal, 2000);
  assert.equal(r.comissaoExcedente, 400);
  assert.equal(r.total, 1600);
});

test("o piso é mensal: mês forte não cobre o piso do mês fraco", () => {
  // Somados são 24.000 em dois meses. Com piso de período (20.000) daria
  // excedente de 4.000; mês a mês, só o mês de 20.000 passa.
  const r = calcularParcelas(
    [mes("2026-07", 4000), mes("2026-08", 20000)],
    0,
    PARAMETROS_PADRAO
  );
  assert.equal(r.linhas[0]?.excedente, 0);
  assert.equal(r.linhas[1]?.excedente, 10000);
  assert.equal(r.excedenteTotal, 10000);
  assert.equal(r.comissaoExcedente, 2000);
  // Dois meses de fixo.
  assert.equal(r.fixo, 2400);
});

test("prejuízo no mês não vira excedente negativo nem desconta de outro mês", () => {
  const r = calcularParcelas(
    [mes("2026-07", -8000), mes("2026-08", 15000)],
    0,
    PARAMETROS_PADRAO
  );
  assert.equal(r.linhas[0]?.excedente, 0);
  assert.equal(r.excedenteTotal, 5000);
  assert.equal(r.comissaoExcedente, 1000);
});

test("mês parcial rateia fixo e piso pelos dias cobertos", () => {
  // 01/08 a 15/08 = 15 dos 31 dias. Piso vira 10.000 × 15/31 ≈ 4.838,71.
  const fracao = 15 / 31;
  const r = calcularParcelas([mes("2026-08", 6000, 0, fracao)], 0, PARAMETROS_PADRAO);
  assert.equal(r.linhas[0]?.piso, 4838.71);
  assert.equal(r.linhas[0]?.excedente, 1161.29);
  assert.equal(r.comissaoExcedente, 232.26);
  // Fixo proporcional: 1.200 × 15/31 ≈ 580,65.
  assert.equal(r.fixo, 580.65);
});

test("30% incidem sobre o lucro das vendas", () => {
  const r = calcularParcelas([mes("2026-08", 0)], 25000, PARAMETROS_PADRAO);
  assert.equal(r.comissaoVendas, 7500);
  assert.equal(r.total, 8700); // 1.200 + 7.500
});

test("venda no prejuízo não gera comissão negativa", () => {
  const r = calcularParcelas([mes("2026-08", 0)], -5000, PARAMETROS_PADRAO);
  assert.equal(r.comissaoVendas, 0);
  assert.equal(r.total, 1200);
});

test("as três parcelas somam o total", () => {
  const r = calcularParcelas(
    [mes("2026-07", 12000, 3000), mes("2026-08", 9000, 4000)],
    20000,
    PARAMETROS_PADRAO
  );
  assert.equal(r.total, r.fixo + r.comissaoVendas + r.comissaoExcedente);
  // 2 meses de fixo + 30% de 20.000 + 20% de (5.000 + 3.000).
  assert.equal(r.fixo, 2400);
  assert.equal(r.comissaoVendas, 6000);
  assert.equal(r.excedenteTotal, 8000);
  assert.equal(r.comissaoExcedente, 1600);
  assert.equal(r.total, 10000);
});

test("parâmetros alterados mudam a conta sem tocar no código", () => {
  const acordoNovo = { fixoMensal: 2000, pctVenda: 40, pctExcedente: 10, pisoMensal: 15000 };
  const r = calcularParcelas([mes("2026-08", 20000)], 10000, acordoNovo);
  assert.equal(r.fixo, 2000);
  assert.equal(r.comissaoVendas, 4000);
  assert.equal(r.excedenteTotal, 5000);
  assert.equal(r.comissaoExcedente, 500);
});

test("período sem movimento paga só o fixo", () => {
  const r = calcularParcelas([mes("2026-08", 0)], 0, PARAMETROS_PADRAO);
  assert.equal(r.total, 1200);
});

test("pró-labore é visível só para dono e gestão", () => {
  assert.equal(pode("admin", "pro_labore", "ler"), true);
  assert.equal(pode("gestor", "pro_labore", "ler"), true);
  assert.equal(pode("admin", "pro_labore", "editar"), true);
  // Quem lança dinheiro no dia a dia não enxerga o acordo salarial do dono.
  assert.equal(pode("financeiro", "pro_labore", "ler"), false);
  assert.equal(pode("operador", "pro_labore", "ler"), false);
});
