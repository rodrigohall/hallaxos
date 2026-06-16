// Cliente HTTP único: entende o envelope {dados}/{erro} da API (doc 06 §1).
export class ApiError extends Error {
  constructor(
    public codigo: string,
    mensagem: string,
    public detalhes?: Array<{ campo: string; mensagem: string }> | null,
    public status?: number
  ) {
    super(mensagem);
  }
}

async function requisicao<T>(caminho: string, init?: RequestInit): Promise<T> {
  // Só declara JSON quando há corpo. Mandar Content-Type: application/json com
  // corpo vazio (POST sem body, DELETE) fazia o Fastify rejeitar a requisição.
  const headers = init?.body != null ? { "Content-Type": "application/json" } : undefined;
  const resposta = await fetch(`/api/v1${caminho}`, {
    credentials: "same-origin",
    ...init,
    headers: { ...headers, ...init?.headers },
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = corpo?.erro;
    throw new ApiError(
      erro?.codigo ?? "ERRO",
      erro?.mensagem ?? "Erro inesperado.",
      erro?.detalhes,
      resposta.status
    );
  }
  return corpo as T;
}

async function multipart<T>(caminho: string, form: FormData, metodo: "POST" | "PUT"): Promise<T> {
  const resposta = await fetch(`/api/v1${caminho}`, {
    method: metodo,
    body: form,
    credentials: "same-origin",
  });
  const corpo = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const erro = corpo?.erro;
    throw new ApiError(erro?.codigo ?? "ERRO", erro?.mensagem ?? "Erro no envio.", erro?.detalhes, resposta.status);
  }
  return corpo as T;
}

export const api = {
  get: <T>(caminho: string) => requisicao<T>(caminho),
  post: <T>(caminho: string, body?: unknown) =>
    requisicao<T>(caminho, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(caminho: string, body: unknown) =>
    requisicao<T>(caminho, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(caminho: string) => requisicao<T>(caminho, { method: "DELETE" }),
  upload: <T>(caminho: string, form: FormData) => multipart<T>(caminho, form, "POST"),
  substituir: <T>(caminho: string, form: FormData) => multipart<T>(caminho, form, "PUT"),
};
