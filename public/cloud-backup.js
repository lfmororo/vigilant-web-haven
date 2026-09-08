#!/usr/bin/env node
/**
 * ============================================================================
 *  Cloud Backup — Mororo.Tech
 *  Copia uma pasta local para OneDrive (Microsoft Graph) e/ou Google Drive.
 *
 *  Instalação:
 *    npm init -y
 *    npm install   (instala googleapis e @azure/msal-node, necessários apenas ao acessar a nuvem)
 *
 *  Autenticação (uma vez por provedor):
 *    node cloud-backup.js auth --provider google
 *    node cloud-backup.js auth --provider onedrive
 *
 *  Backup:
 *    node cloud-backup.js run --dir /caminho/local --provider both
 *
 *  Agendamento (cron Linux, todo dia às 02:00):
 *    0 2 * * * cd /opt/backup && /usr/bin/node cloud-backup.js run >> backup.log 2>&1
 * ============================================================================
 */

"use strict";

const fs = require("fs");

// Carrega variáveis de um arquivo .env local sem depender do pacote dotenv.
function loadEnv(filePath = ".env") {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\"/g, '"');
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env é opcional; variáveis já presentes no ambiente prevalecem.
  }
}

loadEnv();

const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const http = require("http");
const crypto = require("crypto");
const readline = require("readline");
const { URL } = require("url");

// Bibliotecas de nuvem são carregadas sob demanda (lazy) para que os comandos
// que não acessam a nuvem (config, status, --help) funcionem sem npm install.
function loadCloudDeps(provider) {
  try {
    if (provider === "google") return { google: require("googleapis").google };
    return { PublicClientApplication: require("@azure/msal-node").PublicClientApplication };
  } catch {
    throw new Error(
      "Dependências não instaladas. Execute 'instalar.cmd' (ou 'npm install') nesta pasta e tente novamente."
    );
  }
}

/** Detecção simples de Content-Type por extensão (substitui mime-types). */
const MIME_MAP = {
  ".txt": "text/plain", ".csv": "text/csv", ".json": "application/json",
  ".pdf": "application/pdf", ".zip": "application/zip", ".gz": "application/gzip",
  ".bak": "application/octet-stream", ".sql": "application/sql",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".mp4": "video/mp4", ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const mime = { lookup: (p) => MIME_MAP[path.extname(p).toLowerCase()] || null };

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

/** Diretório onde tokens/estado são persistidos (permissão 0600). */
const STATE_DIR = process.env.BACKUP_STATE_DIR || path.join(os.homedir(), ".cloud-backup");
const TOKEN_FILE = path.join(STATE_DIR, "tokens.json");
const MANIFEST_FILE = path.join(STATE_DIR, "manifest.json");

/** Escopos mínimos necessários. */
const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const MS_SCOPES = ["Files.ReadWrite", "offline_access"];

/** Porta local usada no fluxo OAuth (loopback redirect). */
const OAUTH_PORT = Number(process.env.OAUTH_PORT || 53682);
const OAUTH_REDIRECT = `http://localhost:${OAUTH_PORT}/callback`;

/** Uploads acima deste tamanho usam sessão resumível (chunked). */
const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024; // 4 MB
const CHUNK_SIZE = 5 * 1024 * 1024; // múltiplo de 320 KiB exigido pelo Graph

// ============================================================================
// LOGGER
// ============================================================================

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const LOG_LEVEL = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

/**
 * Log estruturado com timestamp ISO. Nunca imprime segredos.
 * @param {"debug"|"info"|"warn"|"error"} level
 * @param {string} message
 * @param {Record<string, unknown>} [meta]
 */
function log(level, message, meta) {
  if (LEVELS[level] < LOG_LEVEL) return;
  const icon = { debug: "·", info: "→", warn: "⚠", error: "✖" }[level];
  const suffix = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${new Date().toISOString()}] ${icon} ${message}${suffix}`;
  (level === "error" ? console.error : console.log)(line);
}

// ============================================================================
// PERSISTÊNCIA SEGURA DE TOKENS
// ============================================================================

async function ensureStateDir() {
  await fsp.mkdir(STATE_DIR, { recursive: true, mode: 0o700 });
}

/** @returns {Promise<Record<string, any>>} */
async function readTokens() {
  try {
    const raw = await fsp.readFile(TOKEN_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw new Error(`Falha ao ler ${TOKEN_FILE}: ${err.message}`);
  }
}

/**
 * Grava tokens com permissão restrita (somente o dono lê).
 * @param {string} provider
 * @param {Record<string, unknown>} data
 */
async function writeTokens(provider, data) {
  await ensureStateDir();
  const all = await readTokens();
  all[provider] = data;
  await fsp.writeFile(TOKEN_FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
  await fsp.chmod(TOKEN_FILE, 0o600).catch(() => {});
}

// ============================================================================
// MANIFESTO (evita reenviar arquivos idênticos)
// ============================================================================

async function readManifest() {
  try {
    return JSON.parse(await fsp.readFile(MANIFEST_FILE, "utf8"));
  } catch {
    return {};
  }
}

async function writeManifest(manifest) {
  await ensureStateDir();
  await fsp.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2), { mode: 0o600 });
}

/** Hash rápido do arquivo para detectar mudanças. */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (c) => hash.update(c));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

// ============================================================================
// UTILITÁRIOS
// ============================================================================

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}. Veja o README.`);
  }
  return value.trim();
}

/**
 * Percorre recursivamente um diretório retornando caminhos relativos.
 * @param {string} rootDir
 * @param {string[]} excludes globs simples (substring match)
 * @returns {Promise<string[]>}
 */
async function walkDir(rootDir, excludes = []) {
  /** @type {string[]} */
  const files = [];

  async function recurse(current) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = path.relative(rootDir, abs);
      if (excludes.some((ex) => rel.includes(ex))) {
        log("debug", "Ignorado por exclusão", { rel });
        continue;
      }
      if (entry.isDirectory()) {
        await recurse(abs);
      } else if (entry.isFile()) {
        files.push(rel);
      }
    }
  }

  await recurse(rootDir);
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(2)} ${units[i]}`;
}

/** Retenta uma operação com backoff exponencial. */
async function withRetry(label, fn, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const status = err?.response?.status || err?.statusCode;
      // 4xx (exceto 408/429) são erros permanentes — não adianta retentar.
      if (status && status >= 400 && status < 500 && status !== 408 && status !== 429) {
        throw err;
      }
      const delay = Math.min(30000, 1000 * 2 ** (i - 1));
      log("warn", `${label} falhou (tentativa ${i}/${attempts}), aguardando ${delay}ms`, {
        error: err.message,
      });
      if (i < attempts) await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** Abre um servidor local temporário e captura o código OAuth. */
function waitForOAuthCode(expectedState) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, OAUTH_REDIRECT);
        if (url.pathname !== "/callback") {
          res.writeHead(404).end("Not found");
          return;
        }
        const error = url.searchParams.get("error");
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          `<html><body style="font-family:sans-serif;background:#0b1220;color:#e2e8f0;padding:40px">
             <h2>${error ? "Falha na autorização" : "Autorização concluída"}</h2>
             <p>${error ? error : "Pode fechar esta janela e voltar ao terminal."}</p>
           </body></html>`
        );

        server.close();
        if (error) return reject(new Error(`OAuth negado: ${error}`));
        if (expectedState && state !== expectedState) {
          return reject(new Error("State OAuth inválido (possível CSRF). Abortado."));
        }
        if (!code) return reject(new Error("Callback sem 'code'."));
        resolve(code);
      } catch (err) {
        reject(err);
      }
    });

    server.on("error", reject);
    server.listen(OAUTH_PORT, "127.0.0.1", () => {
      log("info", `Aguardando callback OAuth em ${OAUTH_REDIRECT}`);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("Tempo esgotado aguardando autorização (5 min)."));
    }, 5 * 60 * 1000).unref();
  });
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

// ============================================================================
// PROVEDOR: GOOGLE DRIVE
// ============================================================================

const GoogleDrive = {
  id: "google",
  label: "Google Drive",

  /** Troca/renova tokens direto no endpoint OAuth do Google (sem SDK). */
  async tokenRequest(params) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const body = await res.text();
    if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${body.slice(0, 400)}`);
    return JSON.parse(body);
  },

  /** Fluxo interativo de consentimento (loopback redirect). */
  async authorize() {
    const clientId = requireEnv("GOOGLE_CLIENT_ID");
    const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
    const state = crypto.randomBytes(16).toString("hex");
    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: OAUTH_REDIRECT,
        response_type: "code",
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        scope: GOOGLE_SCOPES.join(" "),
        state,
      }).toString();

    console.log("\nAbra esta URL no navegador para autorizar o Google Drive:\n");
    console.log(authUrl + "\n");

    const code = await waitForOAuthCode(state);
    const tokens = await this.tokenRequest({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: OAUTH_REDIRECT,
      grant_type: "authorization_code",
    });
    if (!tokens.refresh_token) {
      throw new Error("Google não retornou refresh_token. Revogue o acesso e tente novamente.");
    }
    await writeTokens("google", { refresh_token: tokens.refresh_token });
    log("info", "Google Drive autorizado com sucesso.");
  },

  /** Cliente leve: guarda o access_token e faz chamadas REST à API do Drive. */
  async getClient() {
    const saved = (await readTokens()).google;
    if (!saved?.refresh_token) {
      throw new Error("Google Drive não autorizado. Rode: node cloud-backup.js auth --provider google");
    }
    const tokens = await this.tokenRequest({
      client_id: requireEnv("GOOGLE_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    });
    if (!tokens.access_token) throw new Error("Google não retornou access_token.");
    return { token: tokens.access_token };
  },

  /** Chamada genérica à API do Drive com erro explícito. */
  async api(token, url, options = {}) {
    const res = await fetch(url.startsWith("http") ? url : `https://www.googleapis.com/drive/v3${url}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = new Error(`Drive ${res.status}: ${body.slice(0, 400)}`);
      error.statusCode = res.status;
      throw error;
    }
    return res.status === 204 ? null : res.json();
  },

  /** Garante a existência da árvore de pastas e devolve o id da folha. */
  async ensureFolder(token, segments, cache) {
    let parentId = "root";
    let accumulated = "";

    for (const segment of segments) {
      accumulated = accumulated ? `${accumulated}/${segment}` : segment;
      if (cache.has(accumulated)) {
        parentId = cache.get(accumulated);
        continue;
      }

      const safeName = segment.replace(/'/g, "\\'");
      const q = `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
      const data = await this.api(
        token,
        `/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`
      );

      let folderId = data.files?.[0]?.id;
      if (!folderId) {
        const created = await this.api(token, "/files?fields=id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: segment,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentId],
          }),
        });
        folderId = created.id;
        log("debug", "Pasta criada no Google Drive", { path: accumulated });
      }

      cache.set(accumulated, folderId);
      parentId = folderId;
    }

    return parentId;
  },

  /** Upload resumível em blocos — funciona para arquivos de qualquer tamanho. */
  async resumableUpload(token, metadata, absPath, fileId) {
    const size = fs.statSync(absPath).size;
    const contentType = mime.lookup(absPath) || "application/octet-stream";
    const base = "https://www.googleapis.com/upload/drive/v3/files";
    const url = fileId
      ? `${base}/${fileId}?uploadType=resumable`
      : `${base}?uploadType=resumable`;

    const start = await fetch(url, {
      method: fileId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify(metadata),
    });
    if (!start.ok) {
      const body = await start.text().catch(() => "");
      throw new Error(`Drive upload ${start.status}: ${body.slice(0, 400)}`);
    }
    const location = start.headers.get("location");
    if (!location) throw new Error("Google Drive não devolveu a URL de upload.");

    if (size === 0) {
      const empty = await fetch(location, {
        method: "PUT",
        headers: { "Content-Length": "0" },
        body: "",
      });
      if (!empty.ok) throw new Error(`Drive upload ${empty.status}`);
      return;
    }

    const handle = fs.openSync(absPath, "r");
    try {
      let offset = 0;
      while (offset < size) {
        const length = Math.min(CHUNK_SIZE, size - offset);
        const buffer = Buffer.alloc(length);
        fs.readSync(handle, buffer, 0, length, offset);
        const res = await fetch(location, {
          method: "PUT",
          headers: {
            "Content-Length": String(length),
            "Content-Range": `bytes ${offset}-${offset + length - 1}/${size}`,
          },
          body: buffer,
        });
        if (res.status === 308) {
          offset += length;
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Drive upload ${res.status}: ${body.slice(0, 400)}`);
        }
        offset += length;
      }
    } finally {
      fs.closeSync(handle);
    }
  },

  /**
   * Envia um arquivo. `conflict`: overwrite | skip | rename
   */
  async uploadFile(ctx, relPath, absPath, conflict) {
    const token = ctx.client.token;
    const segments = [ctx.remoteRoot, ...path.dirname(relPath).split(path.sep)].filter(
      (s) => s && s !== "."
    );
    const parentId = await this.ensureFolder(token, segments, ctx.folderCache);
    const name = path.basename(relPath);
    const safeName = name.replace(/'/g, "\\'");

    const q = `name='${safeName}' and '${parentId}' in parents and trashed=false`;
    const data = await this.api(
      token,
      `/files?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`
    );
    const existingId = data.files?.[0]?.id;

    if (existingId && conflict === "skip") return "skipped";

    if (existingId && conflict === "overwrite") {
      await this.resumableUpload(token, {}, absPath, existingId);
      return "updated";
    }

    const finalName =
      existingId && conflict === "rename"
        ? `${path.parse(name).name}-${Date.now()}${path.parse(name).ext}`
        : name;

    await this.resumableUpload(token, { name: finalName, parents: [parentId] }, absPath);
    return "uploaded";
  },
};


// ============================================================================
// PROVEDOR: ONEDRIVE (Microsoft Graph)
// ============================================================================

const OneDrive = {
  id: "onedrive",
  label: "OneDrive",
  graph: "https://graph.microsoft.com/v1.0",

  authority() {
    return `https://login.microsoftonline.com/${process.env.MS_TENANT_ID || "common"}`;
  },

  async tokenRequest(params) {
    const res = await fetch(`${this.authority()}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
    });
    const body = await res.text();
    let json = {};
    try { json = JSON.parse(body); } catch { /* resposta não-JSON */ }
    if (!res.ok) {
      const err = new Error(`Microsoft OAuth ${res.status}: ${json.error || body.slice(0, 300)}`);
      err.oauthError = json.error;
      throw err;
    }
    return json;
  },

  /** Device code flow (REST puro): ideal para servidores sem navegador. */
  async authorize() {
    const clientId = requireEnv("MS_CLIENT_ID");
    const scope = MS_SCOPES.join(" ");

    const res = await fetch(`${this.authority()}/oauth2/v2.0/devicecode`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, scope }).toString(),
    });
    const device = await res.json();
    if (!res.ok) throw new Error(`Microsoft device code: ${device.error_description || res.status}`);

    console.log(`\n${device.message}\n`);

    const deadline = Date.now() + (device.expires_in || 900) * 1000;
    const interval = (device.interval || 5) * 1000;
    for (;;) {
      if (Date.now() > deadline) throw new Error("Tempo esgotado aguardando autorização da Microsoft.");
      await new Promise((r) => setTimeout(r, interval));
      try {
        const tokens = await this.tokenRequest({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: clientId,
          device_code: device.device_code,
        });
        if (!tokens.refresh_token) throw new Error("Microsoft não retornou refresh_token.");
        await writeTokens("onedrive", { refresh_token: tokens.refresh_token });
        log("info", "OneDrive autorizado com sucesso.");
        return;
      } catch (err) {
        if (err.oauthError === "authorization_pending" || err.oauthError === "slow_down") continue;
        throw err;
      }
    }
  },

  /** Obtém access token a partir do refresh token persistido. */
  async getAccessToken() {
    const saved = (await readTokens()).onedrive;
    if (!saved?.refresh_token) {
      throw new Error("OneDrive não autorizado. Rode: node cloud-backup.js auth --provider onedrive");
    }
    const tokens = await this.tokenRequest({
      grant_type: "refresh_token",
      client_id: requireEnv("MS_CLIENT_ID"),
      refresh_token: saved.refresh_token,
      scope: MS_SCOPES.join(" "),
    });
    if (tokens.refresh_token) {
      await writeTokens("onedrive", { refresh_token: tokens.refresh_token });
    }
    return tokens.access_token;
  },

  async getClient() {
    const token = await this.getAccessToken();
    return { token };
  },


  /** Chamada genérica ao Graph com tratamento de erro explícito. */
  async graphFetch(token, url, options = {}) {
    const response = await fetch(url.startsWith("http") ? url : `${this.graph}${url}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const error = new Error(`Graph ${response.status}: ${body.slice(0, 500)}`);
      error.statusCode = response.status;
      throw error;
    }
    return response.status === 204 ? null : response.json();
  },

  encodePath(remotePath) {
    return remotePath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  },

  /** Upload simples (<4MB) ou sessão resumível (>=4MB). */
  async uploadFile(ctx, relPath, absPath, conflict) {
    const token = ctx.client.token;
    const remotePath = [ctx.remoteRoot, ...relPath.split(path.sep)].filter(Boolean).join("/");
    const encoded = this.encodePath(remotePath);
    const stats = await fsp.stat(absPath);

    // Verifica existência para respeitar a política de conflito.
    let exists = false;
    try {
      await this.graphFetch(token, `/me/drive/root:/${encoded}`);
      exists = true;
    } catch (err) {
      if (err.statusCode !== 404) throw err;
    }

    if (exists && conflict === "skip") return "skipped";

    const graphConflict = conflict === "rename" ? "rename" : "replace";

    if (stats.size < LARGE_FILE_THRESHOLD) {
      const buffer = await fsp.readFile(absPath);
      await this.graphFetch(
        token,
        `/me/drive/root:/${encoded}:/content?@microsoft.graph.conflictBehavior=${graphConflict}`,
        {
          method: "PUT",
          headers: { "Content-Type": mime.lookup(absPath) || "application/octet-stream" },
          body: buffer,
        }
      );
      return exists ? "updated" : "uploaded";
    }

    // --- Upload resumível em blocos ---
    const session = await this.graphFetch(token, `/me/drive/root:/${encoded}:/createUploadSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": graphConflict } }),
    });

    const handle = await fsp.open(absPath, "r");
    try {
      let offset = 0;
      while (offset < stats.size) {
        const size = Math.min(CHUNK_SIZE, stats.size - offset);
        const buffer = Buffer.alloc(size);
        await handle.read(buffer, 0, size, offset);

        const res = await fetch(session.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(size),
            "Content-Range": `bytes ${offset}-${offset + size - 1}/${stats.size}`,
          },
          body: buffer,
        });

        if (!res.ok && res.status !== 202) {
          const body = await res.text().catch(() => "");
          throw new Error(`Chunk falhou ${res.status}: ${body.slice(0, 300)}`);
        }

        offset += size;
        log("debug", "Chunk enviado", {
          file: relPath,
          progress: `${Math.round((offset / stats.size) * 100)}%`,
        });
      }
    } finally {
      await handle.close();
    }

    return exists ? "updated" : "uploaded";
  },
};

const PROVIDERS = { google: GoogleDrive, onedrive: OneDrive };

// ============================================================================
// ORQUESTRAÇÃO DO BACKUP
// ============================================================================

/**
 * @param {{ dir: string, provider: string, remote: string, conflict: string,
 *           exclude: string[], incremental: boolean, dryRun: boolean }} options
 */

// ============================================================================
// Reporter — envia progresso para o painel (Backup em Nuvem)
// ============================================================================

// Versao deste agente. Mantenha igual a src/lib/agentVersions.ts.
const AGENT_VERSION = "1.1.0";
// Lidos dinamicamente para permitir definição via --url/--key na linha de comando
// (os parâmetros são aplicados em process.env dentro de main(), antes do backup).
function reportConfig() {
  const url = process.env.BACKUP_API_URL || "";
  const key = process.env.BACKUP_API_KEY || "";
  return { url, key, enabled: Boolean(url && key) };
}

/** Envia um evento ao painel. Nunca interrompe o backup em caso de falha. */
async function report(action, payload = {}) {
  const { url, key, enabled } = reportConfig();
  if (!enabled) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({ action, hostname: os.hostname(), agent_version: AGENT_VERSION, ...payload }),
    });
    if (!res.ok) {
      log("debug", `Painel respondeu ${res.status} para "${action}"`);
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    log("debug", `Falha ao reportar "${action}": ${err.message}`);
    return null;
  }
}

async function runBackup(options) {
  const startedAt = Date.now();
  const localDir = path.resolve(options.dir);

  // --- Validação de entrada ---
  const stats = await fsp.stat(localDir).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Diretório local inválido ou inexistente: ${localDir}`);
  }

  const selected =
    options.provider === "both" ? ["google", "onedrive"] : [options.provider];
  for (const id of selected) {
    if (!PROVIDERS[id]) throw new Error(`Provedor desconhecido: ${id}`);
  }

  log("info", "Iniciando backup", {
    origem: localDir,
    destinos: selected.join(", "),
    remoteRoot: options.remote,
    conflito: options.conflict,
    incremental: options.incremental,
    dryRun: options.dryRun,
  });

  const files = await walkDir(localDir, options.exclude);
  if (files.length === 0) {
    log("warn", "Nenhum arquivo encontrado na pasta de origem. Nada a fazer.");
    return;
  }
  log("info", `${files.length} arquivo(s) encontrado(s).`);

  // Registra o início da execução no painel (se configurado)
  const started = await report("start", {
    source_dir: localDir,
    providers: selected.join(","),
    total_files: files.length,
  });
  const runId = started?.run_id ?? null;

  const manifest = options.incremental ? await readManifest() : {};

  // --- Conecta em cada provedor (falha isolada por provedor) ---
  /** @type {Array<{provider: any, ctx: any}>} */
  const targets = [];
  for (const id of selected) {
    const provider = PROVIDERS[id];
    try {
      const client = await withRetry(`Autenticação ${provider.label}`, () => provider.getClient());
      targets.push({
        provider,
        ctx: { client, remoteRoot: options.remote, folderCache: new Map() },
      });
      log("info", `Conectado a ${provider.label}.`);
    } catch (err) {
      log("error", `Não foi possível conectar a ${provider.label}: ${err.message}`);
    }
  }

  if (targets.length === 0) {
    throw new Error("Nenhum provedor de nuvem disponível. Backup abortado.");
  }

  // --- Envio arquivo a arquivo ---
  const summary = {};
  for (const { provider } of targets) {
    summary[provider.id] = { uploaded: 0, updated: 0, skipped: 0, failed: 0, bytes: 0 };
  }

  let processed = 0;
  /** Soma os contadores de todos os provedores para o painel. */
  const totals = () => {
    const acc = { uploaded: 0, updated: 0, skipped: 0, failed: 0, bytes: 0 };
    for (const s of Object.values(summary)) {
      acc.uploaded += s.uploaded;
      acc.updated += s.updated;
      acc.skipped += s.skipped;
      acc.failed += s.failed;
      acc.bytes += s.bytes;
    }
    return acc;
  };

  for (const relPath of files) {
    const absPath = path.join(localDir, relPath);
    const fileStat = await fsp.stat(absPath);
    const signature = options.incremental ? await hashFile(absPath) : null;

    for (const { provider, ctx } of targets) {
      const manifestKey = `${provider.id}:${relPath}`;

      if (options.incremental && manifest[manifestKey] === signature) {
        summary[provider.id].skipped += 1;
        log("debug", "Inalterado, pulando", { file: relPath, provider: provider.id });
        continue;
      }

      if (options.dryRun) {
        log("info", `[dry-run] Enviaria ${relPath} → ${provider.label}`);
        summary[provider.id].uploaded += 1;
        continue;
      }

      try {
        const result = await withRetry(`Upload ${relPath} → ${provider.label}`, () =>
          provider.uploadFile(ctx, relPath, absPath, options.conflict)
        );
        summary[provider.id][result] += 1;
        if (result !== "skipped") summary[provider.id].bytes += fileStat.size;
        if (signature) manifest[manifestKey] = signature;
        log("info", `${result} · ${relPath}`, {
          provider: provider.id,
          size: formatBytes(fileStat.size),
        });
      } catch (err) {
        summary[provider.id].failed += 1;
        log("error", `Falha ao enviar ${relPath} para ${provider.label}: ${err.message}`);
      }
    }

    processed += 1;
    if (runId && (processed % 5 === 0 || processed === files.length)) {
      await report("progress", { run_id: runId, processed_files: processed, current_file: relPath, ...totals() });
    }
  }

  if (options.incremental && !options.dryRun) await writeManifest(manifest);

  // --- Relatório final ---
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log("\n================ RESUMO DO BACKUP ================");
  let anyFailure = false;
  for (const [id, s] of Object.entries(summary)) {
    if (s.failed > 0) anyFailure = true;
    console.log(
      `${PROVIDERS[id].label.padEnd(14)} enviados:${s.uploaded} atualizados:${s.updated} ` +
        `pulados:${s.skipped} falhas:${s.failed} volume:${formatBytes(s.bytes)}`
    );
  }
  console.log(`Duração: ${elapsed}s`);
  console.log("==================================================\n");

  if (runId) {
    await report("finish", {
      run_id: runId,
      status: anyFailure ? "partial" : "success",
      processed_files: processed,
      ...totals(),
    });
  }

  if (anyFailure) {
    process.exitCode = 1; // permite que o cron/monitor detecte falha parcial
  }
}

// ============================================================================
// CLI
// ============================================================================

/** Converte argv em objeto { _: [posicionais], "--opcao": valor } sem dependências. */
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      out._.push(arg);
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 2) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

function printHelp() {
  console.log(`
Uso: node cloud-backup.js <comando> [opções]

Comandos:
  auth      Autoriza o acesso a um provedor de nuvem (OAuth 2.0)
  config    Pergunta quais pastas serão salvas e grava no arquivo .env
  run       Executa o backup da pasta local para a(s) nuvem(ns)
  status    Mostra quais provedores já estão autorizados
  logout    Remove as credenciais salvas de um provedor

Opções:
  --provider   google | onedrive | both (padrão: both)
  --dir        Pasta local a ser copiada (ou BACKUP_DIR no .env; várias separadas por ";")
  --remote     Pasta raiz de destino na nuvem (padrão: Backups)
  --conflict   overwrite | skip | rename (padrão: overwrite)
  --exclude    Trechos de caminho a ignorar, separados por vírgula
  --url        URL do backend (telemetria)
  --key        Chave de telemetria do agente
  --intervalo  Segundos entre backups automáticos (loop contínuo)

Exemplos:
  node cloud-backup.js auth --provider google
  node cloud-backup.js run --dir "C:\\dados" --provider google
  node cloud-backup.js run --url <URL> --key <CHAVE> --intervalo 300
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let command = opts._[0];

  // Telemetria via linha de comando (opcional): --url e --key alimentam o painel
  if (opts.url) process.env.BACKUP_API_URL = String(opts.url);
  if (opts.key) process.env.BACKUP_API_KEY = String(opts.key);

  // Atalho: quando o usuário passa apenas opções (sem comando), assume "run".
  // Ex.: node cloud-backup.js --url <URL> --key <CHAVE> --intervalo 300
  if (!command && process.argv.length > 2) {
    command = "run";
  }

  switch (command) {
    case "auth": {
      const provider = String(opts.provider || "");
      if (!PROVIDERS[provider]) {
        throw new Error("Informe --provider google ou --provider onedrive");
      }
      await PROVIDERS[provider].authorize();
      break;
    }

    case "config": {
      const envPath = path.resolve(process.cwd(), ".env");
      let envText = "";
      try {
        envText = await fsp.readFile(envPath, "utf8");
      } catch {
        // .env ainda não existe: será criado ao salvar
      }
      const current = (envText.match(/^BACKUP_DIR=(.*)$/m) || [])[1] || "";
      console.log("\n=== Configuração das pastas do backup ===");
      if (current.trim()) console.log(`Pastas atuais: ${current.trim()}`);
      console.log("Informe as pastas que devem ser salvas, uma por vez.");
      console.log("Exemplos: C:\\dados   D:\\arquivos   \\\\SERVIDOR\\compartilhamento");
      console.log("Deixe em branco para terminar.\n");
      const dirs = [];
      for (let i = 1; ; i++) {
        const answer = (await prompt(`Pasta ${i}: `)).trim();
        if (!answer) break;
        if (!fs.existsSync(answer)) {
          console.log(`  ⚠️  Pasta não encontrada: ${answer} (digite novamente ou em branco para terminar)`);
          i--;
          continue;
        }
        dirs.push(answer);
      }
      if (dirs.length === 0) {
        if (!current.trim()) throw new Error("Nenhuma pasta informada. Configuração não alterada.");
        log("info", `Mantendo as pastas atuais: ${current.trim()}`);
        break;
      }
      const line = `BACKUP_DIR=${dirs.join(";")}`;
      if (/^BACKUP_DIR=.*$/m.test(envText)) {
        envText = envText.replace(/^BACKUP_DIR=.*$/m, line);
      } else {
        envText += (envText.endsWith("\n") || envText === "" ? "" : "\n") + line + "\n";
      }
      await fsp.writeFile(envPath, envText, "utf8");
      log("info", `Pastas salvas no .env (${dirs.length}):`);
      for (const d of dirs) console.log(`  - ${d}`);
      log("info", "Pronto! Execute 'node cloud-backup.js run' para fazer o backup agora.");
      break;
    }

    case "run": {
      const dir = String(opts.dir || process.env.BACKUP_DIR || "");
      if (!dir.trim()) {
        throw new Error("Informe --dir ou defina BACKUP_DIR no .env (rode 'node cloud-backup.js config')");
      }
      const provider = String(opts.provider || process.env.BACKUP_PROVIDER || "both");
      if (!["google", "onedrive", "both"].includes(provider)) {
        throw new Error("--provider deve ser google, onedrive ou both");
      }
      const remote = String(opts.remote || process.env.BACKUP_REMOTE_DIR || "Backups");
      const conflict = String(opts.conflict || process.env.BACKUP_CONFLICT || "overwrite");
      if (!["overwrite", "skip", "rename"].includes(conflict)) {
        throw new Error("--conflict deve ser overwrite, skip ou rename");
      }
      const exclude = String(opts.exclude || process.env.BACKUP_EXCLUDE || "node_modules,.git")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const dryRun = opts["dry-run"] === true || String(opts["dry-run"]) === "true";
      const intervalo = Number(opts.intervalo || 0);

      const runAll = async () => {
        // Aceita várias pastas separadas por ";" (ex.: C:\dados;D:\arquivos;\\SRV\pasta)
        const dirs = dir
          .split(";")
          .map((d) => d.trim())
          .filter(Boolean);
        for (const d of dirs) {
          // Com mais de uma pasta, cada uma ganha uma subpasta própria no destino
          const base = path.basename(d.replace(/[\\/]+$/, "")) || "backup";
          const remoteDir = dirs.length > 1 ? `${remote}/${base}` : remote;
          log("info", `=== Backup da pasta: ${d} -> ${remoteDir} ===`);
          await runBackup({ dir: d, provider, remote: remoteDir, conflict, exclude, incremental: true, dryRun });
        }
      };

      if (intervalo > 0) {
        log("info", `Modo contínuo: backup a cada ${intervalo} segundos. Ctrl+C para parar.`);
        // Loop infinito com pausa entre execuções; erros são logados e o ciclo continua
        for (;;) {
          try {
            await runAll();
          } catch (err) {
            log("error", `Falha no ciclo de backup: ${err.message}`);
          }
          await new Promise((r) => setTimeout(r, intervalo * 1000));
        }
      } else {
        await runAll();
      }
      break;
    }

    case "status": {
      const tokens = await readTokens();
      console.log("\nEstado das autorizações:");
      for (const [id, provider] of Object.entries(PROVIDERS)) {
        console.log(`  ${provider.label.padEnd(14)} ${tokens[id] ? "✅ autorizado" : "❌ não autorizado"}`);
      }
      console.log(`\nArquivo de estado: ${TOKEN_FILE}\n`);
      break;
    }

    case "logout": {
      const provider = String(opts.provider || "");
      if (!PROVIDERS[provider]) {
        throw new Error("Informe --provider google ou --provider onedrive");
      }
      const answer = await prompt(`Remover credenciais de ${PROVIDERS[provider].label}? (s/N) `);
      if (answer.toLowerCase() !== "s") {
        log("info", "Cancelado.");
        break;
      }
      const tokens = await readTokens();
      delete tokens[provider];
      await ensureStateDir();
      await fsp.writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), { mode: 0o600 });
      log("info", "Credenciais removidas.");
      break;
    }

    case undefined:
      printHelp();
      throw new Error("Informe um comando: auth | config | run | status | logout");

    default:
      printHelp();
      throw new Error(`Comando desconhecido: ${command}`);
  }
}

main().catch((err) => {
  log("error", err.message);
  if (process.env.LOG_LEVEL === "debug") console.error(err.stack);
  process.exit(1);
});
