// A página do ativo: o centro de tudo sobre aquele bem, em uma única visão.
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PencilLine, Archive, ArchiveRestore, History, TrendingUp, TrendingDown,
  Scale, Percent, CarFront, Workflow, Wrench, CircleDollarSign, Tag,
} from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Kpi, Selo, Modal, Timeline, useToast, dinheiro, dataCurta,
  SkeletonLinhas, EstadoVazio, Lista, ListaLinha, type EventoTimeline,
} from "../componentes/ui";
import { Galeria, Documentos } from "../componentes/Anexos";
import { Comentarios } from "../componentes/Comentarios";
import { TagsFavoritos } from "../componentes/TagsFavoritos";

interface AtivoDetalheDados {
  id: string;
  codigo: string;
  nome: string;
  status: string;
  valorAquisicao: string | null;
  valorFipe: string | null;
  dataAquisicao: string | null;
  localizacao: string | null;
  observacoes: string | null;
  deletedAt: string | null;
  categoria: { nome: string; ehVeicular: boolean };
  veiculo: {
    placa: string; renavam: string | null; chassi: string | null;
    marca: string; modelo: string; anoFabricacao: number | null; anoModelo: number | null;
    cor: string | null; combustivel: string | null; kmAtual: number;
  } | null;
  financeiro: {
    receita: number; custos: number; lucro: number; roi: number | null;
    precoVendaEstimado: number | null; lucroVendaEsperado: number | null;
  };
  operacoes: Array<{ id: string; codigo: string; tipo: string; status: string; valor_total: string; data_inicio: string; cliente: string }>;
  manutencoes: Array<{ id: string; tipo: string; status: string; descricao: string; data_agendada: string | null; fornecedor: string | null; custo: string }>;
  lancamentos: Array<{ id: string; tipo: string; descricao: string; valor: string; status: string; data_vencimento: string; data_pagamento: string | null }>;
}

const ROTULOS: Record<string, string> = {
  disponivel: "disponível", reservado: "reservado", alugado: "alugado",
  em_manutencao: "em manutenção", em_uso_interno: "em uso interno",
  vendido: "vendido", baixado: "baixado",
};

export function AtivoDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navegar = useNavigate();
  const fila = useQueryClient();
  const notificar = useToast();
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);

  const { data: ativo } = useQuery({
    queryKey: ["ativo", id],
    queryFn: () => api.get<{ dados: AtivoDetalheDados }>(`/ativos/${id}`).then((r) => r.dados),
  });
  const { data: eventos, isLoading: carregandoTimeline } = useQuery({
    queryKey: ["ativo-timeline", id],
    queryFn: () => api.get<{ dados: EventoTimeline[] }>(`/ativos/${id}/timeline`).then((r) => r.dados),
  });

  if (!ativo) return <SkeletonLinhas linhas={8} />;

  const invalidar = () => {
    fila.invalidateQueries({ queryKey: ["ativo", id] });
    fila.invalidateQueries({ queryKey: ["ativos"] });
    fila.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const arquivar = async () => {
    try {
      await api.delete(`/ativos/${id}`);
      invalidar();
      notificar({ tipo: "ok", titulo: "Ativo arquivado" });
      navegar("/ativos");
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível arquivar", descricao: e instanceof ApiError ? e.message : undefined });
      setConfirmarArquivo(false);
    }
  };
  const reativar = async () => {
    await api.post(`/ativos/${id}/reativar`);
    invalidar();
    notificar({ tipo: "ok", titulo: "Ativo reativado" });
  };

  const fin = ativo.financeiro;
  const v = ativo.veiculo;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{ativo.nome}</h1>
        <span className="font-display text-sm font-bold text-ouro">{ativo.codigo}</span>
        <Selo tom={ativo.status}>{ROTULOS[ativo.status] ?? ativo.status}</Selo>
        {ativo.deletedAt && <Selo tom="erro">arquivado</Selo>}
        <div className="ml-auto flex gap-2">
          {pode("ativos", "editar") && !ativo.deletedAt && (
            <Link to={`/ativos/${ativo.id}/editar`}>
              <Botao variante="secundario" tamanho="sm">
                <PencilLine className="h-3.5 w-3.5" /> Editar
              </Botao>
            </Link>
          )}
          {pode("ativos", "arquivar") &&
            (ativo.deletedAt ? (
              <Botao variante="secundario" tamanho="sm" onClick={reativar}>
                <ArchiveRestore className="h-3.5 w-3.5" /> Reativar
              </Botao>
            ) : (
              <Botao variante="perigo" tamanho="sm" onClick={() => setConfirmarArquivo(true)}>
                <Archive className="h-3.5 w-3.5" /> Arquivar
              </Botao>
            ))}
        </div>
      </div>

      <TagsFavoritos entidadeTipo="ativo" entidadeId={ativo.id} />

      {/* Resultado financeiro do ativo — origem rastreável de cada número */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi rotulo="Receita acumulada" valor={dinheiro(fin.receita)} icone={TrendingUp} tom="ok" />
        <Kpi rotulo="Custos acumulados" valor={dinheiro(fin.custos)} icone={TrendingDown} tom="erro" />
        <Kpi rotulo="Lucro líquido" valor={dinheiro(fin.lucro)} icone={Scale} tom={fin.lucro >= 0 ? "ouro" : "erro"} />
        <Kpi
          rotulo="ROI"
          valor={fin.roi !== null ? `${fin.roi}%` : "—"}
          icone={Percent}
          tom={fin.roi !== null && fin.roi >= 0 ? "ouro" : "neutro"}
          detalhe={ativo.valorAquisicao ? `sobre ${dinheiro(ativo.valorAquisicao)}` : "sem valor de compra"}
        />
      </div>

      {/* Projeção: lucro se vendermos hoje a 95% da FIPE (separado dos números realizados) */}
      <Card>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2 text-mudo">
            <Tag className="h-4 w-4" />
            <span className="text-xs font-medium uppercase tracking-wider">Expectativa de lucro de venda</span>
          </div>
          {fin.lucroVendaEsperado !== null ? (
            <>
              <p
                className={`font-display text-2xl font-bold ${
                  fin.lucroVendaEsperado >= 0 ? "text-ouro" : "text-erro"
                }`}
              >
                {dinheiro(fin.lucroVendaEsperado)}
              </p>
              <p className="text-xs text-mudo">
                vendendo a 95% da FIPE ({dinheiro(fin.precoVendaEstimado ?? 0)})
                {" − "}
                custo de compra e custos acumulados
              </p>
            </>
          ) : (
            <p className="text-sm text-mudo">Informe o valor FIPE do ativo para calcular.</p>
          )}
        </div>
      </Card>

      <Galeria entidadeTipo="ativo" entidadeId={ativo.id} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card titulo="Dados" icone={CarFront}>
            <dl className="space-y-1.5 text-sm">
              <div><dt className="inline text-suave">Categoria: </dt><dd className="inline">{ativo.categoria.nome}</dd></div>
              {v && (
                <>
                  <div><dt className="inline text-suave">Placa: </dt><dd className="inline font-medium">{v.placa}</dd></div>
                  <div><dt className="inline text-suave">Marca/Modelo: </dt><dd className="inline">{v.marca} {v.modelo}</dd></div>
                  {(v.anoFabricacao || v.anoModelo) && (
                    <div><dt className="inline text-suave">Ano: </dt><dd className="inline">{v.anoFabricacao ?? "—"}/{v.anoModelo ?? "—"}</dd></div>
                  )}
                  {v.cor && <div><dt className="inline text-suave">Cor: </dt><dd className="inline">{v.cor}</dd></div>}
                  <div><dt className="inline text-suave">Km: </dt><dd className="inline">{v.kmAtual.toLocaleString("pt-BR")}</dd></div>
                  {v.renavam && <div><dt className="inline text-suave">Renavam: </dt><dd className="inline">{v.renavam}</dd></div>}
                  {v.chassi && <div><dt className="inline text-suave">Chassi: </dt><dd className="inline">{v.chassi}</dd></div>}
                </>
              )}
              {ativo.valorAquisicao && (
                <div><dt className="inline text-suave">Valor de compra: </dt><dd className="inline">{dinheiro(ativo.valorAquisicao)}</dd></div>
              )}
              {ativo.valorFipe && (
                <div><dt className="inline text-suave">Valor FIPE: </dt><dd className="inline">{dinheiro(ativo.valorFipe)}</dd></div>
              )}
              {ativo.dataAquisicao && (
                <div><dt className="inline text-suave">Aquisição: </dt><dd className="inline">{dataCurta(ativo.dataAquisicao)}</dd></div>
              )}
              {ativo.localizacao && (
                <div><dt className="inline text-suave">Localização: </dt><dd className="inline">{ativo.localizacao}</dd></div>
              )}
              {ativo.observacoes && <p className="pt-2 text-suave">{ativo.observacoes}</p>}
            </dl>
          </Card>

          <Documentos entidadeTipo="ativo" entidadeId={ativo.id} />
          <Comentarios entidadeTipo="ativo" entidadeId={ativo.id} />
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card titulo="História completa" icone={History}>
            {carregandoTimeline ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
          </Card>

          <Card titulo="Operações" icone={Workflow}>
            {ativo.operacoes.length === 0 ? (
              <EstadoVazio icone={Workflow} titulo="Nenhuma operação ainda" descricao="Locações, guinchos e vendas deste ativo aparecem aqui." />
            ) : (
              <Lista>
                {ativo.operacoes.map((o) => (
                  <ListaLinha
                    key={o.id}
                    titulo={
                      <>
                        <span className="font-display font-bold text-ouro">{o.codigo}</span> · {o.tipo} · {o.cliente}
                      </>
                    }
                    subtitulo={`${dataCurta(o.data_inicio)} · ${dinheiro(o.valor_total)}`}
                    direita={<Selo tom={o.status}>{o.status.replace(/_/g, " ")}</Selo>}
                  />
                ))}
              </Lista>
            )}
          </Card>

          <Card titulo="Manutenções" icone={Wrench}>
            {ativo.manutencoes.length === 0 ? (
              <EstadoVazio icone={Wrench} titulo="Nenhuma manutenção registrada" />
            ) : (
              <Lista>
                {ativo.manutencoes.map((m) => (
                  <ListaLinha
                    key={m.id}
                    titulo={m.descricao}
                    subtitulo={
                      `${m.tipo}` +
                      (m.fornecedor ? ` · ${m.fornecedor}` : "") +
                      (m.data_agendada ? ` · ${dataCurta(m.data_agendada)}` : "")
                    }
                    direita={
                      <>
                        <span className="text-xs text-suave">{dinheiro(m.custo)}</span>
                        <Selo tom={m.status === "concluida" ? "ok" : m.status === "cancelada" ? "erro" : "alerta"}>
                          {m.status.replace(/_/g, " ")}
                        </Selo>
                      </>
                    }
                  />
                ))}
              </Lista>
            )}
          </Card>

          <Card titulo="Histórico financeiro" icone={CircleDollarSign}>
            {ativo.lancamentos.length === 0 ? (
              <EstadoVazio icone={CircleDollarSign} titulo="Nenhum lançamento vinculado" />
            ) : (
              <Lista>
                {ativo.lancamentos.map((l) => (
                  <ListaLinha
                    key={l.id}
                    titulo={l.descricao}
                    subtitulo={
                      l.data_pagamento
                        ? `pago em ${dataCurta(l.data_pagamento)}`
                        : `vence ${dataCurta(l.data_vencimento)}`
                    }
                    direita={
                      <span className={`text-sm font-medium ${l.tipo === "receita" ? "text-ok" : "text-erro"}`}>
                        {l.tipo === "receita" ? "+" : "−"} {dinheiro(l.valor)}
                      </span>
                    }
                  />
                ))}
              </Lista>
            )}
          </Card>
        </div>
      </div>

      <Modal aberto={confirmarArquivo} aoFechar={() => setConfirmarArquivo(false)} titulo="Arquivar ativo">
        <p className="text-sm text-suave">
          <span className="font-medium text-texto">{ativo.nome}</span> sairá das listagens e buscas,
          mas toda a história, fotos e documentos permanecem preservados. Você pode reativá-lo quando quiser.
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
