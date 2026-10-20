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
import { randomUUID } from "node:crypto";
import { pode, type PapelUsuario, type RegistroCopiloto, type TipoOperacao } from "@hallaxos/shared";
import { db } from "../db/client";
import { buscar } from "./busca";
import { listarOperacoes } from "./operacoes";
import { dre, resultadoPorAtivo } from "./relatorios";
import { montarDashboard } from "./dashboard";
import { listarContas, listarCategoriasFinanceiras } from "./financeiro";
import { listarCategorias } from "./ativos";
import { conferirRegistro, type LinhaResumo } from "./registroCopiloto";
import { AppError } from "../lib/erros";
import { config } from "../config";
import { hojeEmDourados } from "../lib/hoje";

export { hojeEmDourados };

export interface FonteCopiloto {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
}

// Decisão #43, refinada na #79 (Sprint 17): o copiloto NÃO escreve no banco.
// Quando o usuário conta algo que aconteceu ("hoje fizemos um guincho…"), o
// modelo monta uma PROPOSTA de registro; a UI mostra o card com o resumo, o
// humano toca em "Confirmar e lançar" e SÓ ENTÃO a UI chama
// POST /copiloto/registrar — que executa pelos services de sempre, com a
// autoria do humano e a máquina de estados intacta. A proposta é inerte.
export interface PropostaCopiloto {
  acao: "registrar";
  /** Gerada na proposta; a confirmação a reenvia para o duplo toque não lançar duas vezes. */
  chave: string;
  titulo: string;
  resumo: string;
  linhas: LinhaResumo[];
  endpoint: "POST /copiloto/registrar";
  registro: RegistroCopiloto;
}

export interface RespostaCopiloto {
  resposta: string;
  fontes: FonteCopiloto[];
  propostas: PropostaCopiloto[];
}

const SISTEMA = [
  "Você é o copiloto do HallaxOS, o sistema operacional da Hallax (guincho,",
  "locação, compra e venda de veículos, financeiro e manutenções), em Dourados-MS.",
  "Responda em português do Brasil, de forma direta e curta.",
  "",
  "CONSULTAS. Você não tem dados próprios: para qualquer pergunta sobre clientes,",
  "ativos, operações, lançamentos, indicadores ou manutenções, use as ferramentas",
  "antes de responder e nunca invente números ou nomes. busca_global encontra",
  "registros; dashboard_resumo dá a fotografia do dia; operacoes_abertas lista o que",
  "está em andamento ou atrasado; relatorio_financeiro traz faturamento, DRE e ROI",
  "por ativo. Se uma ferramenta disser que o papel do usuário não tem acesso, diga",
  "isso sem expor o dado. Cite as entidades que embasaram a resposta.",
  "",
  "REGISTROS. Quando o usuário contar algo que aconteceu ou pedir para lançar — um",
  "guincho, uma locação, uma venda, uma compra, uma despesa ou receita — use",
  "propor_registro. Ela NÃO grava nada: confere os dados e, se estiver tudo certo,",
  "mostra ao usuário um card com o resumo e o botão Confirmar e lançar.",
  "Antes de propor: use busca_global para achar o cliente e o ativo citados e passe",
  "o id encontrado; se houver mais de um parecido, pergunte qual. Se o cliente não",
  "estiver cadastrado, cadastre-o como novo — para isso são obrigatórios o nome e o",
  "CPF/CNPJ. Use opcoes_registro para os ids de conta e de categoria; mapeie o que",
  "o usuário disser (\"no Cresol\", \"no pix\") para o id e a forma da lista.",
  "Chame propor_registro com tudo o que já souber, mesmo incompleto: ela responde",
  "o que falta ou o que está errado. Aí pergunte ao usuário, numa mensagem só e",
  "curta, apenas o que falta. Sempre é preciso saber se já foi pago (e então em",
  "qual conta e de que forma) ou se fica a receber/pagar (e o vencimento).",
  "Nunca invente dado: CPF, valor, placa, conta, data — o que não foi dito, pergunte.",
  "Datas como \"hoje\", \"ontem\" ou \"sexta\" você converte a partir da data de hoje",
  "informada abaixo. Data, caminhão, motorista, telefone e placa do veículo",
  "transportado são opcionais: não pergunte por eles se o usuário não falou.",
  "Quando a proposta for montada, diga em uma frase que o card está pronto para",
  "ele conferir e tocar em Confirmar e lançar. Nunca diga que lançou, criou ou",
  "registrou — até o toque, nada foi gravado. Se ele corrigir algo depois (\"na",
  "verdade foram 450\"), chame propor_registro de novo com o registro inteiro",
  "corrigido.",
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
  {
    name: "opcoes_registro",
    description:
      "Ids e nomes que um registro precisa: contas financeiras (Cresol, Dinheiro…), " +
      "categorias financeiras, categorias de ativo e formas de pagamento. Use antes de " +
      "propor_registro para trocar \"no Cresol\" ou \"despesa de diesel\" pelo id certo.",
    input_schema: { type: "object" as const, properties: {} },
  },
];

// Ferramenta de REGISTRO (Sprint 17 · decisão #79) — NÃO escreve. Confere o
// registro e devolve uma proposta inerte (ou o que falta); quem grava é
// POST /copiloto/registrar, quando o humano confirma. Mantida fora de
// FERRAMENTAS_LEITURA de propósito: o invariante "leitura não muta" segue
// testável, e a lista só é exposta a quem pode criar operação ou lançamento.
const PESSOA_REGISTRO = {
  type: "object",
  description: "Cadastro existente ({ id }) OU dados de um novo ({ novo }).",
  properties: {
    id: { type: "string", description: "UUID de um cadastro achado com busca_global." },
    novo: {
      type: "object",
      properties: {
        tipo: { type: "string", enum: ["pf", "pj"], description: "pf (CPF) ou pj (CNPJ). Padrão pf." },
        nome: { type: "string" },
        cpf_cnpj: { type: "string", description: "Só dígitos ou formatado; 11 (CPF) ou 14 (CNPJ)." },
        telefone: { type: "string", description: "Opcional, com DDD." },
      },
    },
  },
};

const PAGAMENTO_REGISTRO = {
  type: "object",
  description: "Pago (conta + forma) ou pendente (vencimento).",
  properties: {
    situacao: { type: "string", enum: ["pago", "pendente"] },
    conta_id: { type: "string", description: "UUID da conta (opcoes_registro). Obrigatório se pago." },
    forma_pagamento: {
      type: "string",
      enum: ["dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto", "transferencia"],
      description: "Obrigatório se pago.",
    },
    data_pagamento: { type: "string", description: "YYYY-MM-DD, se pago em outra data." },
    data_vencimento: { type: "string", description: "YYYY-MM-DD. Obrigatório se pendente." },
    parcelas: { type: "integer", description: "Só pendente. Parcelas mensais a partir do vencimento. Padrão 1." },
  },
};

export const FERRAMENTAS_REGISTRO: Anthropic.Tool[] = [
  {
    name: "propor_registro",
    description:
      "PROPÕE (não grava) o registro de algo que aconteceu: guincho, locação, venda, " +
      "compra ou lançamento financeiro avulso. Confere os dados contra o sistema e responde " +
      "o que falta (para você perguntar ao usuário) ou monta o card de confirmação. " +
      "Envie sempre o registro inteiro, com tudo o que já sabe.",
    input_schema: {
      type: "object" as const,
      properties: {
        tipo: { type: "string", enum: ["guincho", "locacao", "venda", "compra", "lancamento"] },
        data: { type: "string", description: "YYYY-MM-DD em que aconteceu. Omitir = hoje. (Não usado em locação.)" },
        observacoes: { type: "string" },
        cliente: {
          ...PESSOA_REGISTRO,
          description: "Guincho/locação/venda: o cliente. Compra: quem vendeu. " + PESSOA_REGISTRO.description,
        },
        pagamento: { ...PAGAMENTO_REGISTRO, description: "Locação: só quando finalizada. " + PAGAMENTO_REGISTRO.description },
        valor: { type: "number", description: "Valor em reais (guincho, venda, compra, lançamento)." },
        origem_endereco: { type: "string", description: "Guincho." },
        destino_endereco: { type: "string", description: "Guincho." },
        veiculo_cliente_descricao: { type: "string", description: "Guincho: veículo transportado (ex.: 'Gol prata')." },
        veiculo_cliente_placa: { type: "string", description: "Guincho, opcional." },
        caminhao_id: { type: "string", description: "Guincho, opcional: UUID do caminhão (ativo)." },
        motorista_id: { type: "string", description: "Guincho, opcional: UUID do motorista (pessoa)." },
        ativo_id: {
          type: "string",
          description: "Locação: veículo alugado. Venda: ativo vendido. Lançamento: ativo relacionado (opcional).",
        },
        valor_diaria: { type: "number", description: "Locação." },
        data_retirada: { type: "string", description: "Locação: YYYY-MM-DD." },
        data_devolucao: { type: "string", description: "Locação: YYYY-MM-DD, prevista ou real." },
        situacao: {
          type: "string",
          enum: ["reservada", "ativa", "finalizada"],
          description: "Locação: reservada (não saiu), ativa (com o cliente), finalizada (já voltou).",
        },
        transferido: { type: "boolean", description: "Venda/compra: documentação já transferida." },
        ativo: {
          type: "object",
          description: "Compra: ativo já cadastrado ({ id }) ou novo ({ novo }).",
          properties: {
            id: { type: "string" },
            novo: {
              type: "object",
              properties: {
                nome: { type: "string" },
                categoria_id: { type: "string", description: "UUID da categoria de ativo (opcoes_registro)." },
                veiculo: {
                  type: "object",
                  description: "Obrigatório se a categoria for veicular.",
                  properties: {
                    placa: { type: "string" },
                    marca: { type: "string" },
                    modelo: { type: "string" },
                    ano_modelo: { type: "integer" },
                    cor: { type: "string" },
                  },
                },
              },
            },
          },
        },
        natureza: { type: "string", enum: ["receita", "despesa"], description: "Lançamento." },
        descricao: { type: "string", description: "Lançamento: descrição curta." },
        categoria_id: { type: "string", description: "Lançamento: UUID da categoria financeira (opcoes_registro)." },
        pessoa_id: { type: "string", description: "Lançamento, opcional: UUID de quem paga/recebe." },
      },
      required: ["tipo"],
    },
  },
];

// Ferramentas disponíveis ao papel: leitura para todos; registro para quem pode
// criar operação ou lançamento — cada passo é revalidado na execução (doc 05).
export function ferramentasPara(papel: PapelUsuario): Anthropic.Tool[] {
  const registra = pode(papel, "operacoes", "criar") || pode(papel, "lancamentos", "criar");
  return [...FERRAMENTAS_LEITURA, ...(registra ? FERRAMENTAS_REGISTRO : [])];
}

const TIPOS_OPERACAO = new Set<TipoOperacao>(["guincho", "locacao", "venda", "compra"]);

interface ResultadoFerramenta {
  conteudo: string;
  fontes: FonteCopiloto[];
  proposta?: PropostaCopiloto;
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

    case "opcoes_registro": {
      // Ids que o registro precisa — conta e categoria financeira só para quem
      // enxerga o financeiro (doc 05); categoria de ativo para quem cadastra ativo.
      const [contas, categorias, categoriasAtivo] = await Promise.all([
        pode(papel, "contas", "ler") ? listarContas() : Promise.resolve([]),
        pode(papel, "categorias_financeiras", "ler") ? listarCategoriasFinanceiras() : Promise.resolve([]),
        listarCategorias(),
      ]);
      return {
        conteudo: JSON.stringify({
          contas: (contas as Array<Record<string, unknown>>).map((c) => ({ id: c.id, nome: c.nome })),
          categorias_financeiras: categorias.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
          categorias_de_ativo: categoriasAtivo.map((c) => ({ id: c.id, nome: c.nome, veicular: c.ehVeicular })),
          formas_pagamento: ["dinheiro", "pix", "cartao_credito", "cartao_debito", "boleto", "transferencia"],
        }),
        fontes: [],
      };
    }

    case "propor_registro": {
      // NÃO escreve: confere contra o banco e devolve o que falta (o modelo
      // pergunta) ou uma proposta inerte (a UI mostra o card de confirmação).
      const c = await conferirRegistro(input, papel);
      if (c.problemas.length > 0 || !c.registro) {
        return {
          conteudo: JSON.stringify({
            registro_incompleto: true,
            faltando: c.problemas,
            instrucao:
              "Nada foi proposto nem gravado. Resolva o que der com as ferramentas (busca_global, " +
              "opcoes_registro); o resto, pergunte ao usuário numa mensagem só e curta. Não invente dados.",
          }),
          fontes: [],
        };
      }
      const proposta: PropostaCopiloto = {
        acao: "registrar",
        chave: randomUUID(),
        titulo: c.titulo,
        resumo: c.linhas.map((l) => `${l.rotulo}: ${l.valor}`).join(" · "),
        linhas: c.linhas,
        endpoint: "POST /copiloto/registrar",
        registro: c.registro,
      };
      return {
        conteudo: JSON.stringify({
          proposta_registrada: true,
          resumo: c.linhas,
          mensagem:
            "O card com este resumo foi mostrado ao usuário, com o botão Confirmar e lançar. " +
            "Nada foi gravado ainda. Diga em uma frase para ele conferir e confirmar.",
        }),
        fontes: [],
        proposta,
      };
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

/** Turno já respondido, reenviado pelo chat para dar memória à conversa. */
export interface TurnoAnterior {
  pergunta: string;
  resposta: string;
}

/** Quantos turnos anteriores a conversa carrega — o bastante para completar um
 *  registro em várias mensagens, sem deixar a conta de tokens crescer sem fim. */
export const MAX_TURNOS_HISTORICO = 12;

/** Monta as mensagens da requisição: histórico (pares pergunta/resposta) + a nova pergunta. */
export function montarMensagens(pergunta: string, historico: TurnoAnterior[]): Anthropic.MessageParam[] {
  return [
    ...historico.slice(-MAX_TURNOS_HISTORICO).flatMap((t): Anthropic.MessageParam[] => [
      { role: "user", content: t.pergunta },
      { role: "assistant", content: t.resposta },
    ]),
    { role: "user", content: pergunta },
  ];
}

export async function perguntar(
  pergunta: string,
  papel: PapelUsuario,
  historico: TurnoAnterior[] = []
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
  const propostas: PropostaCopiloto[] = [];
  const vistas = new Set<string>(); // dedup de fontes por tipo:id
  const ferramentas = ferramentasPara(papel); // leitura + proposta (se o papel puder lançar)
  const mensagens = montarMensagens(pergunta, historico);
  const hoje = hojeEmDourados();
  // O prompt fixo vai num bloco com cache (ferramentas + sistema se repetem a
  // cada volta do laço); a data, que muda, fica num bloco depois do cache.
  const sistema: Anthropic.TextBlockParam[] = [
    { type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Hoje é ${hoje.semana}, ${hoje.data} (horário de Dourados-MS).` },
  ];

  try {
    // Laço de tool use manual: o modelo pede uma ferramenta, executamos contra o
    // núcleo (escopado ao papel) e devolvemos; repete até ele responder em texto.
    // Limite de voltas por segurança (evita laço infinito e custo descontrolado).
    // Requisição mantida model-agnostic (sem thinking/effort) para funcionar com
    // qualquer IA_MODELO — Sonnet 5.5 (padrão, decisão #83), Haiku ou Opus (decisão #46).
    // Registrar pede mais voltas que consultar: busca do cliente, do ativo,
    // opções de conta/categoria e a proposta.
    for (let volta = 0; volta < 8; volta++) {
      const resposta = await client.messages.create({
        model: config.iaModelo,
        // Folga para o raciocínio dos modelos que pensam antes de responder
        // (Sonnet 5.5 pensa por padrão; com 4096 a resposta podia sair cortada).
        max_tokens: 16000,
        system: sistema,
        tools: ferramentas,
        messages: mensagens,
      });

      if (resposta.stop_reason === "refusal") {
        return {
          resposta: "Não consigo ajudar com esse pedido. Tente reformular a mensagem.",
          fontes,
          propostas,
        };
      }

      if (resposta.stop_reason !== "tool_use") {
        const texto = resposta.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return {
          resposta: texto || "Não consegui formular a resposta agora. Pode repetir?",
          fontes,
          propostas,
        };
      }

      mensagens.push({ role: "assistant", content: resposta.content });

      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const bloco of resposta.content) {
        if (bloco.type !== "tool_use") continue;
        const { conteudo, fontes: novas, proposta } = await executarFerramenta(
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
        if (proposta) propostas.push(proposta);
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
