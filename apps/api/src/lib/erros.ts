export class AppError extends Error {
  constructor(
    public status: number,
    public codigo: string,
    mensagem: string,
    public detalhes?: unknown
  ) {
    super(mensagem);
  }
}

export const naoEncontrado = (oque = "Registro") =>
  new AppError(404, "NAO_ENCONTRADO", `${oque} não encontrado.`);
export const semPermissao = () =>
  new AppError(403, "SEM_PERMISSAO", "Você não tem permissão para esta ação.");
export const naoAutenticado = () =>
  new AppError(401, "NAO_AUTENTICADO", "Faça login para continuar.");
export const conflito = (mensagem: string) => new AppError(409, "CONFLITO", mensagem);
export const regraNegocio = (mensagem: string) => new AppError(422, "REGRA_NEGOCIO", mensagem);
