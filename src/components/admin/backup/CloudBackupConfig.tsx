import { useEffect, useMemo, useState } from "react";
import { Cloud, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AgentDownloadButton } from "@/components/admin/AgentDownloadButton";

const SETTING_KEY = "cloud_backup_config";

/** Configuração usada para pré-preencher o .env do agente de backup em nuvem. */
export interface CloudBackupSettings {
  googleClientId: string;
  googleClientSecret: string;
  msClientId: string;
  msTenantId: string;
  backupDir: string;
  remoteDir: string;
  provider: string;
  exclude: string;
}

const EMPTY: CloudBackupSettings = {
  googleClientId: "",
  googleClientSecret: "",
  msClientId: "",
  msTenantId: "common",
  backupDir: "",
  remoteDir: "Backups",
  provider: "google",
  exclude: "node_modules,.git",
};

export interface CloudBackupConfigProps {
  /** Agentes cadastrados (nome + chave de API) para gerar pacotes individuais. */
  agents: { id: string; name: string; api_key: string }[];
  /** Endpoint da função de telemetria (backup-report). */
  endpoint: string;
}

/** Monta o conteúdo do arquivo .env entregue dentro do ZIP. */
function buildEnv(cfg: CloudBackupSettings, endpoint: string, agentKey: string, agentName: string): string {
  return [
    `# Configuração gerada automaticamente pelo painel para "${agentName}".`,
    "# Não compartilhe este arquivo: ele contém credenciais.",
    "",
    "# --- Google Drive ---",
    `GOOGLE_CLIENT_ID=${cfg.googleClientId}`,
    `GOOGLE_CLIENT_SECRET=${cfg.googleClientSecret}`,
    "",
    "# --- OneDrive / Microsoft Graph ---",
    `MS_CLIENT_ID=${cfg.msClientId}`,
    `MS_TENANT_ID=${cfg.msTenantId || "common"}`,
    "",
    "# --- Backup ---",
    `BACKUP_DIR=${cfg.backupDir}`,
    `BACKUP_PROVIDER=${cfg.provider || "google"}`,
    `BACKUP_REMOTE_DIR=${cfg.remoteDir || "Backups"}`,
    "BACKUP_CONFLICT=overwrite",
    `BACKUP_EXCLUDE=${cfg.exclude}`,
    "",
    "# --- Telemetria (painel) ---",
    `BACKUP_API_URL=${endpoint}`,
    `BACKUP_API_KEY=${agentKey}`,
    "",
    "LOG_LEVEL=info",
    "OAUTH_PORT=53682",
    "",
  ].join("\r\n");
}

/** Atalho .cmd que pergunta quais pastas serão salvas e grava no .env. */
function buildConfigCmd(): string {
  return [
    "@echo off",
    'cd /d "%~dp0"',
    "echo Passo 1 de 2: escolha as pastas que serao salvas no backup.",
    "node cloud-backup.js config",
    "pause",
    "",
  ].join("\r\n");
}

/** Atalho .cmd que autoriza o Google Drive uma única vez. */
function buildAuthCmd(): string {
  return [
    "@echo off",
    'cd /d "%~dp0"',
    "echo Passo 2 de 2: autorizacao do Google Drive - uma unica vez.",
    "node cloud-backup.js auth --provider google",
    "pause",
    "",
  ].join("\r\n");
}

/** Atalho .cmd que executa o backup imediatamente. */
function buildRunCmd(): string {
  return ["@echo off", 'cd /d "%~dp0"', "node cloud-backup.js run", "pause", ""].join("\r\n");
}

export function CloudBackupConfig({ agents, endpoint }: CloudBackupConfigProps) {
  const [cfg, setCfg] = useState<CloudBackupSettings>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", SETTING_KEY)
        .maybeSingle();
      if (!cancelled) {
        if (!error && data?.value) {
          try {
            setCfg({ ...EMPTY, ...(JSON.parse(data.value) as Partial<CloudBackupSettings>) });
          } catch {
            // Valor inválido no banco: mantém os padrões.
          }
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ready = useMemo(
    () => Boolean(cfg.googleClientId && cfg.googleClientSecret && cfg.backupDir),
    [cfg.googleClientId, cfg.googleClientSecret, cfg.backupDir],
  );

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("system_settings")
      .upsert(
        {
          key: SETTING_KEY,
          value: JSON.stringify(cfg),
          description: "Credenciais e padrões do agente de backup em nuvem",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar", { description: error.message });
      return;
    }
    toast.success("Configuração salva");
  };

  const field = (
    id: keyof CloudBackupSettings,
    label: string,
    placeholder: string,
    type: "text" | "password" = "text",
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={cfg[id]}
        placeholder={placeholder}
        onChange={(e) => setCfg((prev) => ({ ...prev, [id]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-primary" /> Credenciais e padrões
          </CardTitle>
          <CardDescription>
            Preenchidas uma única vez. Todo pacote baixado já vem com estes dados dentro do arquivo .env.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {field("googleClientId", "Google Client ID", "xxxx.apps.googleusercontent.com")}
                {field("googleClientSecret", "Google Client Secret", "GOCSPX-...", "password")}
                {field("msClientId", "OneDrive Client ID (opcional)", "00000000-0000-0000-0000-000000000000")}
                {field("msTenantId", "OneDrive Tenant", "common")}
                {field("backupDir", "Pasta de origem no servidor", "C:\\dados\\importante")}
                {field("remoteDir", "Pasta de destino na nuvem", "Backups/Servidor01")}
                {field("provider", "Destino (google, onedrive ou both)", "google")}
                {field("exclude", "Ignorar caminhos", "node_modules,.git")}
              </div>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar configuração
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pacotes prontos por agente</CardTitle>
          <CardDescription>
            Cada pacote já vem com credenciais, pastas e chave do agente. Basta extrair, executar{" "}
            <code>autorizar-google.cmd</code> uma vez e depois <code>instalar.cmd</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!ready && (
            <p className="text-sm text-destructive">
              Informe ao menos o Client ID, o Client Secret do Google e a pasta de origem antes de baixar.
            </p>
          )}
          {agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Cadastre um agente abaixo para gerar o pacote já configurado.
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {agents.map((agent) => (
                <AgentDownloadButton
                  key={agent.id}
                  agent="cloudBackup"
                  label={`Baixar pacote — ${agent.name}`}
                  disabled={!ready}
                  options={{
                    zipName: `agente-backup-nuvem-${agent.name.replace(/[^a-zA-Z0-9-_]+/g, "-").toLowerCase()}`,
                    extraFiles: {
                      ".env": buildEnv(cfg, endpoint, agent.api_key, agent.name),
                      "autorizar-google.cmd": buildAuthCmd(),
                      "executar-backup.cmd": buildRunCmd(),
                    },
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
