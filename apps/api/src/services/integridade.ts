// Detector de referências órfãs (doc 04 §0, ponto 3). As referências transversais
// (entidade_tipo + entidade_id) não têm FK no banco; a integridade é da aplicação.
// Este job varre as tabelas que as usam e conta referências que apontam para um
// registro inexistente. Deve encontrar SEMPRE zero — é um detector de bug, não
// uma rotina de limpeza (não apaga nada; só alerta no log).
import { sql } from "drizzle-orm";
import { db } from "../db/client";

// Tipos do NÚCLEO, que nunca sofrem hard delete (soft delete mantém a linha, então
// a referência continua resolvível — doc 04 §0 ponto 2). 'documento' fica de fora:
// anexo admite exclusão permanente, então uma referência a um documento apagado é
// esperada, não um bug — incluí-lo geraria falso positivo.
const ALVO: Record<string, string> = {
  pessoa: "pessoas",
  ativo: "ativos",
  operacao: "operacoes",
  manutencao: "manutencoes",
  lancamento: "lancamentos",
  usuario: "usuarios",
};

// Tabelas que carregam referência transversal (entidade_tipo + entidade_id).
const FONTES = [
  "timeline", "documentos", "comentarios", "notificacoes",
  "eventos_agenda", "tags_vinculos", "favoritos",
] as const;

export interface Orfao {
  fonte: string;
  entidade_tipo: string;
  orfaos: number;
}

/** Conta referências órfãs por (tabela de origem, tipo de entidade). */
export async function detectarOrfaos(): Promise<{ total: number; detalhes: Orfao[] }> {
  const detalhes: Orfao[] = [];
  for (const fonte of FONTES) {
    for (const [tipo, alvo] of Object.entries(ALVO)) {
      const r = await db.execute(sql`
        SELECT count(*)::int AS n
        FROM ${sql.identifier(fonte)} s
        WHERE s.entidade_tipo = ${tipo}
          AND s.entidade_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM ${sql.identifier(alvo)} t WHERE t.id = s.entidade_id)`);
      const n = Number((r.rows[0] as { n: number }).n);
      if (n > 0) detalhes.push({ fonte, entidade_tipo: tipo, orfaos: n });
    }
  }
  return { total: detalhes.reduce((s, d) => s + d.orfaos, 0), detalhes };
}

/** Wrapper do job agendado: roda o detector e alerta no log se achar algo. */
export async function jobReferenciasOrfas(log: {
  info: (m: string) => void;
  warn: (m: string) => void;
}): Promise<void> {
  const { total, detalhes } = await detectarOrfaos();
  if (total === 0) {
    log.info("Integridade: 0 referências órfãs.");
  } else {
    log.warn(`Integridade: ${total} referência(s) órfã(s) detectada(s): ${JSON.stringify(detalhes)}`);
  }
}
