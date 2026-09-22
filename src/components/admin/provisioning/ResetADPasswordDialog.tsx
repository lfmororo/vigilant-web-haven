import { useState } from "react";
import { KeyRound, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { generateTemporaryPassword } from "@/lib/generateTemporaryPassword";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export interface PasswordResetUser {
  id: string;
  client_id: string;
  sector_id: string | null;
  full_name: string;
  username: string;
  email: string | null;
  phone: string | null;
  job_title: string | null;
}

interface ResetADPasswordDialogProps {
  user: PasswordResetUser | null;
  mode: "change" | "resend";
  onClose: () => void;
  onQueued: () => void;
}

const ResetADPasswordDialog = ({ user, mode, onClose, onQueued }: ResetADPasswordDialogProps) => {
  const [password, setPassword] = useState(generateTemporaryPassword);
  const [saving, setSaving] = useState(false);
  const shouldNotify = mode === "resend";

  const submit = async () => {
    if (!user || password.length < 6 || password.length > 128) {
      toast.error("A senha deve ter entre 6 e 128 caracteres.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("provisioning_requests").insert({
      client_id: user.client_id,
      sector_id: user.sector_id,
      full_name: user.full_name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      job_title: user.job_title,
      initial_password: password,
      operation: "reset_password",
      notify_on_completion: shouldNotify,
      source_request_id: user.id,
    });
    setSaving(false);
    if (error) {
      toast.error(`Erro ao solicitar alteração: ${error.message}`);
      return;
    }
    toast.success(shouldNotify
      ? "Nova senha solicitada. Os dados serão enviados após a alteração no AD."
      : "Alteração de senha enviada ao agente do AD.");
    onQueued();
    onClose();
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {shouldNotify ? <RefreshCw /> : <KeyRound />}
            {shouldNotify ? "Reenviar dados do usuário" : "Alterar senha no AD"}
          </DialogTitle>
          <DialogDescription>
            {shouldNotify
              ? "Por segurança, a senha anterior não é armazenada. Uma nova senha será aplicada e enviada aos administradores e ao grupo da empresa."
              : "A nova senha será aplicada pelo agente e deverá ser alterada no primeiro acesso."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="temporary-password">Nova senha provisória</Label>
          <div className="flex gap-2">
            <Input id="temporary-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <Button type="button" variant="outline" onClick={() => setPassword(generateTemporaryPassword())}>Gerar</Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? "Solicitando..." : shouldNotify ? "Alterar e reenviar" : "Alterar senha"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ResetADPasswordDialog;