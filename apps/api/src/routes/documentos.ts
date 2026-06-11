import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { idSchema, REFERENCIA_ENTIDADES, TIPOS_DOCUMENTO } from "@hallaxos/shared";
import {
  criarDocumento, definirFotoPrincipal, excluirDocumento, listarDocumentos,
  obterArquivo, reordenarDocumentos, substituirArquivo,
} from "../services/documentos";
import { exigirLogin, exigirPermissao } from "../plugins/auth";
import { regraNegocio } from "../lib/erros";

const entidadeQuery = z.object({
  entidade_tipo: z.enum(REFERENCIA_ENTIDADES),
  entidade_id: idSchema,
  tipo: z.enum(["foto", "documento"]).optional(),
});

export default async function rotasDocumentos(app: FastifyInstance) {
  app.get("/documentos", { preHandler: exigirPermissao("documentos", "ler") }, async (req) => {
    const q = entidadeQuery.parse(req.query);
    return { dados: await listarDocumentos(q.entidade_tipo, q.entidade_id, q.tipo) };
  });

  // Upload múltiplo: campos do formulário + N arquivos no mesmo multipart
  app.post("/documentos", { preHandler: exigirPermissao("documentos", "criar") }, async (req, reply) => {
    if (!req.isMultipart()) throw regraNegocio("Envie como multipart/form-data.");
    const usuario = exigirLogin(req);

    const campos: Record<string, string> = {};
    const arquivos: Array<{ nome: string; mimeType: string; conteudo: Buffer }> = [];
    for await (const parte of req.parts()) {
      if (parte.type === "file") {
        arquivos.push({
          nome: parte.filename ?? "arquivo",
          mimeType: parte.mimetype,
          conteudo: await parte.toBuffer(),
        });
      } else {
        campos[parte.fieldname] = String(parte.value);
      }
    }

    const meta = z
      .object({
        entidade_tipo: z.enum(REFERENCIA_ENTIDADES),
        entidade_id: idSchema,
        tipo: z.enum(TIPOS_DOCUMENTO).default("outro"),
        data_validade: z.string().date().nullish(),
      })
      .parse(campos);
    if (arquivos.length === 0) throw regraNegocio("Nenhum arquivo enviado.");

    const criados = [];
    for (const a of arquivos) {
      criados.push(
        await criarDocumento(
          {
            entidadeTipo: meta.entidade_tipo,
            entidadeId: meta.entidade_id,
            tipo: meta.tipo,
            nome: a.nome,
            mimeType: a.mimeType,
            conteudo: a.conteudo,
            dataValidade: meta.data_validade ?? null,
          },
          usuario.id
        )
      );
    }
    reply.code(201);
    return { dados: criados };
  });

  app.get(
    "/documentos/:id/arquivo",
    { preHandler: exigirPermissao("documentos", "ler") },
    async (req, reply) => {
      const { id } = z.object({ id: idSchema }).parse(req.params);
      const { baixar } = z.object({ baixar: z.coerce.boolean().default(false) }).parse(req.query);
      const { documento, stream } = await obterArquivo(id);
      reply.header("Content-Type", documento.mimeType);
      reply.header("Cache-Control", "private, max-age=86400");
      if (baixar) {
        reply.header(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(documento.nome)}"`
        );
      }
      return reply.send(stream);
    }
  );

  app.put(
    "/documentos/:id/arquivo",
    { preHandler: exigirPermissao("documentos", "editar") },
    async (req) => {
      if (!req.isMultipart()) throw regraNegocio("Envie como multipart/form-data.");
      const { id } = z.object({ id: idSchema }).parse(req.params);
      const arquivo = await req.file();
      if (!arquivo) throw regraNegocio("Nenhum arquivo enviado.");
      return {
        dados: await substituirArquivo(
          id,
          {
            nome: arquivo.filename ?? "arquivo",
            mimeType: arquivo.mimetype,
            conteudo: await arquivo.toBuffer(),
          },
          exigirLogin(req).id
        ),
      };
    }
  );

  app.post(
    "/documentos/:id/principal",
    { preHandler: exigirPermissao("documentos", "editar") },
    async (req) => {
      const { id } = z.object({ id: idSchema }).parse(req.params);
      await definirFotoPrincipal(id, exigirLogin(req).id);
      return { dados: { ok: true } };
    }
  );

  app.post(
    "/documentos/reordenar",
    { preHandler: exigirPermissao("documentos", "editar") },
    async (req) => {
      const { ids } = z.object({ ids: z.array(idSchema).min(1) }).parse(req.body);
      await reordenarDocumentos(ids);
      return { dados: { ok: true } };
    }
  );

  app.delete(
    "/documentos/:id",
    { preHandler: exigirPermissao("documentos", "arquivar") },
    async (req) => {
      const { id } = z.object({ id: idSchema }).parse(req.params);
      await excluirDocumento(id, exigirLogin(req).id);
      return { dados: { ok: true } };
    }
  );
}
