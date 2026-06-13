// Copiloto de IA (Sprint 9) — scaffold.
//
// Reusa o núcleo compartilhado (regra máxima: a informação existe uma vez só):
// o copiloto não tem dados próprios, ele consulta a busca global já existente
// como ferramenta, sempre escopada ao papel do usuário logado (doc 05). O
// modelo Claude apenas orquestra perguntas em linguagem natural sobre esses
// mesmos dados.
//
// Desligado por padrão: sem config.iaApiKey, perguntar() lança 503 e nenhuma
// chamada paga é feita. Para ligar, defina IA_API_KEY (secret no servidor,
// NUNCA no repositório) — o resto já está pronto.
import type Anthropic from "@anthropic-ai/sdk";
import type { PapelUsuario } from "@hallaxos/shared";
import { db } from "../db/client";
import { buscar } from "./busca";
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
  "Você NÃO tem dados próprios: para qualquer pergunta sobre clientes, ativos,",
  "operações, lançamentos ou manutenções, use a ferramenta busca_global antes",
  "de responder — nunca invente números ou nomes. Se a busca não trouxer o que",
  "é preciso, diga que não encontrou. Cite as entidades que embasaram a resposta.",
].join(" ");

// A ferramenta exposta ao modelo: a mesma busca global das telas, escopada ao
// papel do usuário (a função buscar já filtra o que o papel não pode ver).
const ferramentas: Anthropic.Tool[] = [
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
];

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
  const mensagens: Anthropic.MessageParam[] = [
    { role: "user", content: pergunta },
  ];

  // Laço de tool use manual: o modelo pede a busca, executamos contra o núcleo
  // e devolvemos; repete até ele responder em texto. Limite de voltas por
  // segurança (evita laço infinito e custo descontrolado).
  for (let volta = 0; volta < 6; volta++) {
    const resposta = await client.messages.create({
      model: config.iaModelo,
      max_tokens: 4096,
      system: SISTEMA,
      tools: ferramentas,
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
      if (bloco.type !== "tool_use" || bloco.name !== "busca_global") continue;
      const consulta = String((bloco.input as { consulta?: unknown }).consulta ?? "");
      const achados = await buscar(db, consulta, papel);
      for (const a of achados) {
        fontes.push({ entidade_tipo: a.entidade_tipo, entidade_id: a.entidade_id, titulo: a.titulo });
      }
      resultados.push({
        type: "tool_result",
        tool_use_id: bloco.id,
        content: JSON.stringify(achados),
      });
    }
    mensagens.push({ role: "user", content: resultados });
  }

  throw new AppError(
    500,
    "IA_SEM_RESPOSTA",
    "O copiloto não conseguiu concluir a resposta. Tente reformular a pergunta."
  );
}
