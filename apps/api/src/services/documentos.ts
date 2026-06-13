// Documentos e fotos: serviço transversal de anexos (doc 04 §5).
// Arquivos no disco com path imutável; metadados no banco; tudo na timeline.
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { ReferenciaEntidade, TipoDocumento } from "@hallaxos/shared";
import { db } from "../db/client";
import { documentos } from "../db/schema";
import { novoId } from "../lib/ids";
import { naoEncontrado, regraNegocio } from "../lib/erros";
import { registrarEvento } from "./timeline";
import { validarReferencia } from "./refTransversal";
import { indexar, removerDoIndice } from "./busca";
import { config } from "../config";

// Formatos aceitos. Mapeamos por tipo MIME canônico e também por extensão,
// porque celulares e vários navegadores enviam o arquivo como
// "application/octet-stream" (ou um MIME genérico) — nesses casos a extensão
// do nome é a única pista confiável. Sem este fallback, fotos e PDFs legítimos
// eram recusados com "Formato não aceito".
const FORMATOS: Record<string, { mime: string; ext: string }> = {
  "application/pdf": { mime: "application/pdf", ext: ".pdf" },
  "image/jpeg": { mime: "image/jpeg", ext: ".jpg" },
  "image/jpg": { mime: "image/jpeg", ext: ".jpg" },
  "image/png": { mime: "image/png", ext: ".png" },
  "image/webp": { mime: "image/webp", ext: ".webp" },
  "image/gif": { mime: "image/gif", ext: ".gif" },
  "image/heic": { mime: "image/heic", ext: ".heic" },
  "image/heif": { mime: "image/heif", ext: ".heif" },
};
const FORMATOS_POR_EXT: Record<string, { mime: string; ext: string }> = {
  ".pdf": { mime: "application/pdf", ext: ".pdf" },
  ".jpg": { mime: "image/jpeg", ext: ".jpg" },
  ".jpeg": { mime: "image/jpeg", ext: ".jpg" },
  ".png": { mime: "image/png", ext: ".png" },
  ".webp": { mime: "image/webp", ext: ".webp" },
  ".gif": { mime: "image/gif", ext: ".gif" },
  ".heic": { mime: "image/heic", ext: ".heic" },
  ".heif": { mime: "image/heif", ext: ".heif" },
};

/**
 * Identifica o formato pelos magic bytes do conteúdo — a pista mais confiável,
 * independente de MIME e de extensão. Resolve o caso de celulares que enviam
 * "application/octet-stream" com nome sem extensão (ex.: "image", "blob").
 */
function sniffFormato(b: Buffer): { mime: string; ext: string } | null {
  if (b.length < 12) return null;
  // PDF: "%PDF"
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46)
    return { mime: "application/pdf", ext: ".pdf" };
  // JPEG: FF D8 FF
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  // PNG: 89 50 4E 47
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return { mime: "image/png", ext: ".png" };
  // GIF: "GIF8"
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38)
    return { mime: "image/gif", ext: ".gif" };
  // RIFF....WEBP
  const ascii = b.toString("ascii", 0, 12);
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP")
    return { mime: "image/webp", ext: ".webp" };
  // ISO-BMFF "ftyp" (HEIC/HEIF) — marca em bytes 4..8
  if (b.toString("ascii", 4, 8) === "ftyp") {
    const marca = b.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "hevc", "heif", "mif1", "msf1"].includes(marca))
      return { mime: "image/heic", ext: ".heic" };
  }
  return null;
}

/** Resolve o formato pelo MIME, depois pela extensão e por fim pelos magic bytes. */
function resolverFormato(nome: string, mimeType: string, conteudo: Buffer): { mime: string; ext: string } {
  const porMime = FORMATOS[mimeType.toLowerCase()];
  if (porMime) return porMime;
  const porExt = FORMATOS_POR_EXT[extname(nome).toLowerCase()];
  if (porExt) return porExt;
  const porConteudo = sniffFormato(conteudo);
  if (porConteudo) return porConteudo;
  throw regraNegocio("Formato não aceito. Envie PDF, JPG, PNG, WEBP, GIF ou HEIC.");
}

export interface NovoDocumento {
  entidadeTipo: ReferenciaEntidade;
  entidadeId: string;
  tipo: TipoDocumento;
  nome: string;
  mimeType: string;
  conteudo: Buffer;
  dataValidade?: string | null;
}

// Grava o arquivo no disco e devolve o caminho + o MIME canônico (que pode
// diferir do enviado quando o cliente mandou um MIME genérico).
async function gravarArquivo(id: string, nome: string, mimeType: string, conteudo: Buffer) {
  if (conteudo.length === 0) throw regraNegocio("Arquivo vazio.");
  if (conteudo.length > config.uploadMaxBytes) {
    throw regraNegocio("Arquivo maior que 25 MB.");
  }
  const formato = resolverFormato(nome, mimeType, conteudo);
  const pasta = join(config.arquivosDir, id.slice(0, 2));
  try {
    await mkdir(pasta, { recursive: true });
    const caminho = join(pasta, `${id}${formato.ext}`);
    await writeFile(caminho, conteudo);
    return { caminho, mime: formato.mime };
  } catch (e) {
    // Disco cheio / permissão: erro claro em vez de 500 genérico
    const cod = (e as NodeJS.ErrnoException)?.code;
    throw regraNegocio(
      cod === "EACCES" || cod === "EROFS"
        ? "Sem permissão para gravar o arquivo no servidor (volume de dados)."
        : cod === "ENOSPC"
          ? "Sem espaço em disco no servidor para gravar o arquivo."
          : "Falha ao gravar o arquivo no servidor."
    );
  }
}

export async function criarDocumento(d: NovoDocumento, usuarioId: string) {
  await validarReferencia(db, d.entidadeTipo, d.entidadeId);
  const id = novoId();
  const { caminho, mime } = await gravarArquivo(id, d.nome, d.mimeType, d.conteudo);

  return db.transaction(async (tx) => {
    const [{ proximaOrdem }] = (
      await tx.execute(sql`
        SELECT coalesce(max(ordem) + 1, 0)::int AS "proximaOrdem" FROM documentos
        WHERE entidade_tipo = ${d.entidadeTipo} AND entidade_id = ${d.entidadeId}`)
    ).rows as [{ proximaOrdem: number }];

    const [criado] = await tx
      .insert(documentos)
      .values({
        id,
        entidadeTipo: d.entidadeTipo,
        entidadeId: d.entidadeId,
        tipo: d.tipo,
        nome: d.nome,
        arquivoPath: caminho,
        mimeType: mime,
        tamanhoBytes: d.conteudo.length,
        dataValidade: d.dataValidade ?? null,
        ordem: proximaOrdem,
        usuarioId,
      })
      .returning();

    await registrarEvento(tx, {
      entidadeTipo: d.entidadeTipo,
      entidadeId: d.entidadeId,
      evento: "documento_anexado",
      descricao: d.tipo === "foto" ? `Foto "${d.nome}" adicionada` : `Documento "${d.nome}" anexado`,
      usuarioId,
    });
    if (d.tipo !== "foto") {
      await indexar(tx, {
        entidadeTipo: "documento",
        entidadeId: id,
        titulo: d.nome,
        subtitulo: `Documento · ${d.tipo}`,
        termos: [d.nome, d.tipo],
      });
    }
    return criado!;
  });
}

export async function listarDocumentos(
  entidadeTipo: ReferenciaEntidade,
  entidadeId: string,
  tipo?: "foto" | "documento"
) {
  const filtros = [
    eq(documentos.entidadeTipo, entidadeTipo),
    eq(documentos.entidadeId, entidadeId),
    isNull(documentos.deletedAt),
  ];
  const linhas = await db
    .select()
    .from(documentos)
    .where(and(...filtros))
    .orderBy(desc(documentos.principal), asc(documentos.ordem), asc(documentos.createdAt));
  if (tipo === "foto") return linhas.filter((d) => d.tipo === "foto");
  if (tipo === "documento") return linhas.filter((d) => d.tipo !== "foto");
  return linhas;
}

export async function obterArquivo(id: string) {
  const [d] = await db
    .select()
    .from(documentos)
    .where(and(eq(documentos.id, id), isNull(documentos.deletedAt)));
  if (!d || !existsSync(d.arquivoPath)) throw naoEncontrado("Arquivo");
  return { documento: d, stream: createReadStream(d.arquivoPath) };
}

export async function substituirArquivo(
  id: string,
  novo: { nome: string; mimeType: string; conteudo: Buffer },
  usuarioId: string
) {
  const [d] = await db
    .select()
    .from(documentos)
    .where(and(eq(documentos.id, id), isNull(documentos.deletedAt)));
  if (!d) throw naoEncontrado("Documento");

  const { caminho, mime } = await gravarArquivo(novoId(), novo.nome, novo.mimeType, novo.conteudo);
  const caminhoAntigo = d.arquivoPath;

  const atualizado = await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(documentos)
      .set({
        nome: novo.nome,
        arquivoPath: caminho,
        mimeType: mime,
        tamanhoBytes: novo.conteudo.length,
      })
      .where(eq(documentos.id, id))
      .returning();
    await registrarEvento(tx, {
      entidadeTipo: d.entidadeTipo,
      entidadeId: d.entidadeId,
      evento: "atualizado",
      descricao: `Documento "${d.nome}" substituído por "${novo.nome}"`,
      usuarioId,
    });
    if (d.tipo !== "foto") {
      await indexar(tx, {
        entidadeTipo: "documento",
        entidadeId: id,
        titulo: novo.nome,
        subtitulo: `Documento · ${d.tipo}`,
        termos: [novo.nome, d.tipo],
      });
    }
    return linha!;
  });
  await unlink(caminhoAntigo).catch(() => {});
  return atualizado;
}

export async function excluirDocumento(id: string, usuarioId: string) {
  const [d] = await db
    .select()
    .from(documentos)
    .where(and(eq(documentos.id, id), isNull(documentos.deletedAt)));
  if (!d) throw naoEncontrado("Documento");

  await db.transaction(async (tx) => {
    await tx.update(documentos).set({ deletedAt: new Date(), principal: false }).where(eq(documentos.id, id));
    await registrarEvento(tx, {
      entidadeTipo: d.entidadeTipo,
      entidadeId: d.entidadeId,
      evento: "atualizado",
      descricao: d.tipo === "foto" ? `Foto "${d.nome}" removida` : `Documento "${d.nome}" removido`,
      usuarioId,
    });
    await removerDoIndice(tx, "documento", id);
  });
}

export async function definirFotoPrincipal(id: string, usuarioId: string) {
  const [d] = await db
    .select()
    .from(documentos)
    .where(and(eq(documentos.id, id), isNull(documentos.deletedAt)));
  if (!d || d.tipo !== "foto") throw naoEncontrado("Foto");

  await db.transaction(async (tx) => {
    await tx
      .update(documentos)
      .set({ principal: false })
      .where(and(eq(documentos.entidadeTipo, d.entidadeTipo), eq(documentos.entidadeId, d.entidadeId)));
    await tx.update(documentos).set({ principal: true }).where(eq(documentos.id, id));
    await registrarEvento(tx, {
      entidadeTipo: d.entidadeTipo,
      entidadeId: d.entidadeId,
      evento: "atualizado",
      descricao: `Foto "${d.nome}" definida como principal`,
      usuarioId,
    });
  });
}

export async function reordenarDocumentos(ids: string[]) {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(documentos).set({ ordem: i }).where(eq(documentos.id, ids[i]!));
    }
  });
}
