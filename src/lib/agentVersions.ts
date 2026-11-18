/**
 * Versões esperadas dos agentes coletores.
 *
 * Sempre que um script coletor for alterado, incremente a versão aqui E dentro
 * do próprio script (constante `AGENT_VERSION`). O painel compara as duas e
 * avisa quando alguma instalação estiver rodando uma versão antiga.
 */

export interface AgentVersionSpec {
  /** Nome exibido ao usuário. */
  label: string;
  /** Versão atual publicada no site. */
  version: string;
  /** Pacote correspondente em AGENT_BUNDLES (para o botão de download). */
  bundle?: string;
}

export const AGENT_VERSIONS: Record<string, AgentVersionSpec> = {
  "mororo-agent": { label: "Mororo.Tech Agent", version: "1.0.0" },
  proxmox: { label: "Coletor Proxmox VE", version: "1.2.0", bundle: "proxmox" },
  vmware: { label: "Coletor VMware", version: "1.2.0", bundle: "vmware" },
  ilo: { label: "Coletor HP iLO4", version: "1.2.0", bundle: "ilo" },
  idrac: { label: "Coletor Dell iDRAC9", version: "1.2.0", bundle: "idrac" },
  windows: { label: "Coletor Windows Server", version: "2.0.0", bundle: "windows" },
  linux: { label: "Coletor Linux", version: "1.0.0" },
  sqlserver: { label: "Coletor SQL Server", version: "1.0.0" },
  mikrotik: { label: "Coletor MikroTik/SNMP", version: "1.1.0" },
  "backup-nuvem": { label: "Agente de Backup em Nuvem", version: "1.1.0", bundle: "cloudBackup" },
  "backup-local": { label: "Agente de Backup Local/Rede", version: "1.1.0", bundle: "localBackup" },
  provisioning: { label: "Agente de Criação de Usuários no AD", version: "1.4.0", bundle: "provisioning" },
};

/** Compara versões no formato `x.y.z`. Devolve true quando `atual` é menor que `esperada`. */
export function isOutdated(atual: string | null | undefined, esperada: string): boolean {
  if (!atual) return true;
  const a = String(atual).split(".").map((n) => parseInt(n, 10) || 0);
  const b = esperada.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x < y) return true;
    if (x > y) return false;
  }
  return false;
}
