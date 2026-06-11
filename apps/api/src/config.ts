export const config = {
  databaseUrl:
    process.env.DATABASE_URL ?? "postgres://hallax:hallax@localhost:5432/hallaxos",
  porta: Number(process.env.API_PORT ?? 3333),
  cookieSeguro: process.env.COOKIE_SECURE === "true",
  sessaoDuracaoHoras: 12,
};
