// Fonte única dos vocabulários do HallaxOS (doc 02 e doc 04 §0).
// Os enums do Postgres são criados a partir destes mesmos valores.

export const PAPEIS_USUARIO = ["admin", "gestor", "operador", "financeiro"] as const;
export type PapelUsuario = (typeof PAPEIS_USUARIO)[number];

export const TIPOS_PESSOA = ["pf", "pj"] as const;
export type TipoPessoa = (typeof TIPOS_PESSOA)[number];

export const PAPEIS_PESSOA = ["cliente", "fornecedor", "motorista", "parceiro", "oficina"] as const;
export type PapelPessoa = (typeof PAPEIS_PESSOA)[number];

export const REFERENCIA_ENTIDADES = [
  "pessoa", "ativo", "operacao", "manutencao", "lancamento", "documento", "usuario",
] as const;
export type ReferenciaEntidade = (typeof REFERENCIA_ENTIDADES)[number];

export const STATUS_ATIVO = [
  "disponivel", "reservado", "alugado", "em_manutencao", "em_uso_interno", "vendido", "baixado",
] as const;
export type StatusAtivo = (typeof STATUS_ATIVO)[number];

export const TIPOS_OPERACAO = ["guincho", "locacao", "venda", "compra"] as const;
export type TipoOperacao = (typeof TIPOS_OPERACAO)[number];

export const STATUS_OPERACAO = [
  // locação
  "orcamento", "reservada", "ativa", "finalizada",
  // guincho
  "solicitado", "a_caminho", "em_execucao", "concluido",
  // compra/venda
  "negociacao", "fechada", "concluida",
  // comum
  "cancelada",
] as const;
export type StatusOperacao = (typeof STATUS_OPERACAO)[number];

export const PAPEIS_OPERACAO_ATIVO = ["objeto", "recurso"] as const;
export type PapelOperacaoAtivo = (typeof PAPEIS_OPERACAO_ATIVO)[number];

export const TIPOS_LANCAMENTO = ["receita", "despesa"] as const;
export type TipoLancamento = (typeof TIPOS_LANCAMENTO)[number];

export const STATUS_LANCAMENTO = ["previsto", "pago", "cancelado"] as const;
export type StatusLancamento = (typeof STATUS_LANCAMENTO)[number];

export const FORMAS_PAGAMENTO = [
  "dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto", "transferencia",
] as const;
export type FormaPagamento = (typeof FORMAS_PAGAMENTO)[number];

export const TIPOS_MANUTENCAO = ["preventiva", "corretiva", "revisao", "melhoria"] as const;
export type TipoManutencao = (typeof TIPOS_MANUTENCAO)[number];

export const STATUS_MANUTENCAO = ["agendada", "em_andamento", "concluida", "cancelada"] as const;
export type StatusManutencao = (typeof STATUS_MANUTENCAO)[number];

export const TIPOS_DOCUMENTO = [
  "contrato", "crlv", "cnh", "nota_fiscal", "foto", "comprovante", "outro",
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export const COMBUSTIVEIS = ["gasolina", "etanol", "flex", "diesel", "eletrico", "hibrido"] as const;
export type Combustivel = (typeof COMBUSTIVEIS)[number];

export const STATUS_DOCUMENTACAO = ["pendente", "em_andamento", "concluida"] as const;
export type StatusDocumentacao = (typeof STATUS_DOCUMENTACAO)[number];

export const EVENTOS_TIMELINE = [
  "criado", "atualizado", "status_alterado", "comentario_adicionado",
  "documento_anexado", "lancamento_gerado", "login", "logout", "login_falhou",
] as const;
export type EventoTimeline = (typeof EVENTOS_TIMELINE)[number];

export const TIPOS_NOTIFICACAO = [
  "devolucao_atrasada", "lancamento_vencido", "cnh_vencendo", "documento_vencendo",
  "manutencao_agendada", "operacao_atribuida", "mencao", "guincho_solicitado",
] as const;
export type TipoNotificacao = (typeof TIPOS_NOTIFICACAO)[number];
