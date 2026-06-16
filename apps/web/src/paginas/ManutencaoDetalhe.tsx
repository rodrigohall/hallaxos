import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Wrench, CircleDollarSign, Play, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { TIPOS_MANUTENCAO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Selo, Modal, Campo, Entrada, Selecao, AreaTexto, Timeline, useToast,
  dinheiro, dataCurta, dataHora, SkeletonLinhas, EstadoVazio, Lista, ListaLinha,
  type EventoTimeline,
} from "../componentes/ui";
import { Comentarios } from "../componentes/Comentarios";
import { Documentos } from "../componentes/Anexos";

interface ManutencaoDetalheDados {
  id: string; tipo: string; status: string; descricao: string;
  ativo_id: string; ativo_nome: string; ativo_codigo: string; ativo_status: string;
  fornecedor_nome: string | null; data_agendada: string | null;
  data_inicio: string | null; data_conclusao: string | null;
  km_no_momento: number | null; observacoes: string | null;
  lancamentos: Array<{ id: string; tipo: string; descricao: string; valor: string; status: string; data_vencimento: string; data_pagamento: string | null }>;
  proximasTransicoes: string[];
}

const ROTULO_STATUS: Record<string, string> = {
  agendada: "agendada", em_andamento: "em andamento", concluida: "concluída", cancelada: "cancelada",
};

export function ManutencaoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const fila = useQueryClient();
  const notificar = useToast();
  const [acao, setAcao] = useState<"concluir" | "cancelar" | null>(null);
  const [km, setKm] = useState("");
  const [custo, setCusto] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [dataConcl, setDataConcl] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [ed, setEd] = useState({
    tipo: "", descricao: "", observacoes: "", data_agendada: "",
    data_inicio: "", data_conclusao: "", km_no_momento: "",
  });
  const [salvandoEd, setSalvandoEd] = useState(false);

  const { data: m } = useQuery({
    queryKey: ["manutencao", id],
    queryFn: () => api.get<{ dados: ManutencaoDetalheDados }>(`/manutencoes/${id}`).then((r) => r.dados),
  });
  const { data: eventos, isLoading: carregandoTL } = useQuery({
    queryKey: ["manutencao-timeline", id],
    queryFn: () => api.get<{ dados: EventoTimeline[] }>(`/manutencoes/${id}/timeline`).then((r) => r.dados),
  });

  if (!m) return <SkeletonLinhas linhas={8} />;

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["manutencao", id] });
    fila.invalidateQueries({ queryKey: ["manutencao-timeline", id] });
    fila.invalidateQueries({ queryKey: ["manutencoes"] });
    fila.invalidateQueries({ queryKey: ["ativo"] });
    fila.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const iniciar = async () => {
    try {
      await api.post(`/manutencoes/${id}/iniciar`);
      invalidar();
      notificar({ tipo: "ok", titulo: "Manutenção iniciada" });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível iniciar", descricao: e instanceof ApiError ? e.message : undefined });
    }
  };

  const confirmar = async () => {
    setEnviando(true);
    try {
      if (acao === "concluir") {
        await api.post(`/manutencoes/${id}/concluir`, {
          km_no_momento: km ? Number(km) : null,
          custo: custo ? Number(custo) : null,
          parcelas: Number(parcelas || 1),
          data_conclusao: dataConcl || null,
        });
      } else if (acao === "cancelar") {
        await api.post(`/manutencoes/${id}/cancelar`, { motivo });
      }
      invalidar();
      notificar({ tipo: "ok", titulo: acao === "concluir" ? "Manutenção concluída" : "Manutenção cancelada" });
      fechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Ação recusada", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };
  const fechar = () => { setAcao(null); setKm(""); setCusto(""); setParcelas("1"); setMotivo(""); setDataConcl(""); };

  // Edição depois de lançada: corrige dados e datas (incl. retroativo), com
  // auditoria no servidor (decisão #50). Disponível em qualquer status, exceto cancelada.
  const abrirEdicao = () => {
    setEd({
      tipo: m.tipo,
      descricao: m.descricao,
      observacoes: m.observacoes ?? "",
      data_agendada: m.data_agendada ? m.data_agendada.slice(0, 10) : "",
      data_inicio: m.data_inicio ? m.data_inicio.slice(0, 10) : "",
      data_conclusao: m.data_conclusao ? m.data_conclusao.slice(0, 10) : "",
      km_no_momento: m.km_no_momento != null ? String(m.km_no_momento) : "",
    });
    setEditando(true);
  };
  const salvarEdicao = async () => {
    setSalvandoEd(true);
    try {
      await api.patch(`/manutencoes/${id}`, {
        tipo: ed.tipo,
        descricao: ed.descricao,
        observacoes: ed.observacoes || null,
        data_agendada: ed.data_agendada || null,
        data_inicio: ed.data_inicio || null,
        data_conclusao: ed.data_conclusao || null,
        km_no_momento: ed.km_no_momento ? Number(ed.km_no_momento) : null,
      });
      invalidar();
      notificar({ tipo: "ok", titulo: "Manutenção atualizada" });
      setEditando(false);
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível salvar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvandoEd(false);
    }
  };

  const podeTransicionar = pode("manutencoes", "transicionar");
  const podeEditar = pode("manutencoes", "editar") && m.status !== "cancelada";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{m.descricao}</h1>
        <Selo tom={m.status}>{ROTULO_STATUS[m.status] ?? m.status}</Selo>
        <Link to={`/ativos/${m.ativo_id}`} className="text-sm text-suave hover:text-ouro">
          · <span className="font-display font-bold text-ouro">{m.ativo_codigo}</span> {m.ativo_nome}
        </Link>
        {podeEditar && (
          <Botao tamanho="sm" variante="secundario" className="ml-auto" onClick={abrirEdicao}>
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Botao>
        )}
      </div>

      {podeTransicionar && m.proximasTransicoes.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {m.proximasTransicoes.includes("em_andamento") && (
            <Botao tamanho="sm" onClick={iniciar}><Play className="h-3.5 w-3.5" /> Iniciar</Botao>
          )}
          {m.proximasTransicoes.includes("concluida") && (
            <Botao tamanho="sm" onClick={() => setAcao("concluir")}><CheckCircle2 className="h-3.5 w-3.5" /> Concluir</Botao>
          )}
          {m.proximasTransicoes.includes("cancelada") && (
            <Botao variante="perigo" tamanho="sm" onClick={() => setAcao("cancelar")}><XCircle className="h-3.5 w-3.5" /> Cancelar</Botao>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card titulo="Dados" icone={Wrench}>
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline text-suave">Tipo: </dt><dd className="inline">{m.tipo}</dd></div>
              <div><dt className="inline text-suave">Ativo: </dt><dd className="inline">{m.ativo_nome}</dd></div>
              {m.fornecedor_nome && <div><dt className="inline text-suave">Fornecedor: </dt><dd className="inline">{m.fornecedor_nome}</dd></div>}
              {m.data_agendada && <div><dt className="inline text-suave">Agendada: </dt><dd className="inline">{dataCurta(m.data_agendada)}</dd></div>}
              {m.data_inicio && <div><dt className="inline text-suave">Iniciada: </dt><dd className="inline">{dataHora(m.data_inicio)}</dd></div>}
              {m.data_conclusao && <div><dt className="inline text-suave">Concluída: </dt><dd className="inline">{dataHora(m.data_conclusao)}</dd></div>}
              {m.km_no_momento != null && <div><dt className="inline text-suave">Km: </dt><dd className="inline">{m.km_no_momento.toLocaleString("pt-BR")}</dd></div>}
              {m.observacoes && <p className="pt-2 text-suave">{m.observacoes}</p>}
            </dl>
          </Card>
          <Documentos entidadeTipo="manutencao" entidadeId={m.id} />
          <Comentarios entidadeTipo="manutencao" entidadeId={m.id} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card titulo="História completa" icone={History}>
            {carregandoTL ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
          </Card>
          <Card titulo="Custos" icone={CircleDollarSign}>
            {m.lancamentos.length === 0 ? (
              <EstadoVazio icone={CircleDollarSign} titulo="Nenhum custo lançado" descricao="O custo é informado na conclusão." />
            ) : (
              <Lista>
                {m.lancamentos.map((l) => (
                  <ListaLinha
                    key={l.id}
                    titulo={l.descricao}
                    subtitulo={l.data_pagamento ? `pago em ${dataCurta(l.data_pagamento)}` : `vence ${dataCurta(l.data_vencimento)} · ${l.status}`}
                    direita={<span className="text-sm font-medium text-erro">− {dinheiro(l.valor)}</span>}
                  />
                ))}
              </Lista>
            )}
          </Card>
        </div>
      </div>

      <Modal aberto={!!acao} aoFechar={fechar} titulo={acao === "concluir" ? "Concluir manutenção" : "Cancelar manutenção"}>
        {acao === "concluir" ? (
          <div className="space-y-4">
            <p className="text-sm text-suave">O ativo volta a <span className="font-medium text-texto">disponível</span>. Informe o custo para gerar a despesa.</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Km no momento (opcional)"><Entrada type="number" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
              <Campo rotulo="Custo (R$, opcional)"><Entrada type="number" value={custo} onChange={(e) => setCusto(e.target.value)} /></Campo>
            </div>
            {Number(custo) > 0 && (
              <Campo rotulo="Parcelas" dica="Vencimentos mensais."><Entrada type="number" min={1} max={60} value={parcelas} onChange={(e) => setParcelas(e.target.value)} /></Campo>
            )}
            <Campo rotulo="Data da conclusão" dica="Opcional — retroativo (padrão: hoje)">
              <Entrada type="date" value={dataConcl} onChange={(e) => setDataConcl(e.target.value)} />
            </Campo>
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fechar}>Voltar</Botao>
              <Botao onClick={confirmar} carregando={enviando}>Concluir</Botao>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Campo rotulo="Motivo do cancelamento"><AreaTexto value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
            <div className="flex justify-end gap-2">
              <Botao variante="fantasma" onClick={fechar}>Voltar</Botao>
              <Botao variante="perigo" onClick={confirmar} carregando={enviando} disabled={motivo.trim().length < 3}>Cancelar manutenção</Botao>
            </div>
          </div>
        )}
      </Modal>

      <Modal aberto={editando} aoFechar={() => setEditando(false)} titulo="Editar manutenção">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo">
              <Selecao value={ed.tipo} onChange={(e) => setEd({ ...ed, tipo: e.target.value })}>
                {TIPOS_MANUTENCAO.map((t) => <option key={t} value={t}>{t}</option>)}
              </Selecao>
            </Campo>
            <Campo rotulo="Km no momento">
              <Entrada type="number" value={ed.km_no_momento} onChange={(e) => setEd({ ...ed, km_no_momento: e.target.value })} />
            </Campo>
          </div>
          <Campo rotulo="Descrição">
            <Entrada value={ed.descricao} onChange={(e) => setEd({ ...ed, descricao: e.target.value })} />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Agendada"><Entrada type="date" value={ed.data_agendada} onChange={(e) => setEd({ ...ed, data_agendada: e.target.value })} /></Campo>
            <Campo rotulo="Início" dica="Retroativo"><Entrada type="date" value={ed.data_inicio} onChange={(e) => setEd({ ...ed, data_inicio: e.target.value })} /></Campo>
            <Campo rotulo="Conclusão" dica="Retroativo"><Entrada type="date" value={ed.data_conclusao} onChange={(e) => setEd({ ...ed, data_conclusao: e.target.value })} /></Campo>
          </div>
          <Campo rotulo="Observações">
            <AreaTexto value={ed.observacoes} onChange={(e) => setEd({ ...ed, observacoes: e.target.value })} />
          </Campo>
          <div className="flex justify-end gap-2">
            <Botao variante="fantasma" onClick={() => setEditando(false)}>Cancelar</Botao>
            <Botao onClick={salvarEdicao} carregando={salvandoEd} disabled={ed.descricao.trim().length < 3}>Salvar</Botao>
          </div>
        </div>
      </Modal>
    </div>
  );
}
