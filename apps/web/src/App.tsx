import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProvedorAuth, useAuth } from "./auth";
import { Layout } from "./componentes/Layout";
import { Login } from "./paginas/Login";
import { Dashboard } from "./paginas/Dashboard";
import { Pessoas } from "./paginas/Pessoas";
import { PessoaForm } from "./paginas/PessoaForm";
import { PessoaDetalhe } from "./paginas/PessoaDetalhe";
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
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protegido />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/clientes" element={<Pessoas />} />
              <Route path="/clientes/novo" element={<PessoaForm />} />
              <Route path="/clientes/:id" element={<PessoaDetalhe />} />
              <Route path="/clientes/:id/editar" element={<PessoaForm />} />
              <Route path="/usuarios" element={<Usuarios />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ProvedorAuth>
    </QueryClientProvider>
  );
}
