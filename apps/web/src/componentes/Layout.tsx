import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Users, ShieldCheck, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { useAuth } from "../auth";
import { BuscaGlobal } from "./BuscaGlobal";
import { LogoCompleta, Monograma } from "../marca/Logo";

interface ItemNav {
  para: string;
  rotulo: string;
  icone: LucideIcon;
  fim?: boolean;
}

export function Layout() {
  const { usuario, sair, pode } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);

  const navegacao: ItemNav[] = [
    { para: "/", rotulo: "Dashboard", icone: LayoutDashboard, fim: true },
    { para: "/clientes", rotulo: "Clientes", icone: Users },
    ...(pode("usuarios", "ler")
      ? [{ para: "/usuarios", rotulo: "Usuários", icone: ShieldCheck }]
      : []),
  ];

  const Item = ({ item }: { item: ItemNav }) => (
    <NavLink
      to={item.para}
      end={item.fim}
      onClick={() => setMenuAberto(false)}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150 ` +
        (isActive
          ? "bg-ouro/10 text-ouro"
          : "text-suave hover:bg-elevado hover:text-texto")
      }
    >
      <item.icone className="h-4 w-4" />
      {item.rotulo}
    </NavLink>
  );

  return (
    <div className="min-h-screen md:flex">
      {/* Sidebar desktop */}
      <aside className="hidden border-r border-borda bg-painel md:flex md:min-h-screen md:w-60 md:flex-col">
        <div className="px-5 py-5">
          <LogoCompleta />
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {navegacao.map((item) => (
            <Item key={item.para} item={item} />
          ))}
        </nav>
        <div className="border-t border-borda p-4">
          <p className="truncate text-sm font-medium">{usuario?.nome}</p>
          <p className="text-xs capitalize text-mudo">{usuario?.papel}</p>
          <button
            onClick={sair}
            className="mt-2 flex items-center gap-1.5 text-xs text-suave transition-colors hover:text-erro"
          >
            <LogOut className="h-3 w-3" /> Sair
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-borda bg-fundo/80 px-4 py-2.5 backdrop-blur-md">
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="rounded-md p-1.5 text-suave hover:bg-elevado md:hidden"
            aria-label="Menu"
          >
            {menuAberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <span className="md:hidden">
            <Monograma className="h-5 w-auto text-ouro" />
          </span>
          <div className="flex-1">
            <BuscaGlobal />
          </div>
        </header>

        {/* Menu mobile */}
        {menuAberto && (
          <nav className="animar-surgir space-y-0.5 border-b border-borda bg-painel p-3 md:hidden">
            {navegacao.map((item) => (
              <Item key={item.para} item={item} />
            ))}
            <button
              onClick={sair}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-suave hover:bg-elevado"
            >
              <LogOut className="h-4 w-4" /> Sair ({usuario?.nome})
            </button>
          </nav>
        )}

        <main className="mx-auto max-w-6xl p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
