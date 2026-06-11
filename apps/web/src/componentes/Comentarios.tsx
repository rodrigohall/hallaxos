// Comentários internos de qualquer entidade — separados da timeline.
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, PencilLine, Trash2 } from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { AreaTexto, Botao, Card, EstadoVazio, SkeletonLinhas, useToast, dataHora } from "./ui";

interface Comentario {
  id: string;
  texto: string;
  editadoEm: string | null;
  createdAt: string;
  usuarioId: string;
  usuarioNome: string;
}

export function Comentarios({ entidadeTipo, entidadeId }: { entidadeTipo: string; entidadeId: string }) {
  const { usuario, pode } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [texto, setTexto] = useState("");
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);

  const chave = ["comentarios", entidadeTipo, entidadeId];
  const { data: comentarios, isLoading } = useQuery({
    queryKey: chave,
    queryFn: () =>
      api
        .get<{ dados: Comentario[] }>(`/comentarios?entidade_tipo=${entidadeTipo}&entidade_id=${entidadeId}`)
        .then((r) => r.dados),
  });

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: chave });
    fila.invalidateQueries({ queryKey: ["ativo-timeline"] });
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!texto.trim()) return;
    setEnviando(true);
    try {
      await api.post("/comentarios", { entidade_tipo: entidadeTipo, entidade_id: entidadeId, texto });
      setTexto("");
      invalidar();
    } catch (err) {
      notificar({ tipo: "erro", titulo: "Falha ao comentar", descricao: err instanceof ApiError ? err.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    await api.patch(`/comentarios/${editando.id}`, { texto: editando.texto });
    setEditando(null);
    invalidar();
  };

  const remover = async (id: string) => {
    await api.delete(`/comentarios/${id}`);
    invalidar();
    notificar({ tipo: "ok", titulo: "Comentário removido", descricao: "A remoção ficou registrada na timeline." });
  };

  return (
    <Card titulo="Comentários" icone={MessageSquare}>
      {isLoading ? (
        <SkeletonLinhas linhas={2} />
      ) : (
        <div className="space-y-4">
          {comentarios?.length === 0 && (
            <EstadoVazio icone={MessageSquare} titulo="Nenhum comentário" descricao="Anote aqui o que a equipe precisa saber." />
          )}
          <ul className="space-y-3">
            {comentarios?.map((c) => (
              <li key={c.id} className="rounded-lg bg-elevado/60 p-3">
                {editando?.id === c.id ? (
                  <div className="space-y-2">
                    <AreaTexto
                      value={editando.texto}
                      onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Botao tamanho="sm" onClick={salvarEdicao}>Salvar</Botao>
                      <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(null)}>Cancelar</Botao>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm">{c.texto}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-mudo">
                      <span className="font-medium text-suave">{c.usuarioNome}</span>
                      <span>· {dataHora(c.createdAt)}</span>
                      {c.editadoEm && <span>· editado</span>}
                      {c.usuarioId === usuario?.id && (
                        <span className="ml-auto flex gap-1">
                          <button
                            title="Editar"
                            onClick={() => setEditando({ id: c.id, texto: c.texto })}
                            className="rounded p-1 text-suave hover:text-texto"
                          >
                            <PencilLine className="h-3.5 w-3.5" />
                          </button>
                          <button title="Remover" onClick={() => remover(c.id)} className="rounded p-1 text-suave hover:text-erro">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
          {pode("comentarios", "criar") && (
            <form onSubmit={enviar} className="space-y-2">
              <AreaTexto
                placeholder="Escreva um comentário para a equipe…"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
              />
              <Botao type="submit" tamanho="sm" carregando={enviando} disabled={!texto.trim()}>
                Comentar
              </Botao>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
