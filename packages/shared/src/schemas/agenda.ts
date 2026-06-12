import { z } from "zod";

export const agendaFiltrosSchema = z.object({
  de: z.string().date(),
  ate: z.string().date(),
});

/** Compromisso manual (única fonte própria da agenda — doc 03 §2). */
export const eventoAgendaCriarSchema = z.object({
  titulo: z.string().trim().min(2, "Dê um título"),
  descricao: z.string().trim().nullish(),
  data_inicio: z.string().datetime({ offset: true }).or(z.string().date()),
  data_fim: z.string().datetime({ offset: true }).or(z.string().date()).nullish(),
  dia_inteiro: z.boolean().default(false),
});
export type EventoAgendaCriarInput = z.infer<typeof eventoAgendaCriarSchema>;
