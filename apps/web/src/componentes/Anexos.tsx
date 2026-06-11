// Anexos transversais: galeria de fotos e documentos de QUALQUER entidade.
// Upload múltiplo com arrastar-soltar, foto principal, ordenação e lightbox.
import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UploadCloud, Star, ChevronLeft, ChevronRight, Trash2, Download,
  FileText, RefreshCw, Images, X,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { Botao, Card, EstadoVazio, SkeletonLinhas, useToast, dataCurta } from "./ui";

interface Documento {
  id: string;
  tipo: string;
  nome: string;
  mimeType: string;
  tamanhoBytes: number;
  dataValidade: string | null;
  ordem: number;
  principal: boolean;
  createdAt: string;
}

interface PropsEntidade {
  entidadeTipo: string;
  entidadeId: string;
}

const tamanhoLegivel = (b: number) =>
  b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function useDocumentos({ entidadeTipo, entidadeId }: PropsEntidade, tipo: "foto" | "documento") {
  const chave = ["documentos", entidadeTipo, entidadeId, tipo];
  const consulta = useQuery({
    queryKey: chave,
    queryFn: () =>
      api
        .get<{ dados: Documento[] }>(
          `/documentos?entidade_tipo=${entidadeTipo}&entidade_id=${entidadeId}&tipo=${tipo}`
        )
        .then((r) => r.dados),
  });
  const fila = useQueryClient();
  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["documentos", entidadeTipo, entidadeId] });
    fila.invalidateQueries({ queryKey: ["ativo"] });
    fila.invalidateQueries({ queryKey: ["ativos"] });
    fila.invalidateQueries({ queryKey: ["ativo-timeline"] });
  };
  return { ...consulta, invalidar };
}

function AreaUpload({
  aoEnviar, aceita, children,
}: {
  aoEnviar: (arquivos: FileList | File[]) => void;
  aceita: string;
  children: ReactNode;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  return (
    <button
      type="button"
      onClick={() => entrada.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (e.dataTransfer.files.length) aoEnviar(e.dataTransfer.files);
      }}
      className={`flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed p-5 text-sm transition-colors ${
        arrastando ? "border-ouro bg-ouro/5 text-ouro" : "border-borda-forte text-suave hover:border-ouro/50 hover:text-texto"
      }`}
    >
      <UploadCloud className="h-5 w-5" />
      {children}
      <input
        ref={entrada}
        type="file"
        multiple
        accept={aceita}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) aoEnviar(e.target.files);
          e.target.value = "";
        }}
      />
    </button>
  );
}

function useEnvio({ entidadeTipo, entidadeId }: PropsEntidade, tipo: string, invalidar: () => void) {
  const notificar = useToast();
  return useMutation({
    mutationFn: (arquivos: FileList | File[]) => {
      const form = new FormData();
      form.set("entidade_tipo", entidadeTipo);
      form.set("entidade_id", entidadeId);
      form.set("tipo", tipo);
      for (const a of Array.from(arquivos)) form.append("arquivos", a);
      return api.upload("/documentos", form);
    },
    onSuccess: (_d, arquivos) => {
      invalidar();
      notificar({ tipo: "ok", titulo: `${Array.from(arquivos).length} arquivo(s) enviado(s)` });
    },
    onError: (e) =>
      notificar({ tipo: "erro", titulo: "Falha no envio", descricao: e instanceof ApiError ? e.message : undefined }),
  });
}

/** Galeria de fotos com miniaturas, principal, ordenação e visualização ampliada. */
export function Galeria(props: PropsEntidade) {
  const { data: fotos, isLoading, invalidar } = useDocumentos(props, "foto");
  const envio = useEnvio(props, "foto", invalidar);
  const { pode } = useAuth();
  const notificar = useToast();
  const [ampliada, setAmpliada] = useState<number | null>(null);

  const principal = async (id: string) => {
    await api.post(`/documentos/${id}/principal`);
    invalidar();
    notificar({ tipo: "ok", titulo: "Foto principal definida" });
  };
  const mover = async (indice: number, direcao: -1 | 1) => {
    if (!fotos) return;
    const ids = fotos.map((f) => f.id);
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= ids.length) return;
    [ids[indice], ids[alvo]] = [ids[alvo]!, ids[indice]!];
    await api.post("/documentos/reordenar", { ids });
    invalidar();
  };
  const remover = async (f: Documento) => {
    await api.delete(`/documentos/${f.id}`);
    invalidar();
    notificar({ tipo: "ok", titulo: "Foto removida" });
  };

  return (
    <Card titulo="Fotos" icone={Images}>
      {isLoading ? (
        <SkeletonLinhas linhas={2} />
      ) : (
        <div className="space-y-3">
          {fotos && fotos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {fotos.map((f, i) => (
                <figure key={f.id} className="group relative">
                  <img
                    src={`/api/v1/documentos/${f.id}/arquivo`}
                    alt={f.nome}
                    loading="lazy"
                    onClick={() => setAmpliada(i)}
                    className={`aspect-square w-full cursor-zoom-in rounded-md object-cover ring-1 ring-inset ${
                      f.principal ? "ring-2 ring-ouro" : "ring-borda"
                    }`}
                  />
                  {f.principal && (
                    <Star className="absolute left-1.5 top-1.5 h-4 w-4 fill-ouro text-ouro drop-shadow" />
                  )}
                  {pode("documentos", "editar") && (
                    <figcaption className="absolute inset-x-0 bottom-0 hidden justify-center gap-1 rounded-b-md bg-fundo/80 p-1 backdrop-blur group-hover:flex">
                      <button title="Mover para trás" onClick={() => mover(i, -1)} className="rounded p-1 text-suave hover:text-texto">
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button title="Definir como principal" onClick={() => principal(f.id)} className="rounded p-1 text-suave hover:text-ouro">
                        <Star className="h-3.5 w-3.5" />
                      </button>
                      <button title="Remover" onClick={() => remover(f)} className="rounded p-1 text-suave hover:text-erro">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button title="Mover para frente" onClick={() => mover(i, 1)} className="rounded p-1 text-suave hover:text-texto">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          )}
          {fotos?.length === 0 && !pode("documentos", "criar") && (
            <EstadoVazio icone={Images} titulo="Sem fotos" />
          )}
          {pode("documentos", "criar") && (
            <AreaUpload aoEnviar={(a) => envio.mutate(a)} aceita="image/jpeg,image/png,image/webp">
              {envio.isPending ? "Enviando…" : "Arraste fotos aqui ou clique para escolher (JPG, PNG, WEBP)"}
            </AreaUpload>
          )}
        </div>
      )}

      {ampliada !== null && fotos?.[ampliada] && (
        <div
          className="animar-surgir fixed inset-0 z-50 flex items-center justify-center bg-fundo/90 p-4 backdrop-blur-sm"
          onClick={() => setAmpliada(null)}
        >
          <button className="absolute right-4 top-4 rounded-md p-2 text-suave hover:text-texto" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          {ampliada > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAmpliada(ampliada - 1);
              }}
              className="absolute left-3 rounded-full bg-elevado/80 p-2 text-texto"
              aria-label="Anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <img
            src={`/api/v1/documentos/${fotos[ampliada].id}/arquivo`}
            alt={fotos[ampliada].nome}
            className="max-h-full max-w-full rounded-lg object-contain shadow-flutuante"
            onClick={(e) => e.stopPropagation()}
          />
          {ampliada < fotos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAmpliada(ampliada + 1);
              }}
              className="absolute right-3 rounded-full bg-elevado/80 p-2 text-texto"
              aria-label="Próxima"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

/** Documentos da entidade: ver, baixar, substituir, remover, enviar. */
export function Documentos(props: PropsEntidade) {
  const { data: docs, isLoading, invalidar } = useDocumentos(props, "documento");
  const envio = useEnvio(props, "outro", invalidar);
  const { pode } = useAuth();
  const notificar = useToast();
  const substituindo = useRef<HTMLInputElement>(null);
  const [alvoSubstituir, setAlvoSubstituir] = useState<string | null>(null);

  const substituir = async (arquivo: File) => {
    if (!alvoSubstituir) return;
    const form = new FormData();
    form.set("arquivo", arquivo);
    try {
      await api.substituir(`/documentos/${alvoSubstituir}/arquivo`, form);
      invalidar();
      notificar({ tipo: "ok", titulo: "Documento substituído" });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Falha ao substituir", descricao: e instanceof ApiError ? e.message : undefined });
    }
    setAlvoSubstituir(null);
  };

  const remover = async (d: Documento) => {
    await api.delete(`/documentos/${d.id}`);
    invalidar();
    notificar({ tipo: "ok", titulo: "Documento removido" });
  };

  return (
    <Card titulo="Documentos" icone={FileText}>
      {isLoading ? (
        <SkeletonLinhas linhas={2} />
      ) : (
        <div className="space-y-3">
          {docs && docs.length > 0 && (
            <ul className="divide-y divide-borda">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center gap-3 py-2.5">
                  <FileText className="h-4 w-4 shrink-0 text-mudo" />
                  <div className="min-w-0 flex-1">
                    <a
                      href={`/api/v1/documentos/${d.id}/arquivo`}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm hover:text-ouro"
                    >
                      {d.nome}
                    </a>
                    <p className="text-xs text-mudo">
                      {tamanhoLegivel(d.tamanhoBytes)} · {dataCurta(d.createdAt)}
                      {d.dataValidade && ` · vence ${dataCurta(d.dataValidade)}`}
                    </p>
                  </div>
                  <a
                    href={`/api/v1/documentos/${d.id}/arquivo?baixar=true`}
                    title="Baixar"
                    className="rounded p-1.5 text-suave hover:text-texto"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                  {pode("documentos", "editar") && (
                    <button
                      title="Substituir"
                      onClick={() => {
                        setAlvoSubstituir(d.id);
                        substituindo.current?.click();
                      }}
                      className="rounded p-1.5 text-suave hover:text-texto"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  )}
                  {pode("documentos", "arquivar") && (
                    <button title="Remover" onClick={() => remover(d)} className="rounded p-1.5 text-suave hover:text-erro">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {docs?.length === 0 && !pode("documentos", "criar") && (
            <EstadoVazio icone={FileText} titulo="Sem documentos" />
          )}
          {pode("documentos", "criar") && (
            <AreaUpload
              aoEnviar={(a) => envio.mutate(a)}
              aceita="application/pdf,image/jpeg,image/png,image/webp"
            >
              {envio.isPending ? "Enviando…" : "Arraste documentos aqui ou clique (PDF, JPG, PNG, WEBP)"}
            </AreaUpload>
          )}
          <input
            ref={substituindo}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.[0]) substituir(e.target.files[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </Card>
  );
}
