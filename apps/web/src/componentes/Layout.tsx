import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth";
import { BuscaGlobal } from "./BuscaGlobal";

const itens = [
  { para: "/", rotulo: "Dashboard", fim: true },
  { para: "/clientes", rotulo: "Clientes" },
];

export function Layout() {
  const { usuario, sair, pode } = useAuth();

  const navegacao = [...itens, ...(pode("usuarios", "ler") ? [{ para: "/usuarios", rotulo: "Usuários" }] : [])];

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-borda bg-painel md:min-h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between p-4 md:block">
          <h1 className="text-lg font-bold">
            Hallax<span className="text-marca-forte">OS</span>
          </h1>
          <nav className="flex gap-1 md:mt-6 md:flex-col">
            {navegacao.map((item) => (
              <NavLink
                key={item.para}
                to={item.para}
                end={"fim" in item ? item.fim : false}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm ${
                    isActive ? "bg-marca/15 text-marca-forte" : "text-suave hover:bg-borda/40 hover:text-texto"
                  }`
                }
              >
                {item.rotulo}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="hidden p-4 md:block">
          <p className="text-sm">{usuario?.nome}</p>
          <p className="text-xs text-suave">{usuario?.papel}</p>
          <button onClick={sair} className="mt-2 text-xs text-suave underline hover:text-texto">
            Sair
          </button>
        </div>
      </aside>

      <div className="flex-1">
        <header className="flex items-center gap-3 border-b border-borda bg-painel/60 p-3">
          <BuscaGlobal />
          <button onClick={sair} className="ml-auto text-xs text-suave underline hover:text-texto md:hidden">
            Sair
          </button>
        </header>
        <main className="mx-auto max-w-6xl p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
