// Aba "Pró-labore" do hub financeiro — quanto o dono recebe no período.
//
// A tela existe para responder uma pergunta ("quanto eu tiro esse mês?") sem
// que a resposta precise de fé: cada parcela mostra a conta que a gerou, e
// cada operação, ativo e venda que entrou no cálculo é clicável até a ficha.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Wallet, Truck, CarFront, Tags, Calculator, SlidersHorizontal, Save,
} from "lucide-react";
import { api } from "../../api";
import { useAuth } from "../../auth";
import {
  Botao, Campo, Card, Entrada, EstadoVazio, Kpi, Segmentado, Selo, SkeletonLinhas,
  Tabela, dataCurta, dinheiro, useToast,
} from "../../componentes/ui";
import { useParamUrl } from "../../hooks/estadoUrl";

interface Parametros {
  fixoMensal: number;
  pctVenda: number;
  pctExcedente: number;
  pisoMensal: number;
}

interface AtivoLocado {
  id: string | null;
  codigo: string;
  nome: string;
  receita: number;
  despesa: number;
  lucro: number;
}

interface Venda {
  operacaoId: string;
  codigo: string;
  data: string | null;
  cliente: string;
  ativoId: string | null;
  ativoCodigo: string | null;
  ativoNome: string | null;
  valorVenda: number;
  valorCompra: number;
  despesasAtivo: number;
  lucro: number;
}

interface Mes {
  mes: string;
  fracao: number;
  lucroGuincho: number;
  lucroLocacao: number;
  lucro: number;
  piso: number;
  excedente: number;
}

interface ProLabore {
  periodo: { de: string; ate: string; mesesEquivalentes: number };
  parametros: Parametros;
  guincho: {
    receita: number; despesa: number; lucro: number;
    operacoes: {
      id: string; codigo: string; status: string; data: string;
      cliente: string; receita: number; despesa: number;
    }[];
  };
  locacao: { receita: number; despesa: number; lucro: number; ativos: AtivoLocado[] };
  vendas: { lucro: number; itens: Venda[] };
  meses: Mes[];
  calculo: {
    fixo: number; comissaoVendas: number; comissaoExcedente: number;
    excedenteTotal: number; total: number;
  };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Primeiro e último dia do mês corrente — o período que abre por padrão. */
function mesCorrente(): [string, string] {
  const hoje = new Date();
  const primeiro = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 1));
  const ultimo = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() + 1, 0));
  return [iso(primeiro), iso(ultimo)];
}

function mesPassado(): [string, string] {
  const hoje = new Date();
  const primeiro = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth() - 1, 1));
  const ultimo = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), 0));
  return [iso(primeiro), iso(ultimo)];
}

function anoCorrente(): [string, string] {
  const ano = new Date().getFullYear();
  return [`${ano}-01-01`, `${ano}-12-31`];
}

const mesLegivel = (mes: string) => {
  const [ano, m] = mes.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(m) - 1] ?? m}/${ano?.slice(2)}`;
};

export function PainelProLabore() {
  const { pode } = useAuth();
  const [padraoDe, padraoAte] = useMemo(mesCorrente, []);
  const [de, definirDe] = useParamUrl("pro_de", padraoDe);
  const [ate, definirAte] = useParamUrl("pro_ate", padraoAte);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["pro-labore", de, ate],
    queryFn: () =>
      api.get<{ dados: ProLabore }>(`/relatorios/pro-labore?de=${de}&ate=${ate}`).then((r) => r.dados),
    enabled: !!de && !!ate,
  });

  const atalho = ([novoDe, novoAte]: [string, string]) => {
    definirDe(novoDe);
    definirAte(novoAte);
  };

  const periodoAtual: "mes" | "passado" | "ano" | "custom" =
    de === padraoDe && ate === padraoAte ? "mes"
    : de === mesPassado()[0] && ate === mesPassado()[1] ? "passado"
    : de === anoCorrente()[0] && ate === anoCorrente()[1] ? "ano"
    : "custom";

  return (
    <div className="space-y-4">
      {/* ── Período ──────────────────────────────────────────────────────── */}
      <Card titulo="Período" icone={Calculator}>
        <div className="flex flex-wrap items-end gap-3">
          <Campo rotulo="De">
            <Entrada
              type="date" tamanho="sm" value={de ?? ""}
              onChange={(e) => definirDe(e.target.value)}
            />
          </Campo>
          <Campo rotulo="Até">
            <Entrada
              type="date" tamanho="sm" value={ate ?? ""}
              onChange={(e) => definirAte(e.target.value)}
            />
          </Campo>
          <Segmentado
            className="mb-0.5"
            opcoes={[
              { id: "mes", rotulo: "Este mês" },
              { id: "passado", rotulo: "Mês passado" },
              { id: "ano", rotulo: "Este ano" },
              ...(periodoAtual === "custom" ? [{ id: "custom" as const, rotulo: "Personalizado" }] : []),
            ]}
            valor={periodoAtual}
            aoTrocar={(id) => {
              if (id === "mes") atalho(mesCorrente());
              if (id === "passado") atalho(mesPassado());
              if (id === "ano") atalho(anoCorrente());
            }}
          />
        </div>
      </Card>

      {isLoading ? (
        <SkeletonLinhas linhas={6} />
      ) : isError || !data ? (
        <EstadoVazio titulo="Não foi possível calcular" descricao="Confira o período e tente de novo." />
      ) : (
        <>
          <Resumo dados={data} />
          <MemoriaDeCalculo dados={data} />
          <Guincho dados={data} />
          <Locacao dados={data} />
          <Vendas dados={data} />
          {pode("pro_labore", "editar") && <ParametrosAcordo atuais={data.parametros} />}
        </>
      )}
    </div>
  );
}

// ── Resumo: o número grande e as três parcelas ────────────────────────────
function Resumo({ dados }: { dados: ProLabore }) {
  const { calculo, parametros, periodo } = dados;
  const meses = periodo.mesesEquivalentes;
  const mesesTexto = meses === 1 ? "1 mês" : `${meses.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} meses`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        rotulo="A receber no período" valor={dinheiro(calculo.total)} icone={Wallet} tom="ouro"
        detalhe={`${dataCurta(periodo.de)} a ${dataCurta(periodo.ate)}`}
      />
      <Kpi
        rotulo="Fixo" valor={dinheiro(calculo.fixo)} icone={Calculator} atraso={40}
        detalhe={`${dinheiro(parametros.fixoMensal)} × ${mesesTexto}`}
      />
      <Kpi
        rotulo={`${parametros.pctVenda}% das vendas`} valor={dinheiro(calculo.comissaoVendas)}
        icone={Tags} atraso={80}
        detalhe={`sobre ${dinheiro(dados.vendas.lucro)} de lucro`}
      />
      <Kpi
        rotulo={`${parametros.pctExcedente}% do excedente`} valor={dinheiro(calculo.comissaoExcedente)}
        icone={Truck} atraso={120}
        detalhe={`sobre ${dinheiro(calculo.excedenteTotal)} acima do piso`}
      />
    </div>
  );
}

// ── Memória de cálculo: mês a mês, porque o piso é mensal ─────────────────
function MemoriaDeCalculo({ dados }: { dados: ProLabore }) {
  const { meses, parametros } = dados;
  return (
    <Card
      titulo="Excedente mês a mês" icone={Calculator}
      acao={
        <span className="text-xs text-mudo">
          piso de {dinheiro(parametros.pisoMensal)}/mês
        </span>
      }
    >
      <p className="mb-3 text-xs text-mudo">
        O piso é mensal: cada mês desconta o seu antes de comissionar, e mês fraco
        não é compensado por mês forte. Mês parcial rateia o piso pelos dias.
      </p>
      <Tabela cabecalhos={["Mês", "Guincho", "Locação", "Lucro", "Piso", "Excedente"]}>
        {meses.map((m) => (
          <tr key={m.mes}>
            <td className="py-2 pr-4 font-medium">
              {mesLegivel(m.mes)}
              {m.fracao < 1 && (
                <span className="ml-1.5 text-xs text-mudo">
                  ({Math.round(m.fracao * 100)}%)
                </span>
              )}
            </td>
            <td className="py-2 pr-4">{dinheiro(m.lucroGuincho)}</td>
            <td className="py-2 pr-4">{dinheiro(m.lucroLocacao)}</td>
            <td className={`py-2 pr-4 font-medium ${m.lucro >= 0 ? "text-texto" : "text-erro"}`}>
              {dinheiro(m.lucro)}
            </td>
            <td className="py-2 pr-4 text-mudo">−{dinheiro(m.piso)}</td>
            <td className={`py-2 pr-4 font-medium ${m.excedente > 0 ? "text-ok" : "text-mudo"}`}>
              {dinheiro(m.excedente)}
            </td>
          </tr>
        ))}
        <tr className="border-t border-borda-forte">
          <td className="py-2 pr-4 font-semibold" colSpan={5}>
            Excedente do período · {parametros.pctExcedente}% ={" "}
            <span className="text-ouro">{dinheiro(dados.calculo.comissaoExcedente)}</span>
          </td>
          <td className="py-2 pr-4 font-semibold text-ok">{dinheiro(dados.calculo.excedenteTotal)}</td>
        </tr>
      </Tabela>
    </Card>
  );
}

// ── Guincho ───────────────────────────────────────────────────────────────
function Guincho({ dados }: { dados: ProLabore }) {
  const { guincho } = dados;
  return (
    <Card
      titulo="Guincho no período" icone={Truck}
      acao={
        <span className="text-xs">
          <span className="text-mudo">lucro </span>
          <span className="font-display font-bold text-ouro">{dinheiro(guincho.lucro)}</span>
        </span>
      }
    >
      {guincho.operacoes.length === 0 ? (
        <EstadoVazio icone={Truck} titulo="Nenhum guincho no período" />
      ) : (
        <Tabela cabecalhos={["Operação", "Data", "Cliente", "Situação", "Receita", "Despesa"]}>
          {guincho.operacoes.map((o) => (
            <tr key={o.id}>
              <td className="py-2 pr-4">
                <Link to={`/operacoes/${o.id}`} className="font-display text-xs font-bold text-ouro hover:underline">
                  {o.codigo}
                </Link>
              </td>
              <td className="py-2 pr-4 text-suave">{dataCurta(o.data)}</td>
              <td className="py-2 pr-4">{o.cliente}</td>
              <td className="py-2 pr-4"><Selo tom={o.status}>{o.status.replace(/_/g, " ")}</Selo></td>
              <td className="py-2 pr-4 text-ok">{dinheiro(o.receita)}</td>
              <td className="py-2 pr-4 text-erro">{o.despesa ? dinheiro(o.despesa) : "—"}</td>
            </tr>
          ))}
          <tr className="border-t border-borda-forte">
            <td className="py-2 pr-4 font-semibold" colSpan={4}>Total</td>
            <td className="py-2 pr-4 font-semibold text-ok">{dinheiro(guincho.receita)}</td>
            <td className="py-2 pr-4 font-semibold text-erro">{dinheiro(guincho.despesa)}</td>
          </tr>
        </Tabela>
      )}
    </Card>
  );
}

// ── Locação por ativo ─────────────────────────────────────────────────────
function Locacao({ dados }: { dados: ProLabore }) {
  const { locacao } = dados;
  return (
    <Card
      titulo="Ativos locados no período" icone={CarFront}
      acao={
        <span className="text-xs">
          <span className="text-mudo">lucro </span>
          <span className="font-display font-bold text-ouro">{dinheiro(locacao.lucro)}</span>
        </span>
      }
    >
      {locacao.ativos.length === 0 ? (
        <EstadoVazio icone={CarFront} titulo="Nenhuma locação no período" />
      ) : (
        <Tabela cabecalhos={["Ativo", "Receita", "Despesa", "Lucro"]}>
          {locacao.ativos.map((a) => (
            <tr key={a.id ?? "sem-ativo"}>
              <td className="py-2 pr-4">
                {a.id ? (
                  <Link to={`/ativos/${a.id}`} className="hover:text-ouro">
                    <span className="font-display text-xs font-bold text-ouro">{a.codigo}</span> {a.nome}
                  </Link>
                ) : (
                  <span className="text-mudo">{a.nome}</span>
                )}
              </td>
              <td className="py-2 pr-4 text-ok">{dinheiro(a.receita)}</td>
              <td className="py-2 pr-4 text-erro">{dinheiro(a.despesa)}</td>
              <td className={`py-2 pr-4 font-medium ${a.lucro >= 0 ? "text-texto" : "text-erro"}`}>
                {dinheiro(a.lucro)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-borda-forte">
            <td className="py-2 pr-4 font-semibold">Total</td>
            <td className="py-2 pr-4 font-semibold text-ok">{dinheiro(locacao.receita)}</td>
            <td className="py-2 pr-4 font-semibold text-erro">{dinheiro(locacao.despesa)}</td>
            <td className={`py-2 pr-4 font-semibold ${locacao.lucro >= 0 ? "text-ouro" : "text-erro"}`}>
              {dinheiro(locacao.lucro)}
            </td>
          </tr>
        </Tabela>
      )}
    </Card>
  );
}

// ── Vendas ────────────────────────────────────────────────────────────────
function Vendas({ dados }: { dados: ProLabore }) {
  const { vendas, parametros } = dados;
  return (
    <Card
      titulo="Vendas de ativos no período" icone={Tags}
      acao={
        <span className="text-xs">
          <span className="text-mudo">lucro </span>
          <span className="font-display font-bold text-ouro">{dinheiro(vendas.lucro)}</span>
        </span>
      }
    >
      <p className="mb-3 text-xs text-mudo">
        Lucro = venda − compra − despesas do ativo (manutenções e custos diretos de
        toda a vida dele, não só do período). Base dos {parametros.pctVenda}%.
      </p>
      {vendas.itens.length === 0 ? (
        <EstadoVazio icone={Tags} titulo="Nenhuma venda no período" />
      ) : (
        <Tabela cabecalhos={["Venda", "Data", "Ativo", "Vendido por", "Comprado por", "Despesas", "Lucro"]}>
          {vendas.itens.map((v) => (
            <tr key={v.operacaoId}>
              <td className="py-2 pr-4">
                <Link to={`/operacoes/${v.operacaoId}`} className="font-display text-xs font-bold text-ouro hover:underline">
                  {v.codigo}
                </Link>
                <span className="block text-xs text-mudo">{v.cliente}</span>
              </td>
              <td className="py-2 pr-4 text-suave">{v.data ? dataCurta(v.data) : "—"}</td>
              <td className="py-2 pr-4">
                {v.ativoId ? (
                  <Link to={`/ativos/${v.ativoId}`} className="hover:text-ouro">
                    <span className="font-display text-xs font-bold text-ouro">{v.ativoCodigo}</span>{" "}
                    {v.ativoNome}
                  </Link>
                ) : (
                  <span className="text-mudo">—</span>
                )}
              </td>
              <td className="py-2 pr-4 text-ok">{dinheiro(v.valorVenda)}</td>
              <td className="py-2 pr-4 text-suave">−{dinheiro(v.valorCompra)}</td>
              <td className="py-2 pr-4 text-erro">−{dinheiro(v.despesasAtivo)}</td>
              <td className={`py-2 pr-4 font-medium ${v.lucro >= 0 ? "text-texto" : "text-erro"}`}>
                {dinheiro(v.lucro)}
              </td>
            </tr>
          ))}
          <tr className="border-t border-borda-forte">
            <td className="py-2 pr-4 font-semibold" colSpan={6}>
              Lucro das vendas · {parametros.pctVenda}% ={" "}
              <span className="text-ouro">{dinheiro(dados.calculo.comissaoVendas)}</span>
            </td>
            <td className="py-2 pr-4 font-semibold">{dinheiro(vendas.lucro)}</td>
          </tr>
        </Tabela>
      )}
    </Card>
  );
}

// ── Parâmetros do acordo ──────────────────────────────────────────────────
// Ficam em meta_sistema, não no código: mudar o combinado não deve exigir deploy.
function ParametrosAcordo({ atuais }: { atuais: Parametros }) {
  const notificar = useToast();
  const qc = useQueryClient();
  const [form, definirForm] = useState<Parametros>(atuais);
  const [erro, definirErro] = useState<string | null>(null);

  const salvar = useMutation({
    mutationFn: (p: Parametros) => api.patch<{ dados: Parametros }>("/relatorios/pro-labore/parametros", p),
    onSuccess: () => {
      definirErro(null);
      qc.invalidateQueries({ queryKey: ["pro-labore"] });
      notificar({ tipo: "ok", titulo: "Acordo atualizado", descricao: "O cálculo já usa os novos valores." });
    },
    onError: (e: Error) => definirErro(e.message),
  });

  const campo = (chave: keyof Parametros, rotulo: string, sufixo: string) => (
    <Campo rotulo={rotulo}>
      <div className="flex items-center gap-2">
        <Entrada
          type="number" min={0} step="0.01" tamanho="sm" className="w-32"
          value={String(form[chave])}
          onChange={(e) => definirForm({ ...form, [chave]: Number(e.target.value) })}
        />
        <span className="text-xs text-mudo">{sufixo}</span>
      </div>
    </Campo>
  );

  const alterado = (Object.keys(atuais) as (keyof Parametros)[]).some((k) => atuais[k] !== form[k]);

  return (
    <Card titulo="Parâmetros do acordo" icone={SlidersHorizontal}>
      <p className="mb-3 text-xs text-mudo">
        O combinado não é dado derivado de nada — é acerto entre pessoas. Mudou o
        acordo, mude aqui: vale para todo cálculo daqui em diante, sem deploy.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        {campo("fixoMensal", "Fixo mensal", "por mês")}
        {campo("pctVenda", "Venda de ativos", "% do lucro")}
        {campo("pctExcedente", "Excedente", "% do que passar do piso")}
        {campo("pisoMensal", "Piso mensal", "guincho + locação")}
        <Botao
          className="mb-0.5" tamanho="sm"
          disabled={!alterado} carregando={salvar.isPending}
          onClick={() => salvar.mutate(form)}
        >
          <Save className="h-3.5 w-3.5" /> Salvar
        </Botao>
      </div>
      {erro && <p className="mt-3 text-xs text-erro">{erro}</p>}
    </Card>
  );
}
