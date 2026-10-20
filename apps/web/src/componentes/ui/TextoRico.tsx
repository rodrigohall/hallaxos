// Markdown mínimo para respostas do copiloto (Sprint 17): o modelo responde com
// **negrito**, listas e títulos, e o chat mostrava os asteriscos crus. Cobre só
// o que o copiloto usa — parágrafo, título (#), lista com - / * / 1., **negrito**,
// *itálico* e `código` — e monta elementos React, nunca HTML: texto vindo da IA
// não tem como injetar marcação na página. Sem dependência nova de propósito.
import { Fragment, type ReactNode } from "react";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function inline(texto: string): ReactNode[] {
  return texto.split(INLINE).map((parte, i) => {
    if (parte.startsWith("**") && parte.endsWith("**") && parte.length > 4) {
      return <strong key={i} className="font-semibold text-texto">{parte.slice(2, -2)}</strong>;
    }
    if (parte.startsWith("`") && parte.endsWith("`") && parte.length > 2) {
      return <code key={i} className="rounded bg-elevado px-1 font-mono text-[0.85em]">{parte.slice(1, -1)}</code>;
    }
    if (parte.startsWith("*") && parte.endsWith("*") && parte.length > 2) {
      return <em key={i}>{parte.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{parte}</Fragment>;
  });
}

type Bloco =
  | { tipo: "p"; linhas: string[] }
  | { tipo: "h"; texto: string }
  | { tipo: "ul"; itens: string[] }
  | { tipo: "ol"; itens: string[] };

function blocos(texto: string): Bloco[] {
  const saida: Bloco[] = [];
  for (const bruta of texto.replace(/\r/g, "").split("\n")) {
    const linha = bruta.trimEnd();
    const ultimo = saida[saida.length - 1];
    const titulo = /^#{1,6}\s+(.*)$/.exec(linha);
    const ul = /^\s*[-*•]\s+(.*)$/.exec(linha);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(linha);
    if (!linha.trim()) {
      saida.push({ tipo: "p", linhas: [] });
    } else if (titulo) {
      saida.push({ tipo: "h", texto: titulo[1]! });
    } else if (ul || ol) {
      const tipo: "ul" | "ol" = ul ? "ul" : "ol";
      const item = (ul ?? ol)![1]!;
      if (ultimo && ultimo.tipo !== "p" && ultimo.tipo !== "h" && ultimo.tipo === tipo) ultimo.itens.push(item);
      else saida.push({ tipo, itens: [item] });
    } else if (ultimo && ultimo.tipo === "p") {
      ultimo.linhas.push(linha);
    } else {
      saida.push({ tipo: "p", linhas: [linha] });
    }
  }
  return saida.filter((b) => b.tipo !== "p" || b.linhas.length > 0);
}

export function TextoRico({ texto }: { texto: string }) {
  return (
    <div className="space-y-2 text-sm text-texto">
      {blocos(texto).map((b, i) => {
        if (b.tipo === "h") return <p key={i} className="font-semibold text-texto">{inline(b.texto)}</p>;
        if (b.tipo === "ul" || b.tipo === "ol") {
          const Lista = b.tipo;
          return (
            <Lista key={i} className={`space-y-0.5 pl-5 ${b.tipo === "ul" ? "list-disc" : "list-decimal"} marker:text-mudo`}>
              {b.itens.map((it, j) => <li key={j}>{inline(it)}</li>)}
            </Lista>
          );
        }
        return (
          <p key={i}>
            {b.linhas.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
