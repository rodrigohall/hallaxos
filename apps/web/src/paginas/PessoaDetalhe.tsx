import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useAuth } from "../auth";
import { Botao, Card, Selo, dataCurta, dataHora } from "../componentes/ui";

interface Detalhe {
  id: string;
  tipo: "pf" | "pj";
  nome: string;
  nomeFantasia: string | null;
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

interface EventoTimeline {
  id: string;
  evento: string;
  descricao: string;
  dados: Record<string, { de: unknown; para: unknown }> | null;
  createdAt: string;
}

export function PessoaDetalhe() {
  const { id } = useParams();
  const { pode } = useAuth();
  const navegar = useNavigate();
  const filaQueries = useQueryClient();

  const { data: pessoa } = useQuery({
    queryKey: ["pessoa", id],
    queryFn: () => api.get<{ dados: Detalhe }>(`/pessoas/${id}`).then((r) => r.dados),
  });

  const { data: eventos } = useQuery({
    queryKey: ["pessoa-timeline", id],
    queryFn: () =>
      api.get<{ dados: EventoTimeline[] }>(`/pessoas/${id}/timeline`).then((r) => r.dados),
  });

  if (!pessoa) return <p className="text-suave">Carregando…</p>;

  const arquivar = async () => {
    if (!confirm(`Arquivar o cadastro de ${pessoa.nome}? Ele sai das buscas mas permanece no histórico.`))
      return;
    await api.delete(`/pessoas/${id}`);
    filaQueries.invalidateQueries({ queryKey: ["pessoas"] });
    navegar("/clientes");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">{pessoa.nome}</h1>
        {pessoa.papeis.map((p) => (
          <Selo key={p}>{p}</Selo>
        ))}
        {pessoa.deletedAt && <Selo>arquivado</Selo>}
        <div className="ml-auto flex gap-2">
          {pode("pessoas", "editar") && !pessoa.deletedAt && (
            <Link to={`/clientes/${pessoa.id}/editar`}>
              <Botao variante="secundario">Editar</Botao>
            </Link>
          )}
          {pode("pessoas", "arquivar") && !pessoa.deletedAt && (
            <Botao variante="perigo" onClick={arquivar}>
              Arquivar
            </Botao>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card titulo="Dados">
          <dl className="space-y-1 text-sm">
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
                  {pessoa.cnhValidade ? ` (val. ${dataCurta(pessoa.cnhValidade)})` : ""}
                </dd>
              </div>
            )}
            {pessoa.observacoes && <p className="pt-2 text-suave">{pessoa.observacoes}</p>}
          </dl>
        </Card>

        <Card titulo="Resumo">
          <p className="text-sm">
            <span className="text-2xl font-bold">{pessoa.contadores.operacoes}</span>{" "}
            <span className="text-suave">operações</span>
          </p>
          <p className="text-sm">
            <span className="text-2xl font-bold">{pessoa.contadores.lancamentos_pendentes}</span>{" "}
            <span className="text-suave">lançamentos pendentes</span>
          </p>
        </Card>

        <Card titulo="História completa">
          {!eventos?.length && <p className="text-sm text-suave">Sem eventos ainda.</p>}
          <ol className="space-y-3">
            {eventos?.map((e) => (
              <li key={e.id} className="border-l-2 border-marca/40 pl-3">
                <p className="text-sm">{e.descricao}</p>
                {e.dados && (
                  <ul className="mt-1 text-xs text-suave">
                    {Object.entries(e.dados).map(([campo, { de, para }]) => (
                      <li key={campo}>
                        {campo}: {String(de ?? "—")} → {String(para ?? "—")}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-xs text-suave">{dataHora(e.createdAt)}</p>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </div>
  );
}
