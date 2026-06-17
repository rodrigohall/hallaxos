import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Item 5: invariante "objeto único" (doc 03 §3, via trigger) e detector de
// referências órfãs (doc 04 §0). Ambos exigem SQL real → integração gated.
const temBanco = !!process.env.DATABASE_URL;

if (!temBanco) {
  test("integridade (integração) — pulado sem DATABASE_URL", { skip: true }, () => {});
} else {
  const { detectarOrfaos } = await import("../services/integridade");
  const { db, pool } = await import("../db/client");
  const { usuarios, ativos, ativoCategorias, pessoas, operacoes, favoritos } =
    await import("../db/schema");
  const { sql, eq } = await import("drizzle-orm");
  const { novoId } = await import("../lib/ids");

  let usuarioId = "", ativoId = "", clienteId = "";

  before(async () => {
    usuarioId = novoId();
    await db.insert(usuarios).values({
      id: usuarioId, nome: "Teste Integridade", email: `integ-${usuarioId}@t.com`,
      senhaHash: "x", papel: "admin",
    });
    const cat = novoId();
    await db.insert(ativoCategorias).values({ id: cat, nome: `Cat ${cat}`, ehVeicular: true });
    ativoId = novoId();
    await db.insert(ativos).values({ id: ativoId, codigo: `AT-I-${ativoId.slice(-8)}`, categoriaId: cat, nome: "Ativo Integridade" });
    clienteId = novoId();
    await db.insert(pessoas).values({ id: clienteId, tipo: "pf", nome: "Cliente Integridade", cpfCnpj: `cpf-${clienteId}` });
  });

  after(async () => {
    await pool.end();
  });

  async function criarOp(status: string) {
    const id = novoId();
    await db.insert(operacoes).values({
      id, codigo: `OP-I-${id.slice(-8)}`, tipo: "locacao", clienteId,
      responsavelId: usuarioId, status: status as never,
    });
    return id;
  }
  const vincularObjeto = (opId: string) =>
    db.execute(sql`INSERT INTO operacao_ativos (operacao_id, ativo_id, papel) VALUES (${opId}, ${ativoId}, 'objeto')`);

  test("objeto único: o mesmo ativo não pode ser objeto de duas operações não-terminais", async () => {
    const op1 = await criarOp("reservada");
    const op2 = await criarOp("reservada");
    await vincularObjeto(op1); // ok
    await assert.rejects(
      () => vincularObjeto(op2),
      (e: unknown) => {
        const err = e as { code?: string; message?: string };
        assert.ok(err.code === "23505" || /não-terminal/.test(err.message ?? ""), "deve bloquear o 2º objeto");
        return true;
      }
    );
    // Com a 1ª operação terminal, o ativo fica livre para ser objeto de novo.
    await db.update(operacoes).set({ status: "finalizada" }).where(eq(operacoes.id, op1));
    await vincularObjeto(op2); // agora passa
  });

  test("detector de órfãs: pega uma referência transversal para um id inexistente", async () => {
    const fantasma = novoId(); // ativo que não existe
    await db.insert(favoritos).values({ usuarioId, entidadeTipo: "ativo", entidadeId: fantasma });
    const { total, detalhes } = await detectarOrfaos();
    assert.ok(total >= 1, "deve achar ao menos a órfã inserida");
    assert.ok(
      detalhes.some((d) => d.fonte === "favoritos" && d.entidade_tipo === "ativo" && d.orfaos >= 1),
      "a órfã deve ser atribuída a favoritos/ativo"
    );
    // Limpa a órfã para não poluir outras rodadas no mesmo banco.
    await db.delete(favoritos).where(eq(favoritos.entidadeId, fantasma));
  });
}
