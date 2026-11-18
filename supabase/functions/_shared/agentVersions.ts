/**
 * Espelho de src/lib/agentVersions.ts para uso nas Edge Functions.
 * Mantenha os dois arquivos sincronizados ao publicar um novo coletor.
 */

export const AGENT_VERSIONS: Record<string, { label: string; version: string }> = {
  "mororo-agent": { label: "Mororo.Tech Agent", version: "1.0.0" },
  proxmox: { label: "Coletor Proxmox VE", version: "1.2.0" },
  vmware: { label: "Coletor VMware", version: "1.2.0" },
  ilo: { label: "Coletor HP iLO4", version: "1.2.0" },
  idrac: { label: "Coletor Dell iDRAC9", version: "1.2.0" },
  windows: { label: "Coletor Windows Server", version: "2.0.0" },
  linux: { label: "Coletor Linux", version: "1.0.0" },
  sqlserver: { label: "Coletor SQL Server", version: "1.0.0" },
  mikrotik: { label: "Coletor MikroTik/SNMP", version: "1.1.0" },
  "backup-nuvem": { label: "Agente de Backup em Nuvem", version: "1.1.0" },
  "backup-local": { label: "Agente de Backup Local/Rede", version: "1.1.0" },
  provisioning: { label: "Agente de Criação de Usuários no AD", version: "1.4.0" },
};

/** true quando `atual` é anterior a `esperada` (ou desconhecida). */
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
