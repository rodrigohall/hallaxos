import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProvedorAuth, useAuth } from "./auth";
import { ProvedorToast } from "./componentes/ui";
import { Layout } from "./componentes/Layout";
import { Login } from "./paginas/Login";
import { Dashboard } from "./paginas/Dashboard";
import { Pessoas } from "./paginas/Pessoas";
import { PessoaForm } from "./paginas/PessoaForm";
import { PessoaDetalhe } from "./paginas/PessoaDetalhe";
import { Ativos } from "./paginas/Ativos";
import { AtivoForm } from "./paginas/AtivoForm";
import { AtivoDetalhe } from "./paginas/AtivoDetalhe";
import { Operacoes } from "./paginas/Operacoes";
import { OperacaoNova } from "./paginas/OperacaoNova";
import { OperacaoDetalhe } from "./paginas/OperacaoDetalhe";
import { Manutencoes } from "./paginas/Manutencoes";
import { ManutencaoDetalhe } from "./paginas/ManutencaoDetalhe";
import { Agenda } from "./paginas/Agenda";
import { HubFinanceiro } from "./paginas/financeiro/HubFinanceiro";
import { Usuarios } from "./paginas/Usuarios";
import { Auditoria } from "./paginas/Auditoria";

const filaQueries = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } },
});

function Protegido() {
  const { usuario, carregando } = useAuth();
  if (carregando) {
    return <p className="p-8 text-center text-suave">Carregando…</p>;
  }
  if (!usuario) return <Navigate to="/login" replace />;
  return <Layout />;
}

/**
 * Guarda de permissão na rota. Até o Sprint 16 a permissão só escondia o item
 * de menu: quem digitasse /usuarios na barra de endereço renderizava a tela
 * (a API é que barrava os dados). Agora a rota também recusa.
 */
function Exige({ recurso, acao = "ler" }: { recurso: string; acao?: string }) {
  const { pode } = useAuth();
  if (!pode(recurso, acao)) return <Navigate to="/" replace />;
  return <Outlet />;
}

export function App() {
  return (
    <QueryClientProvider client={filaQueries}>
      <ProvedorAuth>
        <ProvedorToast>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protegido />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clientes" element={<Pessoas />} />
              <Route path="/clientes/novo" element={<PessoaForm />} />
              <Route path="/clientes/:id" element={<PessoaDetalhe />} />
              <Route path="/clientes/:id/editar" element={<PessoaForm />} />
              <Route path="/ativos" element={<Ativos />} />
              <Route path="/ativos/novo" element={<AtivoForm />} />
              <Route path="/ativos/:id" element={<AtivoDetalhe />} />
              <Route path="/ativos/:id/editar" element={<AtivoForm />} />
              <Route element={<Exige recurso="operacoes" />}>
                <Route path="/operacoes" element={<Operacoes />} />
                <Route path="/operacoes/nova" element={<OperacaoNova />} />
                <Route path="/operacoes/:id" element={<OperacaoDetalhe />} />
                {/* Guincho foi unificado em Operações (Sprint 5) — rotas antigas redirecionam */}
                <Route path="/guinchos" element={<Navigate to="/operacoes?tipo=guincho" replace />} />
                <Route path="/guinchos/:id" element={<Navigate to="/operacoes" replace />} />
              </Route>
              <Route element={<Exige recurso="manutencoes" />}>
                <Route path="/manutencoes" element={<Manutencoes />} />
                <Route path="/manutencoes/:id" element={<ManutencaoDetalhe />} />
              </Route>
              <Route element={<Exige recurso="agenda" />}>
                <Route path="/agenda" element={<Agenda />} />
              </Route>
              <Route element={<Exige recurso="lancamentos" />}>
                <Route path="/financeiro" element={<HubFinanceiro />} />
                {/* Dashboard $ e Relatórios viraram abas do hub (Sprint 16) —
                    os endereços antigos seguem valendo para bookmarks. */}
                <Route path="/dashboard-financeiro" element={<Navigate to="/financeiro?aba=painel" replace />} />
                <Route path="/relatorios" element={<Navigate to="/financeiro?aba=planilha" replace />} />
              </Route>
              <Route element={<Exige recurso="usuarios" />}>
                <Route path="/usuarios" element={<Usuarios />} />
                <Route path="/auditoria" element={<Auditoria />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ProvedorToast>
      </ProvedorAuth>
    </QueryClientProvider>
  );
}
