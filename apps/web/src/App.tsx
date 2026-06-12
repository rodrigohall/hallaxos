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
import { Guinchos } from "./paginas/Guinchos";
import { GuinchoDetalhe } from "./paginas/GuinchoDetalhe";
import { Financeiro } from "./paginas/Financeiro";
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
              <Route path="/guinchos" element={<Guinchos />} />
              <Route path="/guinchos/:id" element={<GuinchoDetalhe />} />
              <Route path="/financeiro" element={<Financeiro />} />
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
