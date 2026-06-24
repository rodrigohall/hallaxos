import { z } from "zod";
import { REFERENCIA_ENTIDADES } from "../enums";

const TIPOS_EVENTO = ["devolucao", "manutencao", "vencimento", "cnh", "documento", "compromisso"] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

export const agendaFiltrosSchema = z.object({
  de: z.string().date(),
  ate: z.string().date(),
  // Filtro opcional de tipo(s): ?tipo=devolucao&tipo=manutencao  (repetição de param)
  // O schema de query do Fastify desserializa arrays automáticamante.
  tipo: z.preprocess(
    (v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]),
    z.array(z.enum(TIPOS_EVENTO)).optional(),
  ),
  // Filtra operações e compromissos pelo responsável autenticado.
  so_meus: z.coerce.boolean().optional(),
});
export type AgendaFiltros = z.infer<typeof agendaFiltrosSchema>;

/** Compromisso manual (única fonte própria da agenda — doc 03 §2). */
export const eventoAgendaCriarSchema = z.object({
  titulo: z.string().trim().min(2, "Dê um título"),
  descricao: z.string().trim().nullish(),
  data_inicio: z.string().datetime({ offset: true }).or(z.string().date()),
  data_fim: z.string().datetime({ offset: true }).or(z.string().date()).nullish(),
  dia_inteiro: z.boolean().default(false),
  // Linkar o compromisso a uma entidade existente (entidade_tipo + entidade_id).
  // A DB já tem as colunas desde a migration 0001 — só estava sem exposição de API.
  entidade_tipo: z.enum(REFERENCIA_ENTIDADES).optional(),
  entidade_id: z.string().uuid().optional(),
  // Gerar um lançamento avulso junto com o compromisso (guard #58: mão única —
  // o evento não cria o lançamento de volta; se o lançamento já existe, use
  // entidade_tipo/entidade_id para linkar).
  gerar_lancamento: z
    .object({
      tipo: z.enum(["receita", "despesa"]),
      descricao: z.string().trim().min(2),
      categoria_id: z.string().uuid(),
      conta_id: z.string().uuid(),
      valor: z.coerce.number().positive(),
      data_vencimento: z.string().date(),
    })
    .optional(),
}).refine(
  (v) => !(v.entidade_tipo && v.gerar_lancamento),
  { message: "Use 'entidade_tipo' para linkar existente OU 'gerar_lancamento' para criar novo — não os dois.", path: ["gerar_lancamento"] },
).refine(
  (v) => !(v.entidade_tipo && !v.entidade_id) && !(v.entidade_id && !v.entidade_tipo),
  { message: "entidade_tipo e entidade_id devem ser informados juntos.", path: ["entidade_id"] },
);
export type EventoAgendaCriarInput = z.infer<typeof eventoAgendaCriarSchema>;
