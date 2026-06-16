import { test } from "node:test";
import assert from "node:assert/strict";
import { criarApp } from "../app";

// Regressão: o frontend (api.ts) manda `Content-Type: application/json` em TODA
// requisição, inclusive POSTs sem corpo (iniciar manutenção) e DELETEs. O parser
// JSON padrão do Fastify rejeita corpo vazio (FST_ERR_CTP_EMPTY_JSON_BODY, 400) e
// o nosso error handler convertia qualquer não-AppError/ZodError em 500 "Erro
// interno" — então "Iniciar" e "Excluir foto" falhavam 100% das vezes pela UI,
// mas passavam quando testados com `curl -d '{...}'` (com corpo). Sem banco:
// basta o app inicializar; estes casos não chegam ao serviço (param antes, na
// autenticação), então exercitam só o parser + error handler.
test("corpo JSON vazio não vira 500 (parser aceita vazio como undefined)", async () => {
  const app = criarApp();
  await app.ready();
  try {
    // POST com content-type json e sem corpo: não pode ser 500.
    const post = await app.inject({
      method: "POST",
      url: "/api/v1/manutencoes/00000000-0000-0000-0000-000000000000/iniciar",
      headers: { "content-type": "application/json" },
    });
    assert.notEqual(post.statusCode, 500, `POST sem corpo virou 500: ${post.body}`);

    // DELETE com content-type json e sem corpo: mesmo contrato.
    const del = await app.inject({
      method: "DELETE",
      url: "/api/v1/documentos/00000000-0000-0000-0000-000000000000?permanente=true",
      headers: { "content-type": "application/json" },
    });
    assert.notEqual(del.statusCode, 500, `DELETE sem corpo virou 500: ${del.body}`);

    // JSON malformado continua sendo erro do cliente (400), nunca 500.
    const ruim = await app.inject({
      method: "POST",
      url: "/api/v1/manutencoes/00000000-0000-0000-0000-000000000000/iniciar",
      headers: { "content-type": "application/json" },
      payload: "{nao-e-json",
    });
    assert.equal(ruim.statusCode, 400, `JSON inválido deveria ser 400: ${ruim.body}`);
  } finally {
    await app.close();
  }
});
