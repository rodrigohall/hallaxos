import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

interface Resultado {
  entidade_tipo: string;
  entidade_id: string;
  titulo: string;
  subtitulo: string;
}

const ROTAS: Record<string, (id: string) => string> = {
  pessoa: (id) => `/clientes/${id}`,
};

export function BuscaGlobal() {
  const [consulta, setConsulta] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [aberto, setAberto] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navegar = useNavigate();

  useEffect(() => {
    clearTimeout(temporizador.current);
    if (consulta.trim().length < 2) {
      setResultados([]);
      return;
    }
    temporizador.current = setTimeout(() => {
      api
        .get<{ dados: Resultado[] }>(`/busca?q=${encodeURIComponent(consulta)}`)
        .then(({ dados }) => setResultados(dados))
        .catch(() => setResultados([]));
    }, 250);
  }, [consulta]);

  const abrir = (r: Resultado) => {
    setAberto(false);
    setConsulta("");
    const rota = ROTAS[r.entidade_tipo];
    if (rota) navegar(rota(r.entidade_id));
  };

  return (
    <div className="relative w-full max-w-md">
      <input
        value={consulta}
        onChange={(e) => {
          setConsulta(e.target.value);
          setAberto(true);
        }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onFocus={() => setAberto(true)}
        placeholder="Buscar placa, nome, CPF, telefone, operação…"
        className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm placeholder:text-suave/60 focus:border-marca focus:outline-none"
      />
      {aberto && resultados.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-borda bg-painel shadow-xl">
          {resultados.map((r) => (
            <li key={`${r.entidade_tipo}-${r.entidade_id}`}>
              <button
                onMouseDown={() => abrir(r)}
                className="block w-full px-3 py-2 text-left hover:bg-borda/40"
              >
                <span className="block text-sm">{r.titulo}</span>
                <span className="block text-xs text-suave">{r.subtitulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
