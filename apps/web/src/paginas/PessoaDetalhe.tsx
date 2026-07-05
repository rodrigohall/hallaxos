import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PencilLine, Archive, IdCard, Gauge, History, TrendingUp, Clock,
  AlertCircle, Workflow, ChevronDown, Plus, DollarSign, ChevronRight, Sparkles,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useCopiloto } from "../componentes/Copiloto";
import {
  Botao, Card, Kpi, Selo, Modal, Timeline, VerMais, EstadoVazio, useToast,
  dataCurta, dinheiro, SkeletonLinhas, Lista, ListaLinha, type EventoTimeline,
} from "../componentes/ui";

interface LancamentoResumo {
  id: string; tipo: string; descricao: string; valor: string; status: string;
  data_vencimento: string; data_pagamento: string | null; categoria: string;
}

interface OperacaoResumo {
  id: string; codigo: string; tipo: string; status: string;
  data_inicio: string; ativo: string | null; ativo_id: string | null;
}

interface ResumoFinanceiro {
  faturado: number; a_receber: number; vencido: number; qtd_operacoes: number;
}

interface Detalhe {
  id: string;
  tipo: "pf" | "pj";
  nome: string;
  cpfCnpj: string;
  email: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  cnhNumero: string | null;
  cnhValidade: string | null;
  observacoes: string | null;
  deletedAt: string | null;
  papeis: string[];
  contadores: { operacoes: number; lancamentos_pendentes: number };
  resumoFinanceiro: ResumoFinanceiro | null;
  operacoesRecentes: OperacaoResumo[];
  lancamentosRecentes: LancamentoResumo[];
}

const LIMITE_LISTA = 5;

export function PessoaDetalhe() {
  const { id } = useParams();
  const { pode, copilotoAtivo } = useAuth();
  const navegar = useNavigate();
  const filaQueries = useQueryClient();
  const { abrir: abrirCopiloto } = useCopiloto();
  const notificar = useToast();
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);
  const [verMaisOps, setVerMaisOps] = useState(false);
  const [verMaisLanc, setVerMaisLanc] = useState(false);

  const { data: pessoa } = useQuery({
    queryKey: ["pessoa", id],
    queryFn: () => api.get<{ dados: Detalhe }>(`/pessoas/${id}`).then((r) => r.dados),
  });

  const { data: eventos, isLoading: carregandoTimeline } = useQuery({
    queryKey: ["pessoa-timeline", id],
    queryFn: () =>
      api.get<{ dados: EventoTimeline[] }>(`/pessoas/${id}/timeline`).then((r) => r.dados),
  });

  if (!pessoa) return <SkeletonLinhas linhas={8} />;

  const arquivar = async () => {
    try {
      await api.delete(`/pessoas/${id}`);
      filaQueries.invalidateQueries({ queryKey: ["pessoas"] });
      notificar({ tipo: "ok", titulo: "Cadastro arquivado", descricao: `${pessoa.nome} saiu das buscas, mas a história permanece.` });
      navegar("/clientes");
    } catch (err) {
      notificar({
        tipo: "erro",
        titulo: "Não foi possível arquivar",
        descricao: err instanceof ApiError ? err.message : undefined,
      });
      setConfirmarArquivo(false);
    }
  };

  const rf = pessoa.resumoFinanceiro;
  const ops = pessoa.operacoesRecentes ?? [];
  const lancs = pessoa.lancamentosRecentes ?? [];
  const opsVisiveis = verMaisOps ? ops : ops.slice(0, LIMITE_LISTA);
  const lancsVisiveis = verMaisLanc ? lancs : lancs.slice(0, LIMITE_LISTA);

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{pessoa.nome}</h1>
        {pessoa.papeis.map((p) => (
          <Selo key={p} tom="ouro">{p}</Selo>
        ))}
        {pessoa.deletedAt && <Selo>arquivado</Selo>}
        <div className="ml-auto flex gap-2">
          {copilotoAtivo && (
            <Botao
              variante="fantasma"
              tamanho="sm"
              onClick={() => abrirCopiloto(
                `Resuma a situação atual do cliente ${pessoa.nome}: operações em andamento, saldo financeiro e pendências.`
              )}
            >
              <Sparkles className="h-3.5 w-3.5 text-ouro" /> Perguntar
            </Botao>
          )}
          {pode("pessoas", "editar") && !pessoa.deletedAt && (
            <Link to={`/clientes/${pessoa.id}/editar`}>
              <Botao variante="secundario" tamanho="sm">
                <PencilLine className="h-3.5 w-3.5" /> Editar
              </Botao>
            </Link>
          )}
          {pode("pessoas", "arquivar") && !pessoa.deletedAt && (
            <Botao variante="perigo" tamanho="sm" onClick={() => setConfirmarArquivo(true)}>
              <Archive className="h-3.5 w-3.5" /> Arquivar
            </Botao>
          )}
        </div>
      </div>

      {/* KPIs — mesma grade da ficha 360° de Ativo */}
      {rf && (
        <div className="animar-cascata grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Kpi rotulo="Faturado" valor={dinheiro(rf.faturado)} icone={TrendingUp} tom="ok" />
          <Kpi rotulo="A receber" valor={dinheiro(rf.a_receber)} icone={Clock} />
          <Kpi
            rotulo="Vencido"
            valor={dinheiro(rf.vencido)}
            icone={AlertCircle}
            tom={rf.vencido > 0 ? "erro" : "neutro"}
            className={rf.vencido > 0 ? "border-erro/25" : ""}
          />
          <Kpi rotulo="Operações" valor={rf.qtd_operacoes} icone={Workflow} tom="ouro" />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Coluna esquerda: dados */}
        <div className="space-y-4">
          <Card titulo="Dados" icone={IdCard}>
            <dl className="space-y-1.5 text-sm">
              <div>
                <dt className="inline text-suave">{pessoa.tipo === "pj" ? "CNPJ: " : "CPF: "}</dt>
                <dd className="inline">{pessoa.cpfCnpj}</dd>
              </div>
              {pessoa.telefone && (
                <div><dt className="inline text-suave">Telefone: </dt><dd className="inline">{pessoa.telefone}</dd></div>
              )}
              {pessoa.email && (
                <div><dt className="inline text-suave">E-mail: </dt><dd className="inline">{pessoa.email}</dd></div>
              )}
              {pessoa.cidade && (
                <div><dt className="inline text-suave">Cidade: </dt><dd className="inline">{pessoa.cidade}{pessoa.uf ? `/${pessoa.uf}` : ""}</dd></div>
              )}
              {pessoa.cnhNumero && (
                <div>
                  <dt className="inline text-suave">CNH: </dt>
                  <dd className="inline">
                    {pessoa.cnhNumero}
                    {pessoa.cnhValidade ? ` · validade ${dataCurta(pessoa.cnhValidade)}` : ""}
                  </dd>
                </div>
              )}
              {pessoa.observacoes && <p className="pt-2 text-suave">{pessoa.observacoes}</p>}
            </dl>
          </Card>

          {/* CTA rápido */}
          {!pessoa.deletedAt && pode("operacoes", "criar") && (
            <button
              className="animar-surgir superficie elevar flex w-full items-center gap-3 rounded-lg border border-borda p-4 text-left shadow-painel"
              onClick={() => navegar(`/operacoes/nova?cliente_id=${pessoa.id}`)}
            >
              <Plus className="h-4 w-4 text-ouro" />
              <div>
                <p className="text-sm font-medium">Nova operação</p>
                <p className="text-xs text-suave">para este cliente</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-mudo" />
            </button>
          )}
        </div>

        {/* Coluna direita: operações + lançamentos + timeline */}
        <div className="space-y-4 lg:col-span-2">
          {/* Operações */}
          <Card titulo="Operações" icone={Workflow}>
            {ops.length === 0 ? (
              <EstadoVazio
                icone={Workflow}
                titulo="Nenhuma operação ainda"
                acao={
                  !pessoa.deletedAt && pode("operacoes", "criar") && (
                    <Botao variante="secundario" tamanho="sm" onClick={() => navegar(`/operacoes/nova?cliente_id=${pessoa.id}`)}>
                      <Plus className="h-3.5 w-3.5" /> Nova operação
                    </Botao>
                  )
                }
              />
            ) : (
              <>
                <Lista>
                  {opsVisiveis.map((op) => (
                    <ListaLinha
                      key={op.id}
                      para={`/operacoes/${op.id}`}
                      titulo={
                        <span className="flex items-center gap-2">
                          <span className="font-display text-xs font-bold text-ouro">{op.codigo}</span>
                          <Selo>{op.tipo}</Selo>
                          <Selo tom={op.status}>{op.status.replace(/_/g, " ")}</Selo>
                        </span>
                      }
                      subtitulo={
                        <span>
                          {op.ativo ?? "Sem ativo"} · {dataCurta(op.data_inicio)}
                        </span>
                      }
                    />
                  ))}
                </Lista>
                {ops.length > LIMITE_LISTA && (
                  <VerMais
                    aberto={verMaisOps}
                    aoAlternar={() => setVerMaisOps((v) => !v)}
                    rotulo={`Ver mais ${ops.length - LIMITE_LISTA}`}
                  />
                )}
              </>
            )}
          </Card>

          {/* Lançamentos */}
          <Card titulo="Financeiro" icone={DollarSign}>
            {lancs.length === 0 ? (
              <EstadoVazio icone={DollarSign} titulo="Nenhum lançamento" descricao="Nada vinculado a esta pessoa ainda." />
            ) : (
              <>
                <Lista>
                  {lancsVisiveis.map((l) => {
                    const vencido = l.status === "previsto" && new Date(l.data_vencimento) < new Date();
                    return (
                      <ListaLinha
                        key={l.id}
                        titulo={
                          <span className="flex items-center gap-2">
                            <span className={`font-semibold ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                              {l.tipo === "receita" ? "+" : "-"}{dinheiro(Number(l.valor))}
                            </span>
                            <span className="truncate">{l.descricao}</span>
                          </span>
                        }
                        subtitulo={
                          <span className="flex gap-2">
                            <span>{l.categoria}</span>
                            <span>
                              {l.status === "pago" && l.data_pagamento
                                ? `Pago ${dataCurta(l.data_pagamento)}`
                                : `Vence ${dataCurta(l.data_vencimento)}`}
                            </span>
                          </span>
                        }
                        direita={
                          <Selo tom={l.status === "pago" ? "ok" : vencido ? "erro" : "info"}>
                            {l.status === "pago" ? "pago" : vencido ? "vencido" : l.status}
                          </Selo>
                        }
                      />
                    );
                  })}
                </Lista>
                {lancs.length > LIMITE_LISTA && (
                  <VerMais
                    aberto={verMaisLanc}
                    aoAlternar={() => setVerMaisLanc((v) => !v)}
                    rotulo={`Ver mais ${lancs.length - LIMITE_LISTA}`}
                  />
                )}
              </>
            )}
          </Card>

          {/* Timeline */}
          <Card titulo="História completa" icone={History} className="lg:col-span-2">
            {carregandoTimeline ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
          </Card>
        </div>
      </div>

      <Modal
        aberto={confirmarArquivo}
        aoFechar={() => setConfirmarArquivo(false)}
        titulo="Arquivar cadastro"
      >
        <p className="text-sm text-suave">
          <span className="font-medium text-texto">{pessoa.nome}</span> sairá das buscas e listagens,
          mas toda a história permanece preservada. Esta ação pode ser desfeita por um administrador.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Botao variante="fantasma" onClick={() => setConfirmarArquivo(false)}>Cancelar</Botao>
          <Botao variante="perigo" onClick={arquivar}>
            <Archive className="h-3.5 w-3.5" /> Arquivar
          </Botao>
        </div>
      </Modal>
    </div>
  );
}
