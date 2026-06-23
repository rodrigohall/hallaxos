import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
import { Financeiro } from "./paginas/Financeiro";
import { DashboardFinanceiro } from "./paginas/DashboardFinanceiro";
import { Relatorios } from "./paginas/Relatorios";
import { Usuarios } from "./paginas/Usuarios";

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
              <Route path="/operacoes" element={<Operacoes />} />
              <Route path="/operacoes/nova" element={<OperacaoNova />} />
              <Route path="/operacoes/:id" element={<OperacaoDetalhe />} />
              {/* Guincho foi unificado em Operações (Sprint 5) — rotas antigas redirecionam */}
              <Route path="/guinchos" element={<Navigate to="/operacoes?tipo=guincho" replace />} />
              <Route path="/guinchos/:id" element={<Navigate to="/operacoes" replace />} />
              <Route path="/manutencoes" element={<Manutencoes />} />
              <Route path="/manutencoes/:id" element={<ManutencaoDetalhe />} />
              <Route path="/agenda" element={<Agenda />} />
              <Route path="/financeiro" element={<Financeiro />} />
              <Route path="/dashboard-financeiro" element={<DashboardFinanceiro />} />
              <Route path="/relatorios" element={<Relatorios />} />
              <Route path="/usuarios" element={<Usuarios />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        </ProvedorToast>
      </ProvedorAuth>
    </QueryClientProvider>
  );
}
