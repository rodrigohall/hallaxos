// Sino de notificações: contador + painel de itens recentes.
// Consulta o contador a cada 30 s e exibe badge quando há não lidas.
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell, BellDot, CheckCheck, BellOff,
  AlertCircle, CircleDollarSign, IdCard, FileWarning,
  Wrench, Workflow, AtSign, Truck,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  lida: boolean;
  createdAt: string;
  entidadeTipo?: string | null;
  entidadeId?: string | null;
}

interface ContadorResp {
  dados: { naoLidas: number };
}

interface ListaResp {
  dados: Notificacao[];
}

// ─── Mapa tipo → ícone ───────────────────────────────────────────────────────

const TIPO_ICONE: Record<string, { icone: LucideIcon; classe: string }> = {
  devolucao_atrasada: { icone: AlertCircle, classe: "text-alerta" },
  lancamento_vencido: { icone: CircleDollarSign, classe: "text-erro" },
  cnh_vencendo: { icone: IdCard, classe: "text-alerta" },
  documento_vencendo: { icone: FileWarning, classe: "text-alerta" },
  manutencao_agendada: { icone: Wrench, classe: "text-info" },
  operacao_atribuida: { icone: Workflow, classe: "text-info" },
  mencao: { icone: AtSign, classe: "text-ouro" },
  guincho_solicitado: { icone: Truck, classe: "text-ok" },
};

// ─── Mapa entidadeTipo → rota ────────────────────────────────────────────────

function rotaDaEntidade(tipo?: string | null, id?: string | null): string | null {
  switch (tipo) {
    case "pessoa":      return id ? `/clientes/${id}` : null;
    case "ativo":       return id ? `/ativos/${id}` : null;
    case "operacao":    return id ? `/operacoes/${id}` : null;
    case "manutencao":  return id ? `/manutencoes/${id}` : null;
    case "lancamento":  return "/financeiro";
    case "documento":   return "/ativos";
    case "usuario":     return "/usuarios";
    default:            return null;
  }
}

// ─── Tempo relativo ──────────────────────────────────────────────────────────

function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} d`;
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const painelRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const navegar = useNavigate();
  const fila = useQueryClient();

  // Contador — consulta a cada 30 s
  const { data: contadorData } = useQuery({
    queryKey: ["notificacoes-contador"],
    queryFn: () => api.get<ContadorResp>("/notificacoes/contador"),
    refetchInterval: 30_000,
    select: (d) => d.dados.naoLidas,
  });
  const naoLidas = contadorData ?? 0;

  // Lista de notificações — busca quando o painel abre
  const { data: lista } = useQuery({
    queryKey: ["notificacoes-lista"],
    queryFn: () => api.get<ListaResp>("/notificacoes").then((r) => r.dados),
    enabled: aberto,
  });

  // Marcar uma como lida
  const marcarUma = useMutation({
    mutationFn: (id: string) => api.patch(`/notificacoes/${id}/lida`, {}),
    onSuccess: () => {
      fila.invalidateQueries({ queryKey: ["notificacoes-contador"] });
      fila.invalidateQueries({ queryKey: ["notificacoes-lista"] });
    },
  });

  // Marcar todas como lidas
  const marcarTodas = useMutation({
    mutationFn: () => api.post("/notificacoes/marcar-todas-lidas"),
    onSuccess: () => {
      fila.invalidateQueries({ queryKey: ["notificacoes-contador"] });
      fila.invalidateQueries({ queryKey: ["notificacoes-lista"] });
    },
  });

  // Fechar ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const ao = (e: MouseEvent) => {
      if (
        painelRef.current &&
        !painelRef.current.contains(e.target as Node) &&
        botaoRef.current &&
        !botaoRef.current.contains(e.target as Node)
      ) {
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", ao);
    return () => document.removeEventListener("mousedown", ao);
  }, [aberto]);

  const abrirNotificacao = (n: Notificacao) => {
    if (!n.lida) marcarUma.mutate(n.id);
    const rota = rotaDaEntidade(n.entidadeTipo, n.entidadeId);
    if (rota) navegar(rota);
    setAberto(false);
  };

  const badgeTexto = naoLidas > 99 ? "99+" : String(naoLidas);

  return (
    <div className="relative">
      {/* Botão sino */}
      <button
        ref={botaoRef}
        onClick={() => setAberto((v) => !v)}
        aria-label="Notificações"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-suave transition-colors hover:bg-elevado hover:text-texto"
      >
        {naoLidas > 0 ? (
          <BellDot className="h-5 w-5 text-ouro" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {naoLidas > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-erro px-1 text-[10px] font-bold leading-none text-white">
            {badgeTexto}
          </span>
        )}
      </button>

      {/* Painel dropdown */}
      {aberto && (
        <div
          ref={painelRef}
          className="animar-surgir absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-borda bg-painel shadow-flutuante"
        >
          {/* Cabeçalho do painel */}
          <div className="flex items-center justify-between border-b border-borda px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-suave">
              Notificações
            </span>
            {naoLidas > 0 && (
              <button
                onClick={() => marcarTodas.mutate()}
                disabled={marcarTodas.isPending}
                className="flex items-center gap-1 text-xs text-suave transition-colors hover:text-ouro disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-96 overflow-y-auto">
            {!lista && (
              <div className="space-y-2 p-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-elevado" />
                ))}
              </div>
            )}

            {lista && lista.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <span className="rounded-full bg-elevado p-3">
                  <BellOff className="h-5 w-5 text-mudo" />
                </span>
                <p className="text-sm font-medium">Nenhuma notificação</p>
                <p className="text-xs text-mudo">Você está em dia!</p>
              </div>
            )}

            {lista && lista.length > 0 && (
              <ul className="divide-y divide-borda">
                {lista.map((n) => {
                  const info = TIPO_ICONE[n.tipo] ?? { icone: Bell, classe: "text-mudo" };
                  const Icone = info.icone;
                  return (
                    <li key={n.id}>
                      <button
                        onClick={() => abrirNotificacao(n)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-elevado ${
                          !n.lida ? "bg-ouro/5" : ""
                        }`}
                      >
                        <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${info.classe}`} />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block truncate text-sm ${
                              !n.lida ? "font-semibold text-texto" : "text-suave"
                            }`}
                          >
                            {n.titulo}
                          </span>
                          <span className="block text-xs text-mudo">
                            {tempoRelativo(n.createdAt)}
                          </span>
                        </span>
                        {!n.lida && (
                          <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ouro" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
