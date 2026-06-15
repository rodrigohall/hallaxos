import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wrench } from "lucide-react";
import { STATUS_MANUTENCAO, TIPOS_MANUTENCAO } from "@hallaxos/shared";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Chip, Selo, Modal, Campo, Entrada, Selecao, AreaTexto,
  SkeletonLinhas, EstadoVazio, Lista, ListaLinha, useToast, dinheiro, dataCurta,
} from "../componentes/ui";
import { Seletor, type ItemSeletor } from "../operacoes/Seletor";

interface ManutencaoLista {
  id: string; tipo: string; status: string; descricao: string;
  ativo: string; ativoCodigo: string; fornecedor: string | null;
  dataAgendada: string | null; custo: string;
}

const ROTULO_STATUS: Record<string, string> = {
  agendada: "agendada", em_andamento: "em andamento", concluida: "concluída", cancelada: "cancelada",
};

export function Manutencoes() {
  const [status, setStatus] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const { pode } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["manutencoes", status],
    queryFn: () =>
      api.get<{ dados: ManutencaoLista[]; meta: { total: number } }>(
        `/manutencoes?por_pagina=50${status ? `&status=${status}` : ""}`
      ),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg font-bold">Manutenções</h1>
        {pode("manutencoes", "criar") && (
          <Botao tamanho="sm" className="ml-auto" onClick={() => setNova(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova manutenção
          </Botao>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip ativo={status === null} onClick={() => setStatus(null)}>todas</Chip>
        {STATUS_MANUTENCAO.map((s) => (
          <Chip key={s} ativo={status === s} onClick={() => setStatus(status === s ? null : s)}>
            {ROTULO_STATUS[s]}
          </Chip>
        ))}
      </div>

      {isLoading ? (
        <SkeletonLinhas linhas={4} />
      ) : !data || data.dados.length === 0 ? (
        <Card>
          <EstadoVazio icone={Wrench} titulo="Nenhuma manutenção" descricao="Agende a manutenção de um ativo para começar." />
        </Card>
      ) : (
        <>
          <Lista>
            {data.dados.map((m) => (
              <ListaLinha
                key={m.id}
                para={`/manutencoes/${m.id}`}
                titulo={<>{m.descricao} · <span className="text-suave">{m.ativo}</span></>}
                subtitulo={
                  `${m.tipo}` +
                  (m.fornecedor ? ` · ${m.fornecedor}` : "") +
                  (m.dataAgendada ? ` · ${dataCurta(m.dataAgendada)}` : "") +
                  (Number(m.custo) > 0 ? ` · ${dinheiro(m.custo)}` : "")
                }
                direita={<Selo tom={m.status}>{ROTULO_STATUS[m.status] ?? m.status}</Selo>}
              />
            ))}
          </Lista>
          <p className="text-xs text-mudo">{data.meta.total} manutenção(ões)</p>
        </>
      )}

      {nova && <ModalNova aoFechar={() => setNova(false)} />}
    </div>
  );
}

function ModalNova({ aoFechar }: { aoFechar: () => void }) {
  const notificar = useToast();
  const fila = useQueryClient();
  const [ativo, setAtivo] = useState<ItemSeletor | null>(null);
  const [fornecedor, setFornecedor] = useState<ItemSeletor | null>(null);
  const [criandoOficina, setCriandoOficina] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({ tipo: "preventiva" });
  const [enviando, setEnviando] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));

  const enviar = async () => {
    if (!ativo) return;
    setEnviando(true);
    try {
      await api.post("/manutencoes", {
        ativo_id: ativo.id,
        tipo: campos.tipo,
        descricao: campos.descricao,
        fornecedor_id: fornecedor?.id ?? null,
        data_agendada: campos.data_agendada || null,
        observacoes: campos.observacoes || null,
      });
      fila.invalidateQueries({ queryKey: ["manutencoes"] });
      notificar({ tipo: "ok", titulo: "Manutenção agendada" });
      aoFechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível agendar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal aberto aoFechar={aoFechar} titulo="Nova manutenção">
      <div className="space-y-4">
        <Seletor rotulo="Ativo" recurso="ativos" selecionado={ativo} aoSelecionar={setAtivo} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Tipo">
            <Selecao value={campos.tipo} onChange={set("tipo")}>
              {TIPOS_MANUTENCAO.map((t) => <option key={t} value={t}>{t}</option>)}
            </Selecao>
          </Campo>
          <Campo rotulo="Data agendada (opcional)">
            <Entrada type="date" value={campos.data_agendada ?? ""} onChange={set("data_agendada")} />
          </Campo>
        </div>
        <Campo rotulo="Descrição">
          <Entrada value={campos.descricao ?? ""} onChange={set("descricao")} placeholder="Ex.: Revisão dos 30 mil km" />
        </Campo>
        <div>
          <Seletor
            rotulo="Oficina (opcional)"
            recurso="pessoas"
            selecionado={fornecedor}
            aoSelecionar={setFornecedor}
            filtro="papel=oficina"
          />
          {!fornecedor && !criandoOficina && (
            <button type="button" onClick={() => setCriandoOficina(true)} className="mt-1 text-xs text-ouro hover:underline">
              + cadastrar oficina
            </button>
          )}
          {criandoOficina && (
            <NovaOficinaInline
              aoCriar={(item) => { setFornecedor(item); setCriandoOficina(false); }}
              aoCancelar={() => setCriandoOficina(false)}
            />
          )}
        </div>
        <Campo rotulo="Observações (opcional)">
          <AreaTexto value={campos.observacoes ?? ""} onChange={set("observacoes")} />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={aoFechar}>Cancelar</Botao>
          <Botao onClick={enviar} carregando={enviando} disabled={!ativo || !campos.descricao || enviando}>
            Agendar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

// Cadastro rápido de oficina (PJ marcada como oficina) sem sair da manutenção —
// mesma ideia do "+ nova categoria/conta" no lançamento. Sem tabela paralela:
// é uma `pessoa` com o papel `oficina` (doc 02 §1).
function NovaOficinaInline({
  aoCriar, aoCancelar,
}: { aoCriar: (item: ItemSeletor) => void; aoCancelar: () => void }) {
  const notificar = useToast();
  const [nome, setNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setSalvando(true);
    try {
      const { dados } = await api.post<{ dados: { id: string; nome: string } }>("/pessoas", {
        tipo: "pj", nome, cpf_cnpj: cnpj, eh_oficina: true,
      });
      notificar({ tipo: "ok", titulo: "Oficina cadastrada" });
      aoCriar({ id: dados.id, titulo: dados.nome, subtitulo: "Oficina" });
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível cadastrar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-md border border-borda bg-elevado/40 p-3">
      <Campo rotulo="Nome da oficina">
        <Entrada value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Auto Center Silva" />
      </Campo>
      <Campo rotulo="CNPJ">
        <Entrada value={cnpj} onChange={(e) => setCnpj(e.target.value)} placeholder="Só números" />
      </Campo>
      <div className="flex justify-end gap-2">
        <Botao variante="fantasma" tamanho="sm" onClick={aoCancelar}>Cancelar</Botao>
        <Botao tamanho="sm" onClick={salvar} carregando={salvando} disabled={nome.length < 2 || cnpj.length < 11 || salvando}>
          Cadastrar
        </Botao>
      </div>
    </div>
  );
}
