// Tags e favoritos transversais: qualquer entidade pode ter tags coloridas
// e ser marcada como favorita pelo usuário logado.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star, Plus, X, Tag } from "lucide-react";
import { api } from "../api";
import { Chip, useToast } from "./ui";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TagItem {
  id: string;
  nome: string;
  cor: string | null;
}

interface FavoritoResp {
  dados: { favoritado: boolean };
}

interface TagsResp {
  dados: TagItem[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  entidadeTipo: string;
  entidadeId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Converte cor hex em classes inline — Tailwind não aceita valores dinâmicos. */
function ponto(cor: string | null) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ background: cor ?? "#5c6b86" }}
    />
  );
}

// ─── Subcomponente: popover para adicionar tag ────────────────────────────────

function PopoverAdicionarTag({
  entidadeTipo,
  entidadeId,
  tagsVinculadas,
  aoFechar,
}: {
  entidadeTipo: string;
  entidadeId: string;
  tagsVinculadas: TagItem[];
  aoFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const fila = useQueryClient();
  const notificar = useToast();

  // Todas as tags disponíveis no sistema
  const { data: todasTags } = useQuery({
    queryKey: ["tags-todas"],
    queryFn: () => api.get<TagsResp>("/tags").then((r) => r.dados),
  });

  // Fechar ao Escape ou clique fora
  useEffect(() => {
    inputRef.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    const clique = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        aoFechar();
      }
    };
    document.addEventListener("keydown", tecla);
    document.addEventListener("mousedown", clique);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("mousedown", clique);
    };
  }, [aoFechar]);

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["tags", entidadeTipo, entidadeId] });
  };

  const vincular = useMutation({
    mutationFn: (tagId: string) =>
      api.post("/tags/vincular", { tag_id: tagId, entidade_tipo: entidadeTipo, entidade_id: entidadeId }),
    onSuccess: () => {
      invalidar();
      aoFechar();
    },
    onError: () => notificar({ tipo: "erro", titulo: "Não foi possível adicionar a tag" }),
  });

  const criarEVincular = useMutation({
    mutationFn: async (nome: string) => {
      const resp = await api.post<{ dados: TagItem }>("/tags", { nome });
      await api.post("/tags/vincular", {
        tag_id: resp.dados.id,
        entidade_tipo: entidadeTipo,
        entidade_id: entidadeId,
      });
    },
    onSuccess: () => {
      fila.invalidateQueries({ queryKey: ["tags-todas"] });
      invalidar();
      aoFechar();
    },
    onError: () => notificar({ tipo: "erro", titulo: "Não foi possível criar a tag" }),
  });

  const vinculadasIds = new Set(tagsVinculadas.map((t) => t.id));
  const filtradas = (todasTags ?? []).filter(
    (t) =>
      !vinculadasIds.has(t.id) &&
      t.nome.toLowerCase().includes(busca.toLowerCase())
  );
  const exibirCriar =
    busca.trim().length > 0 &&
    !(todasTags ?? []).some(
      (t) => t.nome.toLowerCase() === busca.trim().toLowerCase()
    );

  const pendente = vincular.isPending || criarEVincular.isPending;

  return (
    <div
      ref={popoverRef}
      className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-borda bg-painel shadow-flutuante"
    >
      <div className="border-b border-borda px-3 py-2">
        <input
          ref={inputRef}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar ou criar tag…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-mudo"
          disabled={pendente}
        />
      </div>
      <ul className="max-h-48 overflow-y-auto p-1">
        {filtradas.length === 0 && !exibirCriar && (
          <li className="px-3 py-4 text-center text-xs text-mudo">
            {busca ? "Nenhuma tag encontrada" : "Nenhuma tag disponível"}
          </li>
        )}
        {filtradas.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => vincular.mutate(t.id)}
              disabled={pendente}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-elevado disabled:opacity-50"
            >
              {ponto(t.cor)}
              {t.nome}
            </button>
          </li>
        ))}
        {exibirCriar && (
          <li>
            <button
              onClick={() => criarEVincular.mutate(busca.trim())}
              disabled={pendente}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-ouro transition-colors hover:bg-elevado disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              Criar &ldquo;{busca.trim()}&rdquo;
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function TagsFavoritos({ entidadeTipo, entidadeId }: Props) {
  const [popoverAberto, setPopoverAberto] = useState(false);
  const fila = useQueryClient();
  const notificar = useToast();

  // Tags vinculadas à entidade
  const { data: tags = [] } = useQuery({
    queryKey: ["tags", entidadeTipo, entidadeId],
    queryFn: () =>
      api
        .get<TagsResp>(`/tags/entidade?entidade_tipo=${entidadeTipo}&entidade_id=${entidadeId}`)
        .then((r) => r.dados),
  });

  // Favorito do usuário para esta entidade
  const { data: favoritoData } = useQuery({
    queryKey: ["favorito", entidadeTipo, entidadeId],
    queryFn: () =>
      api
        .get<FavoritoResp>(`/favoritos/verificar?entidade_tipo=${entidadeTipo}&entidade_id=${entidadeId}`)
        .then((r) => r.dados),
  });
  const favoritado = favoritoData?.favoritado ?? false;

  // Toggle favorito (otimístico)
  const toggleFavorito = useMutation({
    mutationFn: () =>
      favoritado
        ? api.delete(`/favoritos?entidade_tipo=${entidadeTipo}&entidade_id=${entidadeId}`)
        : api.post("/favoritos", { entidade_tipo: entidadeTipo, entidade_id: entidadeId }),
    onMutate: async () => {
      await fila.cancelQueries({ queryKey: ["favorito", entidadeTipo, entidadeId] });
      const anterior = fila.getQueryData<FavoritoResp>(["favorito", entidadeTipo, entidadeId]);
      fila.setQueryData<FavoritoResp>(["favorito", entidadeTipo, entidadeId], {
        dados: { favoritado: !favoritado },
      });
      return { anterior };
    },
    onError: (_err, _vars, ctx) => {
      fila.setQueryData(["favorito", entidadeTipo, entidadeId], ctx?.anterior);
      notificar({ tipo: "erro", titulo: "Não foi possível atualizar favorito" });
    },
    onSettled: () => {
      fila.invalidateQueries({ queryKey: ["favorito", entidadeTipo, entidadeId] });
    },
  });

  // Remover tag da entidade
  const removerTag = useMutation({
    mutationFn: (tagId: string) =>
      api.post("/tags/desvincular", { tag_id: tagId, entidade_tipo: entidadeTipo, entidade_id: entidadeId }),
    onSuccess: () => {
      fila.invalidateQueries({ queryKey: ["tags", entidadeTipo, entidadeId] });
    },
    onError: () => notificar({ tipo: "erro", titulo: "Não foi possível remover a tag" }),
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Botão favorito */}
      <button
        onClick={() => toggleFavorito.mutate()}
        disabled={toggleFavorito.isPending}
        aria-label={favoritado ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors ${
          favoritado
            ? "bg-ouro/15 text-ouro ring-ouro/30 hover:bg-ouro/20"
            : "bg-elevado text-suave ring-borda hover:text-texto hover:ring-borda-forte"
        } disabled:opacity-50`}
      >
        <Star
          className={`h-3.5 w-3.5 ${favoritado ? "fill-ouro text-ouro" : ""}`}
        />
        Favorito
      </button>

      {/* Chips de tags vinculadas */}
      {tags.map((tag) => (
        <Chip
          key={tag.id}
          onRemover={() => removerTag.mutate(tag.id)}
        >
          {ponto(tag.cor)}
          {tag.nome}
        </Chip>
      ))}

      {/* Botão + Tag e popover */}
      <div className="relative">
        <button
          onClick={() => setPopoverAberto((v) => !v)}
          className="flex items-center gap-1 rounded-full border border-dashed border-borda-forte px-3 py-1 text-xs text-mudo transition-colors hover:border-ouro/50 hover:text-texto"
        >
          <Tag className="h-3 w-3" />
          Adicionar tag
        </button>

        {popoverAberto && (
          <PopoverAdicionarTag
            entidadeTipo={entidadeTipo}
            entidadeId={entidadeId}
            tagsVinculadas={tags}
            aoFechar={() => setPopoverAberto(false)}
          />
        )}
      </div>
    </div>
  );
}
