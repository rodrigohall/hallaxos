import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilLine, Archive, IdCard, Gauge, History } from "lucide-react";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import {
  Botao, Card, Selo, Modal, Timeline, useToast, dataCurta,
  SkeletonLinhas, type EventoTimeline,
} from "../componentes/ui";

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
}

export function PessoaDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navegar = useNavigate();
  const filaQueries = useQueryClient();
  const notificar = useToast();
  const [confirmarArquivo, setConfirmarArquivo] = useState(false);

  const { data: pessoa } = useQuery({
    queryKey: ["pessoa", id],
    queryFn: () => api.get<{ dados: Detalhe }>(`/pessoas/${id}`).then((r) => r.dados),
  });

  const { data: eventos, isLoading: carregandoTimeline } = useQuery({
    queryKey: ["pessoa-timeline", id],
    queryFn: () =>
      api.get<{ dados: EventoTimeline[] }>(`/pessoas/${id}/timeline`).then((r) => r.dados),
  });

  if (!pessoa) return <SkeletonLinhas linhas={6} />;

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-lg font-bold">{pessoa.nome}</h1>
        {pessoa.papeis.map((p) => (
          <Selo key={p} tom="ouro">{p}</Selo>
        ))}
        {pessoa.deletedAt && <Selo>arquivado</Selo>}
        <div className="ml-auto flex gap-2">
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

      <div className="grid gap-4 lg:grid-cols-3">
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

          <Card titulo="Resumo" icone={Gauge}>
            <div className="flex gap-6">
              <div>
                <p className="font-display text-2xl font-bold">{pessoa.contadores.operacoes}</p>
                <p className="text-xs text-suave">operações</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold">{pessoa.contadores.lancamentos_pendentes}</p>
                <p className="text-xs text-suave">lançamentos pendentes</p>
              </div>
            </div>
          </Card>
        </div>

        <Card titulo="História completa" icone={History} className="lg:col-span-2">
          {carregandoTimeline ? <SkeletonLinhas linhas={4} /> : <Timeline eventos={eventos ?? []} />}
        </Card>
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
