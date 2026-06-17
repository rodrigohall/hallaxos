export const config = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://hallax:hallax@localhost:5432/hallaxos",
  porta: Number(process.env.API_PORT ?? 3333),
  cookieSeguro: process.env.COOKIE_SECURE === "true",
  // CORS restritivo: por padrão NENHUMA origem cruzada (front e API são
  // same-origin atrás do Caddy em produção e do proxy do Vite em dev — não há
  // chamada cross-origin legítima). Para liberar origens específicas, defina
  // CORS_ORIGINS (lista separada por vírgula). Lista vazia = fechado.
  corsOrigins: (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sessaoDuracaoHoras: 12,
  arquivosDir: process.env.ARQUIVOS_DIR ?? "dados/arquivos",
  uploadMaxBytes: 25 * 1024 * 1024,
  // Copiloto de IA (Sprint 9). Desligado enquanto IA_API_KEY estiver vazia —
  // sem chave, o endpoint responde 503 e nenhuma chamada paga é feita.
  // Padrão Haiku 4.5 (mais barato/rápido); troque por IA_MODELO sem mexer no
  // código (a requisição é model-agnostic, sem thinking/effort — decisão #46).
  iaApiKey: process.env.IA_API_KEY ?? "",
  iaModelo: process.env.IA_MODELO ?? "claude-haiku-4-5",
};
