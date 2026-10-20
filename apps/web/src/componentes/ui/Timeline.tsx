// Timeline: a assinatura visual do HallaxOS (doc 07 §8).
// Trilho vertical, nós com ícone por tipo de evento, hora, autor e resumo.
import { Link } from "react-router-dom";
import {
  Plus, PencilLine, ArrowRightLeft, MessageSquare, Paperclip,
  CircleDollarSign, LogIn, LogOut, ShieldAlert, type LucideIcon,
} from "lucide-react";
import { dataCurta, horaCurta } from "./formato";
import { EstadoVazio } from "./Estados";
import { History } from "lucide-react";

export interface EventoTimeline {
  id: string;
  evento: string;
  descricao: string;
  /** Edições guardam `{ campo: { de, para } }`; outros eventos guardam dados
   *  próprios (a transição `{ de, para }`, o registro do copiloto) — só o
   *  primeiro formato vira lista de mudanças. */
  dados?: Record<string, unknown> | null;
  usuario?: { nome: string } | null;
  createdAt: string;
  link?: string;
}

const ICONES: Record<string, { icone: LucideIcon; cor: string; rotulo: string }> = {
  criado: { icone: Plus, cor: "text-ok bg-ok/10 ring-ok/20", rotulo: "Criação" },
  atualizado: { icone: PencilLine, cor: "text-info bg-info/10 ring-info/20", rotulo: "Edição" },
  status_alterado: { icone: ArrowRightLeft, cor: "text-ouro bg-ouro/10 ring-ouro/20", rotulo: "Status" },
  comentario_adicionado: { icone: MessageSquare, cor: "text-suave bg-elevado ring-borda", rotulo: "Comentário" },
  documento_anexado: { icone: Paperclip, cor: "text-suave bg-elevado ring-borda", rotulo: "Documento" },
  lancamento_gerado: { icone: CircleDollarSign, cor: "text-ok bg-ok/10 ring-ok/20", rotulo: "Financeiro" },
  login: { icone: LogIn, cor: "text-suave bg-elevado ring-borda", rotulo: "Acesso" },
  logout: { icone: LogOut, cor: "text-suave bg-elevado ring-borda", rotulo: "Acesso" },
  login_falhou: { icone: ShieldAlert, cor: "text-erro bg-erro/10 ring-erro/20", rotulo: "Segurança" },
};

const PADRAO = { icone: PencilLine, cor: "text-suave bg-elevado ring-borda", rotulo: "Evento" };

/** Só as mudanças campo a campo: o resto já está dito na descrição do evento
 *  (antes, a transição de status aparecia como "de: — → —"). */
function mudancas(dados: EventoTimeline["dados"]): [string, { de: unknown; para: unknown }][] {
  if (!dados) return [];
  return Object.entries(dados).filter(
    (par): par is [string, { de: unknown; para: unknown }] =>
      typeof par[1] === "object" && par[1] !== null && ("de" in par[1] || "para" in par[1])
  );
}

export function Timeline({ eventos }: { eventos: EventoTimeline[] }) {
  if (eventos.length === 0) {
    return <EstadoVazio icone={History} titulo="Sem história ainda" descricao="Tudo o que acontecer com este registro aparecerá aqui." />;
  }
  return (
    <ol className="animar-cascata relative space-y-5 before:absolute before:inset-y-1 before:left-4 before:w-px before:bg-borda">
      {eventos.map((e) => {
        const { icone: Icone, cor, rotulo } = ICONES[e.evento] ?? PADRAO;
        return (
          <li key={e.id} className="relative flex gap-3.5 pl-0.5">
            <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ${cor}`}>
              <Icone className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm leading-snug">{e.descricao}</p>
              {mudancas(e.dados).length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {mudancas(e.dados).map(([campo, { de, para }]) => (
                    <li key={campo} className="text-xs text-suave">
                      <span className="text-mudo">{campo}:</span> {String(de ?? "—")}{" "}
                      <span className="text-mudo">→</span>{" "}
                      <span className="text-texto">{String(para ?? "—")}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-mudo">
                <span className="font-medium text-suave">{rotulo}</span>
                <span>·</span>
                <span>{dataCurta(e.createdAt)} às {horaCurta(e.createdAt)}</span>
                {e.usuario?.nome && (
                  <>
                    <span>·</span>
                    <span>{e.usuario.nome}</span>
                  </>
                )}
                {e.link && (
                  <>
                    <span>·</span>
                    <Link to={e.link} className="text-ouro hover:underline">ver detalhes</Link>
                  </>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
