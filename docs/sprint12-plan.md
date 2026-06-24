# Sprint 12 — Interligação e Experiência Visual

> **Proposta, não executado.** Tema central: *"abra qualquer coisa e entenda
> tudo, sem becos sem saída."* Zero tabela nova, zero migração. Tudo é UI e
> consulta sobre o núcleo que já existe.

---

## Por que este sprint

O banco já conecta tudo — `lancamento → operacao → ativo → pessoa → timeline`.
O problema é que essa conexão **não aparece para o usuário**. As telas de
detalhe são gritantemente desiguais:

| Tela | Linhas | O que mostra |
|---|---|---|
| `AtivoDetalhe` | 416 | operações + manutenções + lançamentos + docs + comentários + timeline |
| `OperacaoDetalhe` | 461 | timeline + ativos (texto morto) + lançamentos (sem ação) |
| `ManutencaoDetalhe` | 290 | timeline + lançamentos + ativo (clicável) |
| `PessoaDetalhe` | **157** | **2 contadores + timeline. Beco sem saída.** |

O cliente — centro comercial do negócio — está invisível para si mesmo.

---

## Mapa de interligação — agora vs. depois

Cada célula: estando na ficha da **linha**, consigo navegar para a **coluna**?

```
             Pessoa   Ativo   Operação   Manutenção   Lançamento   Agenda
Pessoa         —        ✗        ✗          —             ✗           ✗
Ativo          ✗        —        ✅         ✅          ⚠ sem ação    ✗
Operação       ✅       ⚠texto   —          —           ⚠ sem ação    ✗
Manutenção     —        ✅       ✗          —           ⚠ sem ação    ✗
Dashboard      ✗        ⚠frota  ✗          ✗             ✗           ✗
Agenda         ✅       ✅       ✅         ✅            ✅           —

✅ navega   ⚠ exibe sem navegar / sem ação   ✗ ausente   — não se aplica
```

**Leitura rápida:**
- A **Agenda** (Sprint 11) já é o melhor hub — é o modelo a seguir.
- A **Pessoa** é uma linha quase toda ✗ — o maior gap.
- **Dashboard** vê o problema mas não leva até ele.

> **Done do Sprint 12:** toda célula acima vira ✅. Este mapa é o checklist
> de aceitação.

---

## As 6 Frentes

```
A — Ficha 360°          B — Navegação         C — Centro do dia
    cada entidade           sem beco               Dashboard+Agenda+Notif

D — Atrito diário       E — Clareza visual    F — Planilhas Financeiras ★
    ações em lote           polimento              pivot detalhada +
    copiloto contextual     transversal            customizável + export
```

---

# 🟦 FRENTE A — Ficha 360° de cada entidade

Padronizar todas as telas de detalhe com a anatomia do `AtivoDetalhe`:

```
┌─────────────────────────────────────────────────────────────────┐
│  Nome                    [Código]  [Selo status]        [Ações] │
├──────────────────┬──────────────────────────────────────────────┤
│  Identidade      │  KPIs (faturado / a receber / vencido)       │
│  Dados principais│  ────────────────────────────────────────    │
│  ─────────────   │  Relacionados  (operações, ativos, manut.)   │
│  Resumo rápido   │  ────────────────────────────────────────    │
│                  │  Financeiro    (lançamentos + ações inline)   │
│                  │  ────────────────────────────────────────    │
│                  │  Documentos · Comentários                    │
│                  │  ────────────────────────────────────────    │
│                  │  Timeline (coluna dominante, append-only)     │
└──────────────────┴──────────────────────────────────────────────┘
```

---

## A1 — `PessoaDetalhe`: histórico unificado ★ MAIOR GANHO

**Antes:** 2 contadores + timeline. **Depois:** ficha completa, ponto de
partida para todo o histórico do cliente.

### Layout alvo

```
┌─────────────────────────────────────────────────────────────────┐
│  João da Silva             [cliente] [motorista]    [Editar]    │
│  CPF 123.456.789-00 · São Paulo/SP · (11) 9 9999-9999           │
├──────────────────┬──────────────────────────────────────────────┤
│  DADOS           │  KPIs (4 boxes, grid 2×2 em mobile)          │
│  ─────────────   │  ┌────────────┬────────────┐                 │
│  CPF/CNPJ        │  │ R$ 48.200  │  R$ 3.600  │                 │
│  Telefone        │  │ Faturado   │  A receber │ text-ok/alerta  │
│  E-mail          │  ├────────────┼────────────┤                 │
│  Cidade/UF       │  │ R$ 1.200   │     7      │                 │
│  CNH nº + val.   │  │ Vencido    │  Operações │ text-erro/ouro  │
│  Observações     │  └────────────┴────────────┘                 │
│                  │                                              │
│  RESUMO RÁPIDO   │  OPERAÇÕES — últimas 5 [Ver todas →]         │
│  7 operações     │  ┌──────────────────────────────────────┐    │
│  2 a vencer      │  │ OP-0042 · Locação · em andamento     │    │
│                  │  │ Corolla Prata · desde 10/06   [→]    │    │
│                  │  │ OP-0039 · Guincho · finalizado       │    │
│                  │  │ R$ 380 · 02/06                [→]    │    │
│                  │  └──────────────────────────────────────┘    │
│                  │                                              │
│                  │  FINANCEIRO — direto desta pessoa            │
│                  │  (lançamentos com pessoa_id = X)             │
│                  │  ┌─────────────────────────────────────┐     │
│                  │  │ +R$ 380 · Locação OP-0039 · pago    │     │
│                  │  │  -R$ 120 · Multa atraso · vencido ⚠ │     │
│                  │  └─────────────────────────────────────┘     │
│                  │                                              │
│                  │  DOCUMENTOS · COMENTÁRIOS                    │
│                  │                                              │
│                  │  TIMELINE                                    │
└──────────────────┴──────────────────────────────────────────────┘
```

### Especificação de componentes

```tsx
// KPI da pessoa — reutiliza o padrão de Kpi do dashboard
<div className="grid grid-cols-2 gap-3">
  <Kpi rotulo="Faturado" valor={dinheiro(resumo.faturado)} icone={TrendingUp} tom="ok" />
  <Kpi rotulo="A receber" valor={dinheiro(resumo.a_receber)} icone={Clock} tom="neutro" />
  <Kpi rotulo="Vencido" valor={dinheiro(resumo.vencido)} icone={AlertCircle} tom="erro" />
  <Kpi rotulo="Operações" valor={resumo.qtd_operacoes} icone={Workflow} tom="ouro" />
</div>

// Linha de operação — usa ListaLinha com chevron
<ListaLinha para={`/operacoes/${op.id}`}>
  <div className="flex items-center gap-2">
    <span className="font-display text-xs font-bold text-ouro">{op.codigo}</span>
    <Selo>{op.tipo}</Selo>
    <Selo tom={statusTom(op.status)}>{op.status}</Selo>
  </div>
  <p className="text-xs text-suave">{op.ativo ?? "—"} · {dataCurta(op.data_inicio)}</p>
</ListaLinha>
```

### Backend — estender `obterPessoa`

```sql
-- Adicionar ao SELECT existente (sem endpoint novo):
(SELECT json_agg(row_to_json(o) ORDER BY o.data_inicio DESC) FROM (
  SELECT id, codigo, tipo, status, valor_total, data_inicio,
         (SELECT a.nome FROM ativos a
          JOIN operacao_ativos oa ON oa.ativo_id = a.id
          WHERE oa.operacao_id = op.id AND oa.papel = 'objeto' LIMIT 1) AS ativo
  FROM operacoes op
  WHERE op.cliente_id = p.id AND op.deleted_at IS NULL
  ORDER BY op.data_inicio DESC LIMIT 20
) o) AS operacoes,

(SELECT json_build_object(
  'faturado',    COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND status='pago'), 0),
  'a_receber',   COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND status='previsto'), 0),
  'vencido',     COALESCE(SUM(valor) FILTER (WHERE tipo='receita' AND status='previsto'
                   AND data_vencimento < current_date), 0),
  'qtd_operacoes', (SELECT count(*) FROM operacoes WHERE cliente_id = p.id AND deleted_at IS NULL)
) FROM lancamentos WHERE pessoa_id = p.id AND deleted_at IS NULL AND status != 'cancelado'
) AS resumo_financeiro
```

**Esforço:** back médio + front médio. **Sem migração.**

---

## A2 — `OperacaoDetalhe`: texto morto → links + ações

**Antes:** ativos como `<span>`, lançamentos sem ação.
**Depois:** cada linha é clicável e acionável.

### Lista de ativos — antes vs. depois

```
ANTES                              DEPOIS
──────────────────────────────     ─────────────────────────────────────────
AT-0017 Corolla Prata              ┌─────────────────────────────────────────┐
(texto simples, não clicável)      │ [CarFront] AT-0017 Corolla Prata  [→]   │
                                   │            disponível                    │
                                   └─────────────────────────────────────────┘
                                   (ListaLinha para="/ativos/:id")
```

### Lista de lançamentos — antes vs. depois

```
ANTES                              DEPOIS
──────────────────────────────     ──────────────────────────────────────────
Locação OP-0042 · R$ 480 ·         Locação OP-0042 · R$ 480
previsto · vence 30/06             vence 30/06  [Selo: Previsto]  [Pagar ▶]
(sem ação)                                                         (modal)
```

### Componente de ação inline

```tsx
// Modal "Pagar" reaproveitado do Financeiro → extrair para ModalPagarLancamento
// reutilizado em AtivoDetalhe, OperacaoDetalhe, ManutencaoDetalhe, PessoaDetalhe
<button
  onClick={() => setLancParaPagar(l)}
  className="rounded p-1.5 text-mudo hover:text-ok hover:bg-ok/10 transition-colors"
  title="Registrar pagamento"
>
  <CheckCircle className="h-3.5 w-3.5" />
</button>
```

**Esforço:** front baixo + extrair `ModalPagarLancamento` como componente compartilhado.

---

## A3 — `ManutencaoDetalhe`: elo de origem bidirecional

**O que falta:** a manutenção foi aberta a partir de uma operação? O usuário
não sabe e não consegue voltar.

### Banner de origem

```
┌────────────────────────────────────────────────────────────────┐
│ [Workflow]  Originada da operação  OP-0039 · Locação           │
│             João da Silva · finalizada em 05/06       [Ver →]  │
└────────────────────────────────────────────────────────────────┘
// border-borda bg-elevado rounded-lg px-4 py-2.5 flex items-center gap-3
// texto-mudo para ícone, text-ouro para o código, hover:text-ouro no link
```

**Backend:** adicionar ao `obterManutencao`:
```sql
(SELECT json_build_object('id', o.id, 'codigo', o.codigo, 'tipo', o.tipo,
  'status', o.status, 'cliente', p.nome)
 FROM operacoes o JOIN pessoas p ON p.id = o.cliente_id
 WHERE o.id = m.operacao_id LIMIT 1) AS operacao_origem
```

**Esforço:** back leve + front muito baixo.

---

## A4 — `AtivoDetalhe`: completar lançamentos de manutenção

**O que falta:** lançamento de origem `manutencao` tem link para a operação
(✅) mas não para a manutenção (✗).

```tsx
// Hoje (linha ~364 de AtivoDetalhe.tsx):
{l.origem === "operacao" && l.operacaoId && (
  <Link to={`/operacoes/${l.operacaoId}`}>OP-0042</Link>
)}

// Adicionar:
{l.origem === "manutencao" && l.manutencaoId && (
  <Link to={`/manutencoes/${l.manutencaoId}`}
    className="text-xs text-suave hover:text-ouro flex items-center gap-1">
    <Wrench className="h-2.5 w-2.5" /> Ver manutenção
  </Link>
)}
```

**Esforço:** front muito baixo. 1 bloco JSX, ~5 linhas.

---

## A5 — "Ver mais" colapsável + skeletons padronizados

**Padrão a replicar do AtivoDetalhe:**

```tsx
const LIMITE = 5;
const [verMais, setVerMais] = useState(false);
const visiveis = verMais ? lista : lista.slice(0, LIMITE);

// Rodapé da lista:
{lista.length > LIMITE && (
  <button onClick={() => setVerMais(v => !v)}
    className="mt-2 flex items-center gap-1 text-xs text-suave hover:text-ouro transition-colors">
    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${verMais ? "rotate-180" : ""}`} />
    {verMais ? "Ver menos" : `Ver mais ${lista.length - LIMITE}`}
  </button>
)}
```

**Onde aplicar:** `PessoaDetalhe` (operações, lançamentos), `OperacaoDetalhe`
(lançamentos), `ManutencaoDetalhe` (lançamentos).

**Esforço:** muito baixo. Copy-paste do padrão existente.

---

# 🟩 FRENTE B — Navegação sem beco

---

## B1 — CTAs cruzados nas fichas de detalhe

Cada ficha vira **ponto de partida** para a próxima ação óbvia, já
pré-preenchida. Respeitando o guard #58 (mão única): só o campo do destino é
pré-preenchido, nunca criação em cadeia automática.

### Barra de ações rápidas (novo padrão visual)

```
┌─────────────────────────────────────────────────────────────────┐
│  AÇÕES RÁPIDAS                                                  │
│  ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐  │
│  │ [+] Nova operação│ │ [Wrench] Manut.  │ │ [$] Lançar custo│  │
│  │   para este      │ │   para este      │ │   direto        │  │
│  │   cliente        │ │   ativo          │ │                 │  │
│  └─────────────────┘ └──────────────────┘ └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
// grid grid-cols-2 sm:grid-cols-3 gap-2
// cada botão: rounded-lg border border-borda hover:border-ouro/40
//   bg-painel hover:bg-elevado p-3 text-left transition-all
//   ícone text-ouro h-4 w-4 + título text-sm font-medium + subtítulo text-xs text-suave
```

### Mapa de CTAs por tela

| Tela | CTAs | Destino |
|---|---|---|
| `PessoaDetalhe` | "Nova operação" | `/operacoes/nova?cliente_id=X` |
| `AtivoDetalhe` | "Agendar manutenção" | modal `NovaManutencao` pré-preenchida |
| `AtivoDetalhe` | "Lançar custo direto" | modal `NovoLancamento` com `ativo_id` |
| `AtivoDetalhe` | "Ver na agenda" | `/agenda?entidade_id=X` |
| `ManutencaoDetalhe` | "Lançar custo desta manutenção" | modal com `manutencao_id` |
| `OperacaoDetalhe` | "Anexar contrato" | sobe direto para documentos |

---

## B2 — Formulários aceitam pré-preenchimento por URL

`OperacaoNova` hoje ignora a query string. Adicionar `useSearchParams` para
pré-selecionar cliente e/ou ativo:

```tsx
// apps/web/src/paginas/OperacaoNova.tsx — acrescentar no useEffect inicial:
const [params] = useSearchParams();
useEffect(() => {
  const clienteId = params.get("cliente_id");
  const ativoId   = params.get("ativo_id");
  if (clienteId) setForm(f => ({ ...f, cliente_id: clienteId }));
  if (ativoId)   setAtivosForm(f => [...f, ativoId]);
}, []);
```

Mesma lógica para `NovaManutencao` (`ativo_id`) e `NovoLancamento`
(`ativo_id`, `conta_id`, `operacao_id`).

**Esforço:** muito baixo. 5 linhas por formulário.

---

## B3 — `EstadoVazio` com CTA nativo

**Hoje:** estado vazio = mensagem morta. **Depois:** aponta para a saída.

```tsx
// Extensão mínima no componente existente (Estados.tsx):
// prop `acao` já existe! Basta usá-la de forma consistente:

<EstadoVazio
  icone={Workflow}
  titulo="Nenhuma operação ainda"
  descricao="Este cliente ainda não tem operações registradas."
  acao={
    pode("operacoes", "criar") && (
      <Botao variante="secundario" tamanho="sm"
        onClick={() => navegar(`/operacoes/nova?cliente_id=${pessoa.id}`)}>
        <Plus className="h-3.5 w-3.5" /> Nova operação
      </Botao>
    )
  }
/>
```

**Visual padrão do EstadoVazio com CTA:**

```
          [ícone bg-elevado rounded-full]
          Nenhuma operação ainda
          Este cliente ainda não tem operações.
          ┌──────────────────────────┐
          │  + Nova operação         │  ← Botao variante="secundario"
          └──────────────────────────┘
```

**Esforço:** muito baixo. O componente já suporta — só precisa ser usado.

---

## B4 — Busca global ⌘K: resultados agrupados

**Antes:** lista plana mistura clientes com ativos com lançamentos.
**Depois:** grupos com cabeçalho e contagem.

```
┌──────────────────────────────────────────────────────────┐
│  🔍  corolla                                        [⌘K] │
├──────────────────────────────────────────────────────────┤
│  ATIVOS  · 2 resultados                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ [CarFront]  Corolla Prata  ·  AT-0017              │  │
│  │             disponível · 45.230 km                 │  │
│  │ [CarFront]  Corolla Preto  ·  AT-0031              │  │
│  │             em manutenção                          │  │
│  └────────────────────────────────────────────────────┘  │
│  CLIENTES  · 1 resultado                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │ [User]  Maria Corolla  ·  cliente                  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
// cabeçalho de grupo: text-[10px] uppercase tracking-wider text-mudo px-3 pt-3 pb-1
// linha de resultado: hover:bg-elevado rounded-md px-3 py-2 cursor-pointer
```

**Frontend only.** O back já devolve `entidade_tipo` — basta agrupar com
`Map` antes de renderizar.

**Esforço:** muito baixo.

---

# 🟨 FRENTE C — Centro de controle do dia

---

## C1 — Dashboard "Atenção agora": alertas acionáveis

**Antes:** lista de texto morto. **Depois:** cada alerta tem destino e ação
inline que resolve sem sair da tela.

### Visual do card "Atenção agora" refeito

```
┌────────────────────────────────────────────────────────────────┐
│ ⚠  ATENÇÃO AGORA                                    [3 itens] │
├────────────────────────────────────────────────────────────────┤
│ [Clock  erro]  Locação atrasada 3 dias                         │
│                Corolla Prata — João da Silva        [Ver →]    │
│                                                [Registrar dev.]│
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│ [DollarSign alerta]  Lançamento vencido há 5 dias              │
│                      Mensalidade Jun · R$ 1.200    [Ver →]    │
│                                                    [Pagar]    │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│ [IdCard alerta]  CNH vencendo em 8 dias                        │
│                  Pedro Motorista               [Ver cadastro →]│
└────────────────────────────────────────────────────────────────┘
```

### Componente `AlertaAcionavel`

```tsx
function AlertaAcionavel({ tipo, texto, entidadeId, entidadeTipo }: Alerta) {
  const navegar = useNavigate();
  const DESTINO: Record<string, string> = {
    operacao: `/operacoes/${entidadeId}`,
    lancamento: `/financeiro`,
    pessoa: `/clientes/${entidadeId}`,
    manutencao: `/manutencoes/${entidadeId}`,
  };
  const ICONE = { locacao_atrasada: Clock, lancamento_vencido: DollarSign,
                  cnh_vencendo: IdCard, manutencao_agendada: Wrench };
  const COR   = { locacao_atrasada: "text-erro", lancamento_vencido: "text-alerta",
                  cnh_vencendo: "text-alerta", manutencao_agendada: "text-info" };
  return (
    <li className="flex items-start justify-between gap-3 py-2 first:pt-0">
      <div className="flex items-start gap-2">
        <Icone className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${COR[tipo]}`} />
        <div>
          <p className="text-sm">{texto}</p>
          {/* ação inline por tipo: botão pequeno ou direto navega */}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {entidadeId && (
          <button onClick={() => navegar(DESTINO[entidadeTipo])}
            className="text-xs text-suave hover:text-ouro transition-colors">
            Ver →
          </button>
        )}
        {tipo === "lancamento_vencido" && (
          <Botao tamanho="sm" variante="secundario" onClick={...}>Pagar</Botao>
        )}
        {tipo === "locacao_atrasada" && (
          <Botao tamanho="sm" variante="secundario" onClick={...}>Devolver</Botao>
        )}
      </div>
    </li>
  );
}
```

**Backend:** adicionar `entidade_id` e `entidade_tipo` ao JSON de cada alerta
no `montarDashboard`. O dado já está nas tabelas — só faltava ser devolvido.

**Esforço:** back leve (acrescentar campos ao JSON) + front médio.

---

## C2 — Agenda: filtro "Só os meus" + ações inline

### Chip novo no seletor de tipo

```
[Semana] [Mês] [Trimestre] [Semestre]   |   [Só os meus 👤]
[operações] [manutenções] [vencimentos] [CNH] [documentos] [compromissos]
```

O chip "Só os meus" passa `responsavel_id=me` → back resolve para o `id` do
usuário autenticado nas branches de operações e manutenções da UNION ALL.

### Ações inline nos itens da agenda

```
┌──────────────────────────────────────────────────────┐
│ [DollarSign alerta]  Mensalidade Jun vence hoje       │
│                      R$ 1.200 · Conta Principal       │
│                                          [Pagar ✓]   │
├──────────────────────────────────────────────────────┤
│ [CheckCircle]  Compromisso: Reunião com fornecedor    │
│                09h00 · criado por Você                │
│                                     [✓ Concluído]    │
└──────────────────────────────────────────────────────┘
// botão: rounded px-2 py-1 text-xs hover:bg-ok/10 hover:text-ok
```

**Esforço:** back leve (filtro responsavel) + front baixo.

---

## C3 — Central de notificações: agrupada + marcar todas

**Antes:** lista plana de N itens. **Depois:** agrupada e acionável.

```
┌────────────────────────────────────────────┐
│ 🔔  Notificações  (4 não lidas)            │
│                         [Marcar todas ✓]  │
├────────────────────────────────────────────┤
│  DEVOLUÇÕES ATRASADAS  ·  2               │
│  ● Corolla Prata · 3 dias · há 1h  [→]   │
│  ● Civic Preto · 1 dia · há 3h     [→]   │
├────────────────────────────────────────────┤
│  LANÇAMENTOS VENCIDOS  ·  2               │
│  ● Mensalidade Jun · há 2h         [→]   │
│  ● IPVA Corolla · há 1 dia         [→]   │
└────────────────────────────────────────────┘
// cabeçalho de grupo: text-[10px] uppercase tracking-wider text-mudo py-1.5 px-2
// bolinha não lida: w-1.5 h-1.5 rounded-full bg-ouro shrink-0
// já lida: sem bolinha, text-suave
```

**Backend:** `PATCH /notificacoes/ler-todas` (query `UPDATE notificacoes SET
lida_em = now() WHERE usuario_id = $1 AND lida_em IS NULL`) — trivial.

**Esforço:** front baixo + 1 endpoint trivial no back.

---

# 🟧 FRENTE D — Atrito diário

---

## D1 — Copiloto contextual nas fichas

O copiloto já existe (`POST /copiloto/perguntar`). Hoje exige digitação
manual. Adicionar um botão que entra com contexto pronto.

### Botão nas fichas de detalhe

```
┌─────────────────────────────────────────────────────────────────┐
│  João da Silva  [cliente] [motorista]       [✦ Perguntar] [⋯] │
└─────────────────────────────────────────────────────────────────┘
// ✦ Perguntar: text-xs text-suave hover:text-ouro gap-1
// ícone Sparkles h-3.5 w-3.5
```

Ao clicar, abre o painel do copiloto com prompt pré-carregado:

```
"Resuma a situação atual do cliente João da Silva:
 operações em andamento, saldo financeiro e pendências."
```

```tsx
// BotaoCopiloto já existe — estender com prop `promptInicial`:
<BotaoCopiloto promptInicial={`Resuma a situação atual do ${tipo} ${nome} (id: ${id}).`} />
```

**Esforço:** muito baixo. 1 prop adicional no `BotaoCopiloto` existente.

---

## D2 — Pagamento em lote no Financeiro

**Antes:** pagar um lançamento por vez. **Depois:** selecionar N e pagar todos.

### UI de seleção + barra flutuante

```
┌──────────────────────────────────────────────────────────────────┐
│ ☐ │ Mensalidade Mai · R$ 1.200 · vence 05/06 · [Previsto] [Pagar]│
│ ☑ │ Mensalidade Jun · R$ 1.200 · vence 05/07 · [Previsto] [Pagar]│
│ ☑ │ Taxa limpeza    · R$   80  · vence 05/07 · [Previsto] [Pagar]│
└──────────────────────────────────────────────────────────────────┘

          ┌────────────────────────────────────────────┐
          │  2 selecionados · R$ 1.280          [Pagar]│  ← barra flutuante
          └────────────────────────────────────────────┘
          // fixed bottom-4 left-1/2 -translate-x-1/2
          // rounded-full border border-ouro/30 bg-painel px-5 py-3
          // shadow-flutuante flex items-center gap-4
          // animar-surgir
```

### Backend

```ts
// POST /lancamentos/pagar-lote
// { ids: string[], forma_pagamento?: string, data_pagamento?: string }
await db.transaction(async (tx) => {
  for (const id of ids) {
    await pagarLancamento(id, { forma_pagamento, data_pagamento }, usuario, tx);
  }
});
```

**Esforço:** back médio (endpoint + transação) + front médio (checkboxes +
barra flutuante).

---

# ⬜ FRENTE E — Clareza visual (transversal)

Polimento contínuo que atravessa todas as telas.

---

## E1 — Selos de origem em lançamentos

Em toda lista de lançamentos, mostrar de onde veio o valor:

```
+R$ 480  Locação OP-0042  [Previsto]  [locação]    vence 30/06
-R$ 120  Multa atraso     [Previsto]  [avulso]     vence 15/06
+R$ 380  Guincho OP-0039  [Pago]      [guincho]    pago 02/06
```

```tsx
// Componente SeloCrOrigin (reutilizável):
const ORIGEM_COR: Record<string, string> = {
  guincho: "text-info border-info/30",
  locacao: "text-ok border-ok/30",
  manutencao: "text-alerta border-alerta/30",
  avulso: "text-mudo border-borda",
  compra: "text-erro border-erro/30",
  venda: "text-ouro border-ouro/30",
};
<span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${ORIGEM_COR[origem]}`}>
  {origem}
</span>
```

**Esforço:** muito baixo. Componente + usar nas 4 telas que listam lançamentos.

---

## E2 — Menu: esconder sem permissão (não desabilitar)

**Antes:** itens sem permissão ficam invisíveis graças ao `pode()` —
mas nem sempre. Verificar consistência.

**Regra:** se `!pode(recurso, "ler")` → item não aparece. Nunca
`disabled` + tooltip de "sem permissão" — isso revela a existência de algo
que o usuário não devia saber que existe.

**Esforço:** revisão rápida de `Layout.tsx` (já usa `pode()`) + auditoria
das sub-páginas.

---

## E3 — Microcopy: "Retroativo" consistente

Todo campo `type="date"` que aceita data no passado deve ter `dica="Retroativo"`:

```tsx
<Campo rotulo="Data do evento" dica="Opcional — retroativo (padrão: agora)">
  <Entrada type="date" ... />
</Campo>
// O componente Campo já renderiza a dica em text-xs text-mudo
// Padronizar em: OperacaoNova, ManutencaoDetalhe (edição), NovoLancamento
```

**Esforço:** muito baixo. Busca textual por `type="date"` + adicionar `dica`.

---

# 🟪 FRENTE F — Planilhas Financeiras detalhadas e customizáveis

> O coração do pedido: dar ao usuário **planilhas vivas** sobre o financeiro —
> tão detalhadas quanto um extrato linha-a-linha, e tão flexíveis quanto uma
> tabela dinâmica do Excel. **Zero dado novo:** todas as dimensões já existem
> no núcleo (categoria, conta, pessoa, ativo, origem, tipo, status, mês).

## O que existe hoje (e por que não basta)

| Tela | O que faz | Limite |
|---|---|---|
| `Financeiro` | Lista de lançamentos com filtros simples (status/tipo) | Linha a linha, sem totais nem agrupamento |
| `Relatorios` | DRE por mês, por categoria, ROI por ativo | `Tabela` **estática**, eixos fixos, sem export, sem drill |
| `DashboardFinanceiro` | Caixas por conta e por origem | Cartões-resumo, não planilha |

Falta o que o usuário pediu: uma **planilha pivotável** onde ele escolhe o que
vai nas linhas, o que vai nas colunas, qual medida exibir, filtra, vê totais e
exporta — sem nunca sair de um número que bate com o resto do sistema.

---

## F1 — Planilha Dinâmica (pivot) ★ NÚCLEO DA FRENTE

Uma nova aba em Relatórios: **"Planilha"**. O usuário monta a visão.

### Anatomia da tela

```
┌──────────────────────────────────────────────────────────────────────┐
│  Planilha Financeira                          [Salvar visão] [Exportar ▾]│
├──────────────────────────────────────────────────────────────────────┤
│  CONFIGURAR                                                            │
│  Linhas:  [Categoria ▾]    Colunas: [Mês ▾]    Medida: [Líquido ▾]    │
│  Período: [2026 ▾]  Filtros: [+ Conta] [+ Origem] [+ Status] [+ Tipo] │
├──────────────────────────────────────────────────────────────────────┤
│                    │  Jan    │  Fev    │  Mar    │  …  │  TOTAL  │     │
│  ──────────────────┼─────────┼─────────┼─────────┼─────┼─────────┤     │
│  Locação           │  4.800  │  5.200  │  5.000  │     │ 15.000  │ ok  │
│  Guincho           │  1.200  │    980  │  1.450  │     │  3.630  │ ok  │
│  Manutenção        │ (1.300) │  (450)  │  (820)  │     │ (2.570) │ erro│
│  Avulso            │    300  │      0  │   −120  │     │    180  │     │
│  ──────────────────┼─────────┼─────────┼─────────┼─────┼─────────┤     │
│  TOTAL             │  5.000  │  5.730  │  5.510  │     │ 16.240  │ ouro│
└──────────────────────────────────────────────────────────────────────┘
                                                  ↑ clicar numa célula →
                                                    drill-down dos lançamentos
```

### Dimensões disponíveis (todas já no núcleo)

| Eixo | Opções |
|---|---|
| **Linhas** | Categoria · Conta · Origem · Ativo · Cliente · Tipo · Status |
| **Colunas** | Mês · Trimestre · Tipo (receita/despesa) · Status · Origem · (nenhuma) |
| **Medida** | Receita paga · Despesa paga · Líquido · A receber · A pagar · Vencido · Qtd lançamentos |
| **Período** | Ano · intervalo de/até · trimestre · "tudo" |
| **Filtros** | Conta, origem, categoria, cliente, tipo, status (multi-seleção) |

### Backend — um endpoint genérico, sem tabela nova

```ts
// GET /relatorios/planilha
//   ?linha=categoria&coluna=mes&medida=liquido&ano=2026
//   &conta_id=...&origem=locacao&status=pago  (filtros opcionais)
//
// Monta SQL dinâmico SEGURO: linha/coluna/medida vêm de um allowlist
// (enums), nunca interpolados crus. Filtros viram WHERE parametrizado.
//
// Retorna formato tabular pronto pro front:
{
  linhas: ["Locação", "Guincho", "Manutenção", "Avulso"],
  colunas: ["2026-01", "2026-02", "2026-03"],
  celulas: [[4800, 5200, 5000], [1200, 980, 1450], ...],  // linha × coluna
  totais_linha: [15000, 3630, ...],
  totais_coluna: [5000, 5730, 5510],
  total_geral: 16240,
  // cada célula carrega os filtros que a geraram, p/ o drill-down
}
```

O SQL base é um `GROUP BY <linha>, <coluna>` com `SUM(valor) FILTER (...)`
conforme a medida — exatamente a mesma lógica de `montarFinanceiroPorOrigem`
(Sprint 11), generalizada. **Allowlist de colunas** evita SQL injection: cada
dimensão mapeia para uma expressão SQL fixa no servidor.

### Customização persistida (decisão de arquitetura)

- **Sem backend para preferências**: a "visão" (linha/coluna/medida/filtros)
  é serializada na **URL** (`?linha=...&coluna=...`) e em **localStorage**
  (`hallax_planilhas_salvas`) — mesmo padrão do `DashboardFinanceiro`
  (decisão #65). Compartilhar uma visão = compartilhar a URL.
- "Salvar visão" guarda um preset nomeado no localStorage; um seletor
  recarrega presets salvos.

**Esforço:** back médio (endpoint genérico com allowlist) + front alto (a
grade pivot é o componente mais rico do sprint).

---

## F2 — Componente visual `PlanilhaGrade`

A grade precisa parecer planilha de verdade, dentro do design system.

```tsx
// Cabeçalho fixo (sticky) + primeira coluna fixa para rolagem horizontal
<div className="overflow-auto rounded-lg border border-borda">
  <table className="w-full border-collapse text-sm tabular-nums">
    <thead className="sticky top-0 bg-elevado">
      <tr>
        <th className="sticky left-0 bg-elevado px-3 py-2 text-left text-xs
                       font-semibold uppercase tracking-wider text-suave">
          {rotuloLinha}
        </th>
        {colunas.map(c => (
          <th className="px-3 py-2 text-right text-xs font-medium text-mudo">{c}</th>
        ))}
        <th className="px-3 py-2 text-right text-xs font-bold text-ouro">TOTAL</th>
      </tr>
    </thead>
    <tbody>
      {linhas.map((linha, i) => (
        <tr className="border-t border-borda hover:bg-elevado/40 transition-colors">
          <td className="sticky left-0 bg-painel px-3 py-2 font-medium">{linha}</td>
          {celulas[i].map((v, j) => (
            <td onClick={() => abrirDrill(i, j)}
                className={`cursor-pointer px-3 py-2 text-right
                  ${v < 0 ? "text-erro" : v > 0 ? "text-ok" : "text-mudo"}
                  hover:bg-ouro/10`}>
              {v === 0 ? "—" : dinheiro(v)}
            </td>
          ))}
          <td className="px-3 py-2 text-right font-bold">{dinheiro(totaisLinha[i])}</td>
        </tr>
      ))}
    </tbody>
    <tfoot className="border-t-2 border-borda-forte bg-elevado">
      <tr>
        <td className="sticky left-0 bg-elevado px-3 py-2 font-bold text-ouro">TOTAL</td>
        {totaisColuna.map(t => (
          <td className="px-3 py-2 text-right font-bold">{dinheiro(t)}</td>
        ))}
        <td className="px-3 py-2 text-right font-bold text-ouro">{dinheiro(totalGeral)}</td>
      </tr>
    </tfoot>
  </table>
</div>
```

**Detalhes visuais:**
- Números **tabulares** (`tabular-nums`) — colunas alinham perfeitamente.
- Negativos em `text-erro`, positivos em `text-ok`, zero vira `—` em `text-mudo`.
- Linha/coluna de total com peso e dourado discreto.
- Cabeçalho e primeira coluna **fixos** (sticky) — rola sem perder referência.
- Mobile: scroll horizontal suave; em telas estreitas, oferecer "modo lista"
  alternativo (cada linha vira um cartão expansível).

**Esforço:** front médio-alto. Componente reutilizável também pela DRE (F4).

---

## F3 — Drill-down em qualquer célula

Clicar numa célula abre os lançamentos **exatos** que somam aquele número —
reusando o `ListaDrillDown` que já existe no `DashboardFinanceiro`.

```
Clique em [Locação × Fev × Líquido = 5.200]
   → Drawer lateral abre:
      "Locação · Fevereiro/2026 · 8 lançamentos · líquido R$ 5.200"
      +R$ 800  Locação OP-0051 · pago 03/02   [Ver operação →]
      +R$ 800  Locação OP-0051 · pago 03/03   [Ver operação →]
      ...
```

A célula carrega os filtros que a geraram (`origem=locacao`, `mes=2026-02`),
que viram query para `GET /lancamentos`. **Rastreabilidade ponta a ponta**: do
número agregado ao lançamento individual à operação de origem.

**Esforço:** front baixo (reusa `ListaDrillDown` + `Drawer` existentes).

---

## F4 — Exportação (CSV / impressão)

```
[Exportar ▾]
  ├── Copiar para área de transferência (TSV — cola direto no Excel)
  ├── Baixar CSV
  └── Imprimir / PDF (window.print com folha de estilo de impressão)
```

- **CSV/TSV gerado no cliente** a partir da matriz já carregada — sem endpoint
  novo, sem segredo no servidor.
- Folha de impressão (`@media print`): fundo branco, texto escuro, oculta
  navegação — a planilha vira relatório entregável.

**Esforço:** baixo. Geração de CSV no cliente + CSS de impressão.

---

## F5 — DRE e Relatórios atuais migram para a grade nova

O `Relatorios.tsx` atual (DRE por mês, por categoria, ROI) passa a usar o
`PlanilhaGrade` — ganhando export, drill-down e totais consistentes de graça.
A DRE vira simplesmente um **preset** da planilha dinâmica:
`linha=categoria, coluna=mes, medida=liquido`.

**Esforço:** baixo (refatorar o que existe para o componente novo).

---

## Resumo da Frente F

| # | Ticket | Camada | Esforço |
|---|--------|--------|---------|
| F1 | Endpoint `GET /relatorios/planilha` (pivot genérico, allowlist) | back médio | Médio |
| F2 | Componente `PlanilhaGrade` (sticky, tabular, totais) | front | Médio-alto |
| F3 | Drill-down por célula (reusa `ListaDrillDown` + `Drawer`) | front | Baixo |
| F4 | Exportação CSV/TSV/impressão (cliente) | front | Baixo |
| F5 | Migrar DRE/ROI atuais para a grade nova (DRE = preset) | front | Baixo |

> **Regra máxima preservada:** a planilha é 100% **consulta** sobre o núcleo.
> Nenhum total é armazenado; todo número é recalculado e, por construção, bate
> com o financeiro, o dashboard e os lançamentos individuais (drill-down prova).

---

# Sequência recomendada

```
         Semana 1               Semana 2              Quick wins (paralelo)
         ──────────────         ──────────────         ─────────────────────
Sprint   A1 PessoaDetalhe       B1 CTAs cruzados       A4 link manut→lanc
12       A2 Operacao links      B2 query string forms   A5 "ver mais"
         B3 EstadoVazio CTA     C1 alertas acionáveis   B4 busca agrupada
                                                         E1 selos origem
                                                         E2 menu auditoria
                                                         E3 microcopy datas

Sprint   C2 agenda filtro       D1 copiloto contextual  A3 manut→operacao
13       C3 notif agrupadas     D2 pagamento em lote

Sprint   F1 endpoint pivot      F3 drill por célula     F4 exportação CSV
14 (★)   F2 PlanilhaGrade       F5 migrar DRE→grade
         "Planilhas              (a Frente F é grande e visual — merece um
          Financeiras"            sprint próprio, o pedido recente do dono)
```

A **Frente F (Planilhas)** pode ser antecipada para o Sprint 12 se for a
prioridade do dono — F1+F2 entregam a planilha pivotável; F3/F4/F5 enriquecem.

---

# Dependências e riscos

| Dep. | Descrição |
|---|---|
| B1 → B2 | CTA "Nova operação" só funciona se o form aceitar a query string |
| A2/A4/D2 → modal compartilhado | Extrair `ModalPagarLancamento` antes de replicar em 4 telas |
| C1 → back shape | `alertas` do dashboard ganha campos — retro-compatível (adiciona, não remove) |
| D2 | Transação em lote: verificar permissão por ID antes de processar |
| F1 segurança | linha/coluna/medida vêm de **allowlist** (enum→expressão SQL fixa), nunca interpolados — sem SQL injection |
| F3/F5 reuso | drill-down reusa `ListaDrillDown`; grade reusa em DRE/ROI — extrair `PlanilhaGrade` antes de F5 |
| F gating | tudo sob `relatorios_financeiros:ler` — quem não vê financeiro não monta planilha |

**Regra de segurança:** se qualquer ticket levar a uma migração → **parar e
reavaliar**. Este sprint é interligação e UI sobre o núcleo existente.

---

# Critério de done

> O Sprint 12 está pronto quando o mapa de interligação abaixo estiver
> todo ✅ — e nenhuma célula exigir sair da tela para executar a ação óbvia.

```
             Pessoa   Ativo   Operação   Manutenção   Lançamento   Agenda
Pessoa         —        ✅       ✅          —             ✅          ✅
Ativo          ✅        —       ✅          ✅             ✅          ✅
Operação       ✅        ✅       —           —             ✅          ✅
Manutenção     —         ✅      ✅           —             ✅          ✅
Dashboard      ✅        ✅      ✅           ✅             ✅          ✅
Agenda         ✅        ✅      ✅           ✅             ✅          —
```
