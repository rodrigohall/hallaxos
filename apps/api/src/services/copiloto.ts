// Copiloto de IA (Sprint 9) — Fase 1: leitura.
//
// Reusa o núcleo compartilhado (regra máxima: a informação existe uma vez só):
// o copiloto não tem dados próprios. Ele consulta os MESMOS serviços que as
// telas já usam, via tool calling, sempre escopado ao papel do usuário logado
// (doc 05). O modelo Claude apenas orquestra perguntas em linguagem natural
// sobre esses dados — nunca inventa número e cita as entidades de origem.
//
// Fase 1 é SÓ LEITURA: todas as ferramentas abaixo consultam dados; nenhuma
// muta estado. Escrita fica para a Fase 2 e, quando vier, passa pelos endpoints
// existentes + confirmação humana (decisão #43) — a IA nunca escreve direto.
//
// Desligado por padrão: sem config.iaApiKey, perguntar() lança 503 e nenhuma
// chamada paga é feita. Para ligar, defina IA_API_KEY (secret no servidor,
// NUNCA no repositório) — o resto já está pronto.
import type Anthropic from "@anthropic-ai/sdk";
import { pode, type PapelUsuario, type TipoOperacao } from "@hallaxos/shared";
import { db } from "../db/client";
import { buscar } from "./busca";
import { listarOperacoes } from "./operacoes";
import { dre, resultadoPorAtivo } from "./relatorios";
import { montarDashboard } from "./dashboard";
import { AppError } from "../lib/erros";
import { config } from "../config";

export interface FonteCopiloto {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
}

export interface RespostaCopiloto {
  resposta: string;
  fontes: FonteCopiloto[];
}

const SISTEMA = [
  "Você é o copiloto do HallaxOS, o sistema operacional da Hallax (guincho,",
  "locação, compra e venda de veículos, financeiro e manutenções).",
  "Responda em português do Brasil, de forma direta e objetiva.",
  "Você NÃO tem dados próprios e NÃO executa ações que alterem dados — apenas",
  "consulta e responde. Para qualquer pergunta sobre clientes, ativos, operações,",
  "lançamentos, indicadores ou manutenções, use as ferramentas antes de responder",
  "— nunca invente números ou nomes. Use busca_global para encontrar registros;",
  "dashboard_resumo para a fotografia do dia (ativos, guinchos abertos, caixa);",
  "operacoes_abertas para operações em andamento ou atrasadas; e",
  "relatorio_financeiro para faturamento, DRE e resultado/ROI por ativo.",
  "Se uma ferramenta responder que o papel do usuário não tem acesso, diga isso",
  "sem expor o dado. Se a consulta não trouxer o que é preciso, diga que não",
  "encontrou. Cite as entidades que embasaram a resposta.",
].join(" ");

// As ferramentas expostas ao modelo — TODAS de leitura (Fase 1). A lista é a
// garantia, em código, de que o copiloto não tem como escrever: não existe
// nenhuma ferramenta de mutação para o modelo escolher.
export const FERRAMENTAS_LEITURA: Anthropic.Tool[] = [
  {
    name: "busca_global",
    description:
      "Busca pessoas, ativos, operações, lançamentos e manutenções no HallaxOS " +
      "por texto, código ou placa. Use para fundamentar qualquer resposta sobre dados do sistema.",
    input_schema: {
      type: "object" as const,
      properties: {
        consulta: { type: "string", description: "Termo, código ou placa a buscar." },
      },
      required: ["consulta"],
    },
  },
  {
    name: "dashboard_resumo",
    description:
      "Fotografia operacional do dia: ativos por status, patrimônio, guinchos em " +
      "andamento, agenda do dia, próximas manutenções e — para quem tem acesso ao " +
      "financeiro — receitas/despesas do dia, fluxo de caixa e contas vencidas.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "operacoes_abertas",
    description:
      "Lista operações em andamento (não terminais) ou atrasadas. Use para " +
      "'quais guinchos estão abertos?', 'quantas locações ativas?', 'operações atrasadas'.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: {
          type: "string",
          enum: ["guincho", "locacao", "venda", "compra"],
          description: "Opcional. Filtra por tipo de operação.",
        },
        atrasadas: {
          type: "boolean",
          description: "Se true, retorna apenas as locações com devolução vencida.",
        },
      },
    },
  },
  {
    name: "relatorio_financeiro",
    description:
      "Indicadores financeiros: faturamento e despesas por mês (DRE) de um ano e " +
      "resultado/ROI por ativo. Use para 'quanto faturei em maio?', 'qual ativo mais " +
      "lucrou?', 'qual o pior ROI?'. Só acessível a quem tem o papel financeiro/gestor.",
    input_schema: {
      type: "object" as const,
      properties: {
        ano: { type: "integer", description: "Ano da DRE. Padrão: ano corrente." },
      },
    },
  },
];

const TIPOS_OPERACAO = new Set<TipoOperacao>(["guincho", "locacao", "venda", "compra"]);

interface ResultadoFerramenta {
  conteudo: string;
  fontes: FonteCopiloto[];
}

function semPermissao(recurso: string): ResultadoFerramenta {
  return {
    conteudo: JSON.stringify({
      sem_permissao: true,
      mensagem: `O papel deste usuário não tem acesso a ${recurso}.`,
    }),
    fontes: [],
  };
}

// Executa uma ferramenta de leitura contra o núcleo, revalidando o papel.
// É a fronteira de segurança do copiloto: a busca já filtra por papel, mas as
// demais ferramentas precisam checar a matriz (doc 05) — senão um operador
// extrairia o financeiro pelo copiloto. Exportada para teste direto, sem IA.
export async function executarFerramenta(
  nome: string,
  input: Record<string, unknown>,
  papel: PapelUsuario
): Promise<ResultadoFerramenta> {
  switch (nome) {
    case "busca_global": {
      const consulta = String(input.consulta ?? "");
      const achados = await buscar(db, consulta, papel);
      return {
        conteudo: JSON.stringify(achados),
        fontes: achados.map((a) => ({
          entidade_tipo: a.entidade_tipo,
          entidade_id: a.entidade_id,
          titulo: a.titulo,
        })),
      };
    }

    case "dashboard_resumo": {
      // montarDashboard já omite o bloco financeiro para quem não tem o papel.
      const d = await montarDashboard(papel);
      return { conteudo: JSON.stringify(d), fontes: [] };
    }

    case "operacoes_abertas": {
      if (!pode(papel, "operacoes", "ler")) return semPermissao("operações");
      const tipo =
        typeof input.tipo === "string" && TIPOS_OPERACAO.has(input.tipo as TipoOperacao)
          ? (input.tipo as TipoOperacao)
          : undefined;
      const situacao = input.atrasadas === true ? "atrasadas" : "abertas";
      const { dados, total } = await listarOperacoes({
        tipo,
        situacao,
        pagina: 1,
        porPagina: 25,
      });
      const enxuto = dados.map((o) => ({
        codigo: o.codigo,
        tipo: o.tipo,
        cliente: o.cliente,
        status: o.status,
        atrasada: o.atrasada,
      }));
      return {
        conteudo: JSON.stringify({ total, operacoes: enxuto }),
        fontes: dados.map((o) => ({
          entidade_tipo: "operacao",
          entidade_id: o.id,
          titulo: `${o.codigo} · ${o.cliente}`,
        })),
      };
    }

    case "relatorio_financeiro": {
      // Indicadores financeiros seguem a matriz de relatórios financeiros (doc 05).
      if (!pode(papel, "relatorios_financeiros", "ler")) return semPermissao("relatórios financeiros");
      const ano =
        typeof input.ano === "number" && Number.isInteger(input.ano)
          ? input.ano
          : new Date().getFullYear();
      const [demonstrativo, porAtivo] = await Promise.all([dre(ano), resultadoPorAtivo()]);
      // resultadoPorAtivo devolve linhas com chaves dinâmicas (índice) — lemos
      // pelos campos via Record para o typecheck, mantendo só o essencial.
      const ativos = (porAtivo as ReadonlyArray<Record<string, unknown>>).map((a) => ({
        codigo: a.codigo,
        nome: a.nome,
        status: a.status,
        receita: a.receita,
        despesa: a.despesa,
        resultado: a.resultado,
        roi: a.roi,
      }));
      return { conteudo: JSON.stringify({ ano, dre: demonstrativo, resultado_por_ativo: ativos }), fontes: [] };
    }

    default:
      return { conteudo: JSON.stringify({ erro: "ferramenta desconhecida" }), fontes: [] };
  }
}

// Mapeia falhas do SDK da Anthropic para erros tratados (envelope pt-BR), para o
// copiloto degradar com elegância sem derrubar o resto do sistema (que vive em
// endpoints separados). O SDK já tenta novamente 429/5xx automaticamente.
function traduzirErroIa(err: unknown, AnthropicClient: typeof Anthropic): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof AnthropicClient.AuthenticationError) {
    return new AppError(503, "IA_INDISPONIVEL", "O copiloto está com a chave de acesso inválida. Verifique a configuração.");
  }
  if (err instanceof AnthropicClient.RateLimitError) {
    return new AppError(429, "IA_LIMITE", "O copiloto recebeu muitas perguntas agora. Tente novamente em instantes.");
  }
  if (err instanceof AnthropicClient.APIError) {
    return new AppError(503, "IA_INDISPONIVEL", "O copiloto está indisponível no momento. Tente novamente em instantes.");
  }
  return new AppError(503, "IA_INDISPONIVEL", "O copiloto não conseguiu responder agora. Tente novamente.");
}

export async function perguntar(
  pergunta: string,
  papel: PapelUsuario
): Promise<RespostaCopiloto> {
  if (!config.iaApiKey) {
    throw new AppError(
      503,
      "IA_NAO_CONFIGURADA",
      "O copiloto de IA ainda não está ativado. Configure a chave de acesso (IA_API_KEY) no servidor."
    );
  }

  // Import dinâmico: o SDK só carrega quando a IA está ligada, mantendo o
  // arranque leve e o scaffold sem efeito enquanto não há chave.
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
  const client = new AnthropicClient({ apiKey: config.iaApiKey });

  const fontes: FonteCopiloto[] = [];
  const vistas = new Set<string>(); // dedup de fontes por tipo:id
  const mensagens: Anthropic.MessageParam[] = [{ role: "user", content: pergunta }];

  try {
    // Laço de tool use manual: o modelo pede uma ferramenta, executamos contra o
    // núcleo (escopado ao papel) e devolvemos; repete até ele responder em texto.
    // Limite de voltas por segurança (evita laço infinito e custo descontrolado).
    // Requisição mantida model-agnostic (sem thinking/effort) para funcionar com
    // qualquer IA_MODELO — Haiku 4.5 (padrão), Sonnet 4.6 ou Opus (decisão #46).
    for (let volta = 0; volta < 6; volta++) {
      const resposta = await client.messages.create({
        model: config.iaModelo,
        max_tokens: 4096,
        system: SISTEMA,
        tools: FERRAMENTAS_LEITURA,
        messages: mensagens,
      });

      if (resposta.stop_reason !== "tool_use") {
        const texto = resposta.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return { resposta: texto, fontes };
      }

      mensagens.push({ role: "assistant", content: resposta.content });

      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        const { conteudo, fontes: novas } = await executarFerramenta(
          bloco.name,
          (bloco.input ?? {}) as Record<string, unknown>,
          papel
        );
        for (const f of novas) {
          const chave = `${f.entidade_tipo}:${f.entidade_id}`;
          if (vistas.has(chave)) continue;
          vistas.add(chave);
          fontes.push(f);
        }
        resultados.push({ type: "tool_result", tool_use_id: bloco.id, content: conteudo });
      }
      mensagens.push({ role: "user", content: resultados });
    }

    throw new AppError(
      500,
      "IA_SEM_RESPOSTA",
      "O copiloto não conseguiu concluir a resposta. Tente reformular a pergunta."
    );
  } catch (err) {
    throw traduzirErroIa(err, AnthropicClient);
  }
}
