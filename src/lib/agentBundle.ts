import JSZip from "jszip";

/**
 * Empacotamento de agentes coletores.
 *
 * Cada agente é distribuído como um arquivo ZIP contendo:
 *  - o script coletor principal;
 *  - o instalador de serviço do Windows (instalar-agente-servico.ps1);
 *  - um LEIA-ME.txt pré-configurado com URL/chave do backend;
 *  - um atalho `instalar.cmd` que executa o instalador já com os parâmetros.
 */

export interface AgentBundleDefinition {
  /** Identificador interno do agente. */
  id: string;
  /** Nome exibido ao usuário. */
  label: string;
  /** Nome do arquivo ZIP gerado (sem extensão). */
  zipName: string;
  /** Arquivos públicos incluídos no pacote (caminhos a partir da raiz do site). */
  files: string[];
  /** Script principal executado pelo instalador (deve constar em `files`). */
  mainScript?: string;
  /** Runtime necessário — usado apenas no texto do LEIA-ME. */
  runtime?: "node" | "powershell" | "python";
  /** Instruções extras específicas do agente. */
  notes?: string[];
  /** Quando falso, o instalador de serviço não é incluído. */
  includeInstaller?: boolean;
}

const INSTALLER = "/instalar-agente-servico.ps1";

export const AGENT_BUNDLES: Record<string, AgentBundleDefinition> = {
  proxmox: {
    id: "proxmox",
    label: "Coletor Proxmox VE",
    zipName: "agente-proxmox",
    files: ["/proxmox-collector.js", "/proxmox-net-collector.sh"],
    mainScript: "proxmox-collector.js",
    runtime: "node",
    notes: [
      "Configure as credenciais dos nós Proxmox no painel antes de iniciar o coletor.",
      "Certificados autoassinados são aceitos por padrão; use --seguro para exigir certificado válido.",
      "O coletor principal consulta velocidade atual e volume das últimas 24 horas diretamente pela API do Proxmox.",
      "proxmox-net-collector.sh é opcional e pode ser executado no host para obter contadores exatos por interface pela mesma fonte do nload.",
    ],
  },
  vmware: {
    id: "vmware",
    label: "Coletor VMware",
    zipName: "agente-vmware",
    files: ["/vmware-collector.js"],
    mainScript: "vmware-collector.js",
    runtime: "node",
  },
  ilo: {
    id: "ilo",
    label: "Coletor HP iLO4",
    zipName: "agente-hp-ilo4",
    files: ["/ilo-collector.js"],
    mainScript: "ilo-collector.js",
    runtime: "node",
    notes: ["Use um usuário iLO somente leitura para a coleta."],
  },
  idrac: {
    id: "idrac",
    label: "Coletor Dell iDRAC9",
    zipName: "agente-dell-idrac9",
    files: ["/idrac-collector.js"],
    mainScript: "idrac-collector.js",
    runtime: "node",
    notes: [
      "Cadastre o servidor no painel com o fabricante Dell (iDRAC9) antes de iniciar a coleta.",
      "Use um usuario do iDRAC com funcao Read Only.",
      "Habilite a API Redfish em iDRAC Settings > Services (habilitada por padrao no iDRAC9).",
    ],
  },
  windows: {
    id: "windows",
    label: "Coletor Windows Server",
    zipName: "agente-windows-server",
    files: ["/windows-server-collector.ps1", "/windows-server-agent.ps1"],
    mainScript: "windows-server-collector.ps1",
    runtime: "powershell",
  },
  dvr: {
    id: "dvr",
    label: "Coletor DVR Intelbras",
    zipName: "agente-dvr",
    files: ["/dvr-collector.py", "/dvr-vps-collector.js", "/simplay-importer.js"],
    mainScript: "dvr-vps-collector.js",
    runtime: "node",
    notes: [
      "dvr-collector.py é a alternativa em Python (requer Python 3.8+ e a biblioteca requests).",
      "simplay-importer.js importa a base SQLite do SIMPlay para o painel.",
    ],
  },
  cloudBackup: {
    id: "cloudBackup",
    label: "Agente de Backup em Nuvem",
    zipName: "agente-backup-nuvem",
    files: ["/cloud-backup.js", "/cloud-backup-README.md"],
    mainScript: "cloud-backup.js",
    runtime: "node",
  },
  localBackup: {
    id: "localBackup",
    label: "Agente de Backup Local/Rede",
    zipName: "agente-backup-local",
    files: ["/local-backup.js"],
    mainScript: "local-backup.js",
    runtime: "node",
    notes: [
      "Use --vigiar para manter o agente monitorando a origem e copiando alterações imediatamente.",
    ],
  },
};

export interface BundleOptions {
  /** URL do backend (Supabase). */
  url?: string;
  /** Chave pública (anon key). */
  key?: string;
  /** Intervalo de coleta em segundos. */
  interval?: number;
  /** Arquivos adicionais gerados dinamicamente: nome -> conteúdo. */
  extraFiles?: Record<string, string>;
  /** Sobrescreve o nome do ZIP. */
  zipName?: string;
}

/** Baixa um arquivo público do próprio site e devolve o conteúdo bruto. */
async function fetchPublicFile(path: string): Promise<ArrayBuffer> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Não foi possível baixar "${path}" (HTTP ${response.status}).`);
  }
  return await response.arrayBuffer();
}

function buildReadme(def: AgentBundleDefinition, opts: BundleOptions): string {
  const url = opts.url ?? "<URL_DO_BACKEND>";
  const key = opts.key ?? "<CHAVE_PUBLICA>";
  const interval = opts.interval ?? 300;
  const main = def.mainScript ?? def.files[0].replace(/^\//, "");
  const isNode = def.runtime !== "powershell" && def.runtime !== "python";

  const lines: string[] = [
    `${def.label}`,
    "=".repeat(def.label.length),
    "",
    "CONTEUDO DO PACOTE",
    ...def.files.map((f) => `  - ${f.replace(/^\//, "")}`),
    ...(def.includeInstaller === false ? [] : ["  - instalar-agente-servico.ps1 (instalador de servico do Windows)"]),
    ...(def.includeInstaller === false ? [] : ["  - instalar.cmd (atalho ja configurado)"]),
    "  - LEIA-ME.txt (este arquivo)",
    "",
    "REQUISITOS",
    isNode
      ? "  - Node.js 18 ou superior instalado (https://nodejs.org)"
      : def.runtime === "python"
        ? "  - Python 3.8 ou superior"
        : "  - Windows PowerShell 5.1 ou superior",
    "",
    "EXECUCAO MANUAL",
    isNode
      ? `  node ${main} --url "${url}" --key "${key}" --intervalo ${interval}`
      : def.runtime === "python"
        ? `  python ${main} --url "${url}" --key "${key}" --intervalo ${interval}`
        : `  powershell -ExecutionPolicy Bypass -File .\\${main} -Url "${url}" -Key "${key}"`,
    "",
  ];

  if (def.includeInstaller !== false) {
    lines.push(
      "INSTALACAO COMO SERVICO DO WINDOWS",
      "  1. Extraia todos os arquivos deste ZIP na pasta definitiva (ex.: C:\\agentes\\" + def.zipName + ")",
      "  2. Abra o PowerShell como Administrador nessa pasta",
      "  3. Execute: Unblock-File .\\instalar-agente-servico.ps1",
      "  4. Execute: .\\instalar.cmd  (ou o comando abaixo)",
      `     .\\instalar-agente-servico.ps1 -Script ${main} -Url "${url}" -Key "${key}" -Intervalo ${interval}`,
      "",
      "  Desinstalar: .\\instalar-agente-servico.ps1 -Desinstalar",
      "  Logs do servico: .\\logs\\",
      "",
    );
  }

  if (def.notes?.length) {
    lines.push("OBSERVACOES", ...def.notes.map((n) => `  - ${n}`), "");
  }

  lines.push(`Gerado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  return lines.join("\r\n");
}

function buildInstallerShortcut(def: AgentBundleDefinition, opts: BundleOptions): string {
  const main = def.mainScript ?? def.files[0].replace(/^\//, "");
  const url = opts.url ?? "";
  const key = opts.key ?? "";
  const interval = opts.interval ?? 300;
  return [
    "@echo off",
    "REM Instala o agente como servico do Windows a partir desta pasta.",
    "cd /d \"%~dp0\"",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File '.\\instalar-agente-servico.ps1'; & '.\\instalar-agente-servico.ps1' -Script '${main}' -Url '${url}' -Key '${key}' -Intervalo ${interval}"`,
    "pause",
    "",
  ].join("\r\n");
}

/**
 * Gera e dispara o download do ZIP completo de um agente.
 * Lança erro (com mensagem em pt-BR) quando algum arquivo não puder ser obtido.
 */
export async function downloadAgentBundle(
  agent: AgentBundleDefinition | string,
  opts: BundleOptions = {},
): Promise<void> {
  const def = typeof agent === "string" ? AGENT_BUNDLES[agent] : agent;
  if (!def) {
    throw new Error(`Agente desconhecido: ${String(agent)}`);
  }

  const zip = new JSZip();
  const paths = [...def.files, ...(def.includeInstaller === false ? [] : [INSTALLER])];

  const downloads = await Promise.all(
    paths.map(async (path) => ({ path, data: await fetchPublicFile(path) })),
  );

  for (const { path, data } of downloads) {
    zip.file(path.replace(/^\//, ""), data);
  }

  zip.file("LEIA-ME.txt", buildReadme(def, opts));

  if (def.includeInstaller !== false) {
    zip.file("instalar.cmd", buildInstallerShortcut(def, opts));
  }

  for (const [name, content] of Object.entries(opts.extraFiles ?? {})) {
    zip.file(name, content);
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${opts.zipName ?? def.zipName}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Libera a memória após o navegador iniciar o download.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }
}
