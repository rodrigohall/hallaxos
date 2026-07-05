import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, User, CalendarDays } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Campo, Card, Entrada, Selecao, Selo, SkeletonLinhas, EstadoVazio, dataHora } from "../componentes/ui";

interface EventoAuditoria {
  id: string;
  entidadeTipo: string;
  entidadeId: string;
  evento: string;
  descricao: string;
  createdAt: string;
  usuarioNome: string | null;
}
interface Usuario { id: string; nome: string }

const ROTULO_EVENTO: Record<string, string> = {
  criado: "criado", atualizado: "atualizado", status_alterado: "status alterado",
  comentario_adicionado: "comentário", documento_anexado: "documento", lancamento_gerado: "lançamento gerado",
  login: "login", logout: "logout", login_falhou: "login falhou",
};
// Tom semântico por evento — a cor em si vem do mapa central do <Selo>.
const TOM_EVENTO: Record<string, string> = {
  criado: "ok", atualizado: "info", status_alterado: "alerta",
  lancamento_gerado: "ouro", login_falhou: "erro",
};

const ROTA_ENTIDADE: Record<string, (id: string) => string> = {
  pessoa: (id) => `/clientes/${id}`,
  ativo: (id) => `/ativos/${id}`,
  operacao: (id) => `/operacoes/${id}`,
  manutencao: (id) => `/manutencoes/${id}`,
};

const TIPOS_ENTIDADE = [
  "pessoa", "ativo", "operacao", "manutencao", "lancamento", "evento_agenda", "documento",
];
const TIPOS_EVENTO = [
  "criado", "atualizado", "status_alterado", "comentario_adicionado",
  "documento_anexado", "lancamento_gerado", "login", "logout", "login_falhou",
];

export function Auditoria() {
  const { pode } = useAuth();
  const [entidadeTipo, setEntidadeTipo] = useState("");
  const [evento, setEvento] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [pagina, setPagina] = useState(1);

  if (!pode("usuarios", "ler")) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-lg font-bold">Auditoria</h1>
        <EstadoVazio titulo="Sem permissão" descricao="Seu perfil não tem acesso à auditoria." />
      </div>
    );
  }

  const params = new URLSearchParams();
  if (entidadeTipo) params.set("entidade_tipo", entidadeTipo);
  if (evento) params.set("evento", evento);
  if (usuarioId) params.set("usuario_id", usuarioId);
  if (de) params.set("de", de);
  if (ate) params.set("ate", ate);
  params.set("pagina", String(pagina));
  params.set("por_pagina", "50");

  const { data, isLoading } = useQuery({
    queryKey: ["auditoria", entidadeTipo, evento, usuarioId, de, ate, pagina],
    queryFn: () =>
      api.get<{ dados: EventoAuditoria[]; meta: { total: number; pagina: number; por_pagina: number } }>(`/auditoria?${params}`),
  });

  const { data: usuariosData } = useQuery({
    queryKey: ["usuarios-lista"],
    queryFn: () => api.get<{ dados: Usuario[] }>("/usuarios?por_pagina=200").then((r) => r.dados),
  });

  const limpar = () => {
    setEntidadeTipo("");
    setEvento("");
    setUsuarioId("");
    setDe("");
    setAte("");
    setPagina(1);
  };

  const total = data?.meta.total ?? 0;
  const porPagina = data?.meta.por_pagina ?? 50;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Auditoria</h1>
        <span className="text-sm text-suave">{total} evento(s)</span>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-40">
            <Campo rotulo="Entidade">
              <Selecao value={entidadeTipo} onChange={(e) => { setEntidadeTipo(e.target.value); setPagina(1); }}>
                <option value="">Todas</option>
                {TIPOS_ENTIDADE.map((t) => <option key={t} value={t}>{t}</option>)}
              </Selecao>
            </Campo>
          </div>
          <div className="w-40">
            <Campo rotulo="Evento">
              <Selecao value={evento} onChange={(e) => { setEvento(e.target.value); setPagina(1); }}>
                <option value="">Todos</option>
                {TIPOS_EVENTO.map((t) => <option key={t} value={t}>{ROTULO_EVENTO[t] ?? t}</option>)}
              </Selecao>
            </Campo>
          </div>
          <div className="w-40">
            <Campo rotulo="Usuário">
              <Selecao value={usuarioId} onChange={(e) => { setUsuarioId(e.target.value); setPagina(1); }}>
                <option value="">Todos</option>
                {(usuariosData ?? []).map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </Selecao>
            </Campo>
          </div>
          <div className="w-40">
            <Campo rotulo="De">
              <Entrada type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(1); }} />
            </Campo>
          </div>
          <div className="w-40">
            <Campo rotulo="Até">
              <Entrada type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(1); }} />
            </Campo>
          </div>
          {(entidadeTipo || evento || usuarioId || de || ate) && (
            <Botao tamanho="sm" variante="fantasma" className="mb-1" onClick={limpar}>Limpar</Botao>
          )}
        </div>
      </Card>

      {/* Lista de eventos */}
      <section className="animar-surgir superficie overflow-hidden rounded-lg border border-borda shadow-painel">
        {isLoading ? (
          <div className="p-4"><SkeletonLinhas linhas={8} /></div>
        ) : !data || data.dados.length === 0 ? (
          <EstadoVazio icone={ClipboardList} titulo="Nenhum evento encontrado" />
        ) : (
          <div className="animar-cascata divide-y divide-borda">
            {data.dados.map((ev) => {
              const rota = ev.entidadeId ? ROTA_ENTIDADE[ev.entidadeTipo]?.(ev.entidadeId) : undefined;
              return (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-elevado/60">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Selo tom={TOM_EVENTO[ev.evento]}>{ROTULO_EVENTO[ev.evento] ?? ev.evento}</Selo>
                    {rota ? (
                      <Link to={rota} className="transition-colors hover:text-ouro">
                        <Selo>{ev.entidadeTipo}</Selo>
                      </Link>
                    ) : (
                      <Selo>{ev.entidadeTipo}</Selo>
                    )}
                    <p className="flex-1 truncate text-sm">{ev.descricao}</p>
                  </div>
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-suave">
                    {ev.usuarioNome && (
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" /> {ev.usuarioNome}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {dataHora(ev.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Paginação */}
      {total > porPagina && (
        <div className="flex items-center justify-between text-sm text-suave">
          <span>Página {pagina} de {Math.ceil(total / porPagina)}</span>
          <div className="flex gap-2">
            <Botao tamanho="sm" variante="fantasma" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
              Anterior
            </Botao>
            <Botao tamanho="sm" variante="fantasma" disabled={pagina >= Math.ceil(total / porPagina)} onClick={() => setPagina((p) => p + 1)}>
              Próxima
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
