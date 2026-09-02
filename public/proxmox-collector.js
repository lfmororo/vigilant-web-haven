#!/usr/bin/env node
/**
 * Coletor Proxmox VE (API REST HTTPS) — Node.js sem dependências externas.
 *
 * Busca os nós cadastrados no painel (type: "list-proxmox"), consulta a API do
 * Proxmox de cada um e envia o snapshot (nó + VMs/containers) de volta para a
 * Edge Function `server-monitor-ingest`.
 *
 * Uso:
 *   node proxmox-collector.js --url "https://<projeto>.supabase.co" --key "ANON_KEY" [--intervalo 300] [--uma-vez] [--seguro]
 *
 * Autenticação suportada no Proxmox:
 *   - API Token (recomendado): usuário `root@pam` + token name + secret
 *     Header: Authorization: PVEAPIToken=root@pam!monitor=<secret>
 *   - Senha (fallback): ticket via /api2/json/access/ticket
 */

const https = require("https");
const { URL } = require("url");

// ---------------------------------------------------------------- argumentos
function parseArgs(argv) {
  const args = { intervalo: 300, umaVez: false, inseguro: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--key") args.key = argv[++i];
    else if (a === "--intervalo") args.intervalo = Number(argv[++i]) || 300;
    else if (a === "--uma-vez" || a === "--once") args.umaVez = true;
    else if (a === "--seguro") args.inseguro = false;
    else if (a === "--inseguro") args.inseguro = true;
  }
  return args;
}

const ARGS = parseArgs(process.argv);
if (!ARGS.url || !ARGS.key) {
  console.error("Uso: node proxmox-collector.js --url <SUPABASE_URL> --key <ANON_KEY> [--intervalo 300] [--uma-vez] [--seguro]");
  process.exit(1);
}

const INGEST_URL = `${ARGS.url.replace(/\/$/, "")}/functions/v1/server-monitor-ingest`;

// ------------------------------------------------------------------ helpers
const GB = 1024 ** 3;
const toGb = (bytes) => (typeof bytes === "number" && bytes > 0 ? Number((bytes / GB).toFixed(2)) : null);
const pct = (used, total) =>
  typeof used === "number" && typeof total === "number" && total > 0
    ? Number(((used / total) * 100).toFixed(1))
    : null;

/** Requisição HTTPS genérica que devolve JSON (ou lança erro descritivo). */
function httpJson(urlStr, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: options.method || "GET",
        headers: options.headers || {},
        rejectUnauthorized: options.rejectUnauthorized !== false,
        timeout: options.timeout || 20000,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
            return;
          }
          try {
            resolve(data ? JSON.parse(data) : {});
          } catch {
            reject(new Error(`Resposta inválida (não-JSON): ${data.substring(0, 120)}`));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timeout na requisição")));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * Normaliza as credenciais informadas no painel.
 * Aceita variações comuns de digitação:
 *  - usuário sem realm ("root")            -> "root@pam"
 *  - token colado inteiro ("root@pam!monitor") -> usuário + token separados
 *  - token com prefixo "PVEAPIToken=" ou "!"
 */
function normalizarCredenciais(node) {
  let username = String(node.username || "root@pam").trim();
  let tokenName = String(node.token_name || "").trim().replace(/^PVEAPIToken=/i, "");

  if (tokenName.includes("!")) {
    const [u, t] = tokenName.split("!");
    if (u) username = u.trim();
    tokenName = (t || "").trim();
  }
  if (username.includes("!")) {
    const [u, t] = username.split("!");
    username = u.trim();
    if (!tokenName && t) tokenName = t.trim();
  }
  if (!username.includes("@")) username = `${username}@pam`;

  const tokenSecret = String(node.token_secret || "").trim();
  return { username, tokenName, tokenSecret };
}

/** Autentica por senha (ticket) e devolve os headers correspondentes. */
async function autenticarPorSenha(base, username, password) {
  const form = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  const resp = await httpJson(
    `${base}/api2/json/access/ticket`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(form) },
      rejectUnauthorized: !ARGS.inseguro,
    },
    form,
  );
  const ticket = resp?.data?.ticket;
  if (!ticket) throw new Error("Nao foi possivel obter o ticket de autenticacao.");
  return { Cookie: `PVEAuthCookie=${ticket}` };
}

/** Monta o cabeçalho de autenticação do Proxmox (token ou ticket por senha). */
async function autenticar(node) {
  const base = `https://${node.host}:${node.port || 8006}`;
  const { username, tokenName, tokenSecret } = normalizarCredenciais(node);
  const usarToken = node.auth_mode !== "password" && tokenName && tokenSecret;

  if (usarToken) {
    const headers = { Authorization: `PVEAPIToken=${username}!${tokenName}=${tokenSecret}` };
    try {
      // Valida o token antes de seguir: a API responde 401 quando invalido.
      await httpJson(`${base}/api2/json/version`, { headers, rejectUnauthorized: !ARGS.inseguro });
      return { base, headers };
    } catch (err) {
      const auth401 = /HTTP 401/.test(err.message);
      if (!auth401) throw err;
      if (node.password) {
        // Fallback automatico: tenta usuario/senha quando o token falha.
        return { base, headers: await autenticarPorSenha(base, username, node.password) };
      }
      throw new Error(
        `Token rejeitado pelo Proxmox (401) para ${username}!${tokenName}. ` +
          "Verifique: 1) o Token ID existe em Datacenter > Permissions > API Tokens; " +
          "2) o Secret esta correto (so aparece na criacao); " +
          "3) se 'Privilege Separation' estiver marcado, conceda PVEAuditor em / ao token.",
      );
    }
  }

  if (!node.password) throw new Error("Sem token nem senha configurada para autenticacao.");
  return { base, headers: await autenticarPorSenha(base, username, node.password) };
}


/** GET autenticado na API do Proxmox; devolve `data` já desembrulhado. */
async function api(auth, path) {
  const resp = await httpJson(`${auth.base}/api2/json${path}`, {
    headers: auth.headers,
    rejectUnauthorized: !ARGS.inseguro,
  });
  return resp?.data;
}

// ---------------------------------------------------------------- coleta
async function coletarNo(node) {
  const auth = await autenticar(node);

  // Descobre o nome do nó no cluster quando não informado no cadastro.
  const nodesList = (await api(auth, "/nodes")) || [];
  const nodeName =
    node.node_name || nodesList.find((n) => n.status === "online")?.node || nodesList[0]?.node;
  if (!nodeName) throw new Error("Nenhum nó encontrado na API do Proxmox.");

  const status = (await api(auth, `/nodes/${nodeName}/status`)) || {};
  const version = (await api(auth, "/version")) || {};

  const ramTotal = status?.memory?.total;
  const ramUsed = status?.memory?.used;
  const diskTotal = status?.rootfs?.total;
  const diskUsed = status?.rootfs?.used;

  const info = {
    node_name: nodeName,
    pve_version: version?.version ? `PVE ${version.version}` : null,
    cpu_model: status?.cpuinfo?.model || null,
    cpu_cores: status?.cpuinfo?.cpus ?? null,
    cpu_usage_pct: typeof status?.cpu === "number" ? Number((status.cpu * 100).toFixed(1)) : null,
    ram_total_gb: toGb(ramTotal),
    ram_used_gb: toGb(ramUsed),
    ram_usage_pct: pct(ramUsed, ramTotal),
    swap_total_gb: toGb(status?.swap?.total),
    swap_used_gb: toGb(status?.swap?.used),
    disk_total_gb: toGb(diskTotal),
    disk_used_gb: toGb(diskUsed),
    disk_usage_pct: pct(diskUsed, diskTotal),
    load_avg: status?.loadavg?.[0] != null ? Number(status.loadavg[0]) : null,
    uptime_seconds: status?.uptime ?? null,
  };

  // Armazenamentos do nó (datastores equivalentes ao VMware).
  const storagesRaw = (await api(auth, `/nodes/${nodeName}/storage`)) || [];
  const storages = storagesRaw
    .filter((s) => s.active !== 0)
    .map((s) => ({
      name: s.storage,
      type: s.type,
      total_gb: toGb(s.total),
      used_gb: toGb(s.used),
      free_gb: toGb(s.avail),
      usage_pct: pct(s.used, s.total),
    }));

  // VMs (qemu) e containers (lxc).
  const qemu = (await api(auth, `/nodes/${nodeName}/qemu`)) || [];
  const lxc = (await api(auth, `/nodes/${nodeName}/lxc`)) || [];

  const guests = [...qemu.map((g) => ({ ...g, _type: "qemu" })), ...lxc.map((g) => ({ ...g, _type: "lxc" }))].map(
    (g) => ({
      vmid: g.vmid,
      name: g.name || `VM ${g.vmid}`,
      guest_type: g._type,
      status: g.status || "unknown",
      cpu_count: g.cpus ?? null,
      cpu_usage_pct: typeof g.cpu === "number" ? Number((g.cpu * 100).toFixed(1)) : null,
      ram_total_gb: toGb(g.maxmem),
      ram_used_gb: toGb(g.mem),
      ram_usage_pct: pct(g.mem, g.maxmem),
      disk_total_gb: toGb(g.maxdisk),
      disk_used_gb: toGb(g.disk),
      uptime_seconds: g.uptime ?? null,
      tags: g.tags || null,
    }),
  );

  return { info, storages, guests };
}

// ---------------------------------------------------------------- ingestão
async function enviar(payload) {
  const body = JSON.stringify(payload);
  return httpJson(
    INGEST_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ARGS.key,
        Authorization: `Bearer ${ARGS.key}`,
        "Content-Length": Buffer.byteLength(body),
      },
      rejectUnauthorized: true,
    },
    body,
  );
}

async function ciclo() {
  let nodes = [];
  try {
    nodes = await enviar({ type: "list-proxmox" });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Falha ao listar nós Proxmox:`, err.message);
    return;
  }

  if (!Array.isArray(nodes) || nodes.length === 0) {
    console.log(`[${new Date().toISOString()}] Nenhum nó Proxmox ativo cadastrado.`);
    return;
  }

  for (const node of nodes) {
    try {
      const snapshot = await coletarNo(node);
      await enviar({ type: "proxmox", node_id: node.id, status: "online", ...snapshot });
      console.log(
        `[${new Date().toISOString()}] ${node.name}: OK — ${snapshot.guests.length} VMs/CTs, CPU ${snapshot.info.cpu_usage_pct ?? "—"}%`,
      );
    } catch (err) {
      console.error(`[${new Date().toISOString()}] ${node.name}: ERRO — ${err.message}`);
      try {
        await enviar({ type: "proxmox", node_id: node.id, status: "offline", last_error: err.message });
      } catch (e2) {
        console.error("  Falha ao reportar o erro:", e2.message);
      }
    }
  }
}

(async () => {
  if (ARGS.inseguro) console.warn("⚠️  Certificados autoassinados do Proxmox serão aceitos (use --seguro para exigir certificado válido).");
  await ciclo();
  if (ARGS.umaVez) return;
  setInterval(ciclo, ARGS.intervalo * 1000);
  console.log(`Coletor Proxmox em execução — intervalo de ${ARGS.intervalo}s.`);
})();
