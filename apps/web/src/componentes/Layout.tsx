import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard, Users, CarFront, Workflow, Wrench, CalendarDays,
  CircleDollarSign, BarChart3, ShieldCheck, KeyRound, LogOut, Menu, X,
  TrendingUp, ClipboardList, MoreHorizontal, type LucideIcon,
} from "lucide-react";
import { useAuth } from "../auth";
import { BuscaGlobal } from "./BuscaGlobal";
import { Notificacoes } from "./Notificacoes";
import { ProvedorCopiloto, BotaoCopiloto } from "./Copiloto";
import { LogoCompleta, Monograma } from "../marca/Logo";
import { ModalTrocarSenha } from "./TrocarSenha";

interface ItemNav {
  para: string;
  rotulo: string;
  icone: LucideIcon;
  fim?: boolean;
  rotuloBottom?: string; // rótulo mais curto para a barra inferior
}

export function Layout() {
  const { usuario, sair, pode, copilotoAtivo } = useAuth();
  const [menuAberto, setMenuAberto] = useState(false);
  const [senhaAberta, setSenhaAberta] = useState(false);

  const navegacao: ItemNav[] = [
    { para: "/", rotulo: "Dashboard", icone: LayoutDashboard, fim: true, rotuloBottom: "Início" },
    { para: "/ativos", rotulo: "Ativos", icone: CarFront },
    ...(pode("operacoes", "ler")
      ? [{ para: "/operacoes", rotulo: "Operações", icone: Workflow, rotuloBottom: "Ops" }]
      : []),
    ...(pode("manutencoes", "ler")
      ? [{ para: "/manutencoes", rotulo: "Manutenções", icone: Wrench, rotuloBottom: "Manutenção" }]
      : []),
    ...(pode("agenda", "ler")
      ? [{ para: "/agenda", rotulo: "Agenda", icone: CalendarDays }]
      : []),
    { para: "/clientes", rotulo: "Clientes", icone: Users },
    ...(pode("lancamentos", "ler")
      ? [{ para: "/financeiro", rotulo: "Financeiro", icone: CircleDollarSign, rotuloBottom: "R$" }]
      : []),
    ...(pode("dashboard_financeiro", "ler")
      ? [{ para: "/dashboard-financeiro", rotulo: "Dashboard $", icone: TrendingUp }]
      : []),
    ...(pode("relatorios_financeiros", "ler")
      ? [{ para: "/relatorios", rotulo: "Relatórios", icone: BarChart3 }]
      : []),
    ...(pode("usuarios", "ler")
      ? [{ para: "/usuarios", rotulo: "Usuários", icone: ShieldCheck }]
      : []),
    ...(pode("usuarios", "ler")
      ? [{ para: "/auditoria", rotulo: "Auditoria", icone: ClipboardList }]
      : []),
  ];

  // Bottom nav: até 4 itens primários (os mais usados no dia a dia)
  const navBottom = navegacao.filter((i) =>
    ["/", "/ativos", "/operacoes", "/financeiro"].includes(i.para)
  );

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
    <ProvedorCopiloto>
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
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={() => setSenhaAberta(true)}
              className="flex items-center gap-1.5 text-xs text-suave transition-colors hover:text-ouro"
            >
              <KeyRound className="h-3 w-3" /> Senha
            </button>
            <button
              onClick={sair}
              className="flex items-center gap-1.5 text-xs text-suave transition-colors hover:text-erro"
            >
              <LogOut className="h-3 w-3" /> Sair
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Barra superior */}
        <header
          className="vidro sticky top-0 z-40 flex items-center gap-3 border-b border-borda px-4 py-2.5 safe-t"
        >
          {/* Hamburger visível só no desktop (md+) sem bottom nav, ou quando menu já está aberto no mobile */}
          <button
            onClick={() => setMenuAberto(!menuAberto)}
            className="flex h-9 w-9 items-center justify-center rounded-md text-suave transition-colors hover:bg-elevado hover:text-texto md:hidden"
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
          {copilotoAtivo && <BotaoCopiloto />}
          <Notificacoes />
        </header>

        {/* Menu mobile — slide-up acima da barra inferior */}
        {menuAberto && (
          <nav className="animar-folha vidro fixed inset-x-0 bottom-14 z-30 max-h-[70vh] overflow-y-auto border-t border-borda p-3 shadow-flutuante md:hidden safe-b">
            <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-wider text-mudo">
              {usuario?.nome} · {usuario?.papel}
            </p>
            {navegacao.map((item) => (
              <Item key={item.para} item={item} />
            ))}
            <div className="mt-2 border-t border-borda pt-2">
              <button
                onClick={() => { setMenuAberto(false); setSenhaAberta(true); }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-suave hover:bg-elevado"
              >
                <KeyRound className="h-4 w-4" /> Trocar senha
              </button>
              <button
                onClick={sair}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-sm text-suave hover:bg-elevado"
              >
                <LogOut className="h-4 w-4" /> Sair
              </button>
            </div>
          </nav>
        )}

        <main className="mx-auto max-w-6xl p-4 pb-20 md:p-6 md:pb-6">
          <Outlet />
        </main>

        {/* Bottom navigation (mobile only) */}
        <nav
          className="vidro fixed inset-x-0 bottom-0 z-40 border-t border-borda md:hidden safe-b"
        >
          <div className="flex">
            {navBottom.map((item) => (
              <NavLink
                key={item.para}
                to={item.para}
                end={item.fim}
                onClick={() => setMenuAberto(false)}
                className={({ isActive }) =>
                  `flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ` +
                  (isActive ? "text-ouro" : "text-suave")
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`rounded-full px-3 py-0.5 transition-all duration-200 ${isActive ? "bg-ouro/10" : ""}`}>
                      <item.icone className={`h-5 w-5 transition-transform duration-200 ${isActive ? "scale-110" : ""}`} />
                    </span>
                    <span>{item.rotuloBottom ?? item.rotulo}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button
              onClick={() => setMenuAberto(!menuAberto)}
              className={`flex flex-1 flex-col items-center gap-0.5 px-1 py-2 text-[10px] font-medium transition-colors ${menuAberto ? "text-ouro" : "text-suave"}`}
            >
              <span className={`rounded-full px-3 py-0.5 transition-all duration-200 ${menuAberto ? "bg-ouro/10" : ""}`}>
                <MoreHorizontal className={`h-5 w-5 transition-transform duration-200 ${menuAberto ? "scale-110" : ""}`} />
              </span>
              <span>Mais</span>
            </button>
          </div>
        </nav>
      </div>

      <ModalTrocarSenha aberto={senhaAberta} aoFechar={() => setSenhaAberta(false)} />
    </div>
    </ProvedorCopiloto>
  );
}
