export const config = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://hallax:hallax@localhost:5432/hallaxos",
  porta: Number(process.env.API_PORT ?? 3333),
  cookieSeguro: process.env.COOKIE_SECURE === "true",
  sessaoDuracaoHoras: 12,
  arquivosDir: process.env.ARQUIVOS_DIR ?? "dados/arquivos",
  uploadMaxBytes: 25 * 1024 * 1024,
  // Copiloto de IA (Sprint 9). Desligado enquanto IA_API_KEY estiver vazia —
  // sem chave, o endpoint responde 503 e nenhuma chamada paga é feita.
  iaApiKey: process.env.IA_API_KEY ?? "",
  iaModelo: process.env.IA_MODELO ?? "claude-opus-4-8",
};
