// Rótulos legíveis (pt-BR) dos tipos e status de operação — fonte única da UI.

export const ROTULO_TIPO: Record<string, string> = {
  guincho: "Guincho",
  locacao: "Locação",
  venda: "Venda",
  compra: "Compra",
};

export const ROTULO_STATUS_OP: Record<string, string> = {
  orcamento: "orçamento",
  reservada: "reservada",
  ativa: "ativa",
  finalizada: "finalizada",
  solicitado: "solicitado",
  a_caminho: "a caminho",
  em_execucao: "em execução",
  concluido: "concluído",
  negociacao: "negociação",
  fechada: "fechada",
  concluida: "concluída",
  cancelada: "cancelada",
};

// Verbo da ação de transição (o que o botão diz ao operador).
export const ACAO_TRANSICAO: Record<string, string> = {
  reservada: "Reservar",
  ativa: "Ativar (retirada)",
  finalizada: "Finalizar (devolução)",
  a_caminho: "Despachar",
  em_execucao: "Iniciar execução",
  concluido: "Concluir",
  fechada: "Fechar negócio",
  concluida: "Concluir",
  cancelada: "Cancelar",
};
