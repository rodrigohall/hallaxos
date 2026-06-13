import { useState } from "react";
import { api, ApiError } from "../api";
import { Botao, Modal, Campo, Entrada, useToast } from "./ui";

export function ModalTrocarSenha({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const notificar = useToast();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [enviando, setEnviando] = useState(false);

  const fechar = () => { setAtual(""); setNova(""); setConfirma(""); aoFechar(); };

  const enviar = async () => {
    if (nova !== confirma) {
      notificar({ tipo: "erro", titulo: "As senhas não conferem" });
      return;
    }
    setEnviando(true);
    try {
      await api.post("/auth/trocar-senha", { senha_atual: atual, senha_nova: nova });
      notificar({ tipo: "ok", titulo: "Senha alterada", descricao: "As outras sessões foram encerradas." });
      fechar();
    } catch (e) {
      notificar({ tipo: "erro", titulo: "Não foi possível trocar", descricao: e instanceof ApiError ? e.message : undefined });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal aberto={aberto} aoFechar={fechar} titulo="Trocar senha">
      <div className="space-y-4">
        <Campo rotulo="Senha atual">
          <Entrada type="password" value={atual} onChange={(e) => setAtual(e.target.value)} autoComplete="current-password" />
        </Campo>
        <Campo rotulo="Nova senha" dica="Mínimo de 8 caracteres.">
          <Entrada type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Confirmar nova senha">
          <Entrada type="password" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="new-password" />
        </Campo>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={fechar}>Cancelar</Botao>
          <Botao onClick={enviar} carregando={enviando} disabled={!atual || nova.length < 8 || enviando}>
            Trocar senha
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
