/**
 * SIMPlay SQLite Importer
 * 
 * Lê o banco de dados SQLite do SIMPlay da Intelbras
 * e envia os dispositivos cadastrados para o painel de monitoramento.
 *
 * === INSTALAÇÃO ===
 * npm install better-sqlite3 axios
 *
 * === USO ===
 * node simplay-importer.js --client-id <UUID_DO_CLIENTE> [--db-path <caminho_do_banco>]
 *
 * === CAMINHOS COMUNS DO BANCO DO SIMPLAY ===
 * Windows: C:\Users\<usuario>\AppData\Roaming\Intelbras\SIM Play\simplay.db
 *          C:\ProgramData\Intelbras\SIM Play\simplay.db
 * Linux (Wine): ~/.wine/drive_c/users/<user>/AppData/Roaming/Intelbras/SIM Play/simplay.db
 */

const Database = require("better-sqlite3");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const os = require("os");

// ================= CONFIG =================
const SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYnVzbWVndXBqZnhxc3dkbHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MDUxMDYsImV4cCI6MjA4MTk4MTEwNn0.SPh-z2s1UEyacv5ucviiMwWO58JifVKQ8NIYYYcfuQw";

// ================= ARGS =================
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--client-id" && args[i + 1]) {
      parsed.clientId = args[++i];
    } else if (args[i] === "--db-path" && args[i + 1]) {
      parsed.dbPath = args[++i];
    } else if (args[i] === "--help") {
      console.log(`
Uso: node simplay-importer.js --client-id <UUID> [--db-path <caminho>]

Opções:
  --client-id  UUID do cliente no painel (obrigatório)
  --db-path    Caminho do banco SQLite do SIMPlay
               (se omitido, tenta encontrar automaticamente)
  --help       Mostra esta ajuda
      `);
      process.exit(0);
    }
  }
  return parsed;
}

// ================= LOCALIZAR BANCO =================
function findSimPlayDB() {
  const possiblePaths = [];

  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    const programData = process.env.PROGRAMDATA || "C:\\ProgramData";

    possiblePaths.push(
      path.join(appData, "Intelbras", "SIM Play", "simplay.db"),
      path.join(appData, "Intelbras", "SIM Play", "simplay.sqlite"),
      path.join(appData, "Intelbras", "SIMPlay", "simplay.db"),
      path.join(programData, "Intelbras", "SIM Play", "simplay.db"),
      path.join(appData, "Intelbras", "SIM Play", "database.db"),
      // Intelbras Cloud também pode usar estes caminhos
      path.join(appData, "Intelbras", "SIM Next", "simplay.db"),
    );
  } else {
    // Linux com Wine
    const winePrefix = path.join(os.homedir(), ".wine", "drive_c", "users", os.userInfo().username);
    possiblePaths.push(
      path.join(winePrefix, "AppData", "Roaming", "Intelbras", "SIM Play", "simplay.db"),
      path.join(winePrefix, "AppData", "Roaming", "Intelbras", "SIMPlay", "simplay.db"),
    );
  }

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return null;
}

// ================= LER DISPOSITIVOS =================
function readDevices(dbPath) {
  console.log(`📂 Abrindo banco: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });

  // Listar todas as tabelas para debug
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log(`📋 Tabelas encontradas: ${tables.map(t => t.name).join(", ")}`);

  // Tentar diferentes nomes de tabelas que o SIMPlay pode usar
  const possibleTableNames = ["devices", "device", "dvr", "dvrs", "equipments", "equipment", "cameras"];
  let deviceTable = null;

  for (const tbl of possibleTableNames) {
    if (tables.some(t => t.name.toLowerCase() === tbl.toLowerCase())) {
      deviceTable = tbl;
      break;
    }
  }

  if (!deviceTable) {
    // Tentar encontrar qualquer tabela que tenha colunas relevantes
    for (const tbl of tables) {
      try {
        const cols = db.prepare(`PRAGMA table_info(${tbl.name})`).all();
        const colNames = cols.map(c => c.name.toLowerCase());
        if (colNames.some(c => ["ip", "host", "address", "ip_address"].includes(c))) {
          deviceTable = tbl.name;
          console.log(`🔍 Tabela candidata encontrada: ${tbl.name}`);
          console.log(`   Colunas: ${cols.map(c => c.name).join(", ")}`);
          break;
        }
      } catch (e) {
        // ignorar
      }
    }
  }

  if (!deviceTable) {
    console.error("❌ Nenhuma tabela de dispositivos encontrada no banco.");
    console.log("\n🔍 Estrutura do banco:");
    for (const tbl of tables) {
      const cols = db.prepare(`PRAGMA table_info(${tbl.name})`).all();
      console.log(`  ${tbl.name}: ${cols.map(c => `${c.name}(${c.type})`).join(", ")}`);
    }
    db.close();
    return [];
  }

  console.log(`✅ Usando tabela: ${deviceTable}`);

  // Ler colunas da tabela
  const columns = db.prepare(`PRAGMA table_info(${deviceTable})`).all();
  const colNames = columns.map(c => c.name.toLowerCase());
  console.log(`   Colunas: ${columns.map(c => c.name).join(", ")}`);

  // Mapear colunas
  const nameCol = columns.find(c => ["name", "nome", "device_name", "alias", "title"].includes(c.name.toLowerCase()))?.name || "name";
  const hostCol = columns.find(c => ["ip", "host", "address", "ip_address", "ddns", "domain"].includes(c.name.toLowerCase()))?.name || "ip";
  const portCol = columns.find(c => ["port", "porta", "http_port"].includes(c.name.toLowerCase()))?.name;
  const userCol = columns.find(c => ["username", "user", "usuario", "login"].includes(c.name.toLowerCase()))?.name;
  const passCol = columns.find(c => ["password", "pass", "senha", "pwd"].includes(c.name.toLowerCase()))?.name;
  const channelsCol = columns.find(c => ["channels", "channel_count", "camera_count", "canais", "num_cameras"].includes(c.name.toLowerCase()))?.name;

  const rows = db.prepare(`SELECT * FROM ${deviceTable}`).all();
  console.log(`📊 ${rows.length} dispositivos encontrados`);

  const devices = rows.map(row => ({
    name: row[nameCol] || "DVR Sem Nome",
    host: row[hostCol] || "",
    port: portCol ? (row[portCol] || 80) : 80,
    username: userCol ? (row[userCol] || "admin") : "admin",
    password: passCol ? (row[passCol] || "") : "",
    channels: channelsCol ? (row[channelsCol] || 0) : 0,
  })).filter(d => d.host);

  db.close();
  return devices;
}

// ================= ENVIAR PARA O PAINEL =================
async function importDevices(clientId, devices) {
  console.log(`\n📤 Enviando ${devices.length} dispositivos para o painel...`);

  try {
    const { data } = await axios.post(
      `${SUPABASE_URL}/functions/v1/dvr-import`,
      { client_id: clientId, devices },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        timeout: 30000,
      }
    );

    console.log(`\n✅ Importação concluída!`);
    console.log(`   Importados: ${data.imported}`);
    console.log(`   Atualizados/Pulados: ${data.skipped}`);
    console.log(`   Total: ${data.total}`);
    if (data.errors) {
      console.log(`   Erros: ${data.errors.length}`);
      data.errors.forEach(e => console.log(`     - ${e}`));
    }
  } catch (err) {
    console.error("❌ Erro ao enviar:", err.response?.data || err.message);
  }
}

// ================= MAIN =================
async function main() {
  console.log("=== SIMPlay SQLite Importer ===\n");

  const args = parseArgs();

  if (!args.clientId) {
    console.error("❌ --client-id é obrigatório.");
    console.log("   Uso: node simplay-importer.js --client-id <UUID_DO_CLIENTE>");
    console.log("\n   Para encontrar o UUID do cliente, acesse o painel > Clientes.");
    process.exit(1);
  }

  let dbPath = args.dbPath;
  if (!dbPath) {
    console.log("🔍 Procurando banco do SIMPlay...");
    dbPath = findSimPlayDB();
    if (!dbPath) {
      console.error("❌ Banco do SIMPlay não encontrado automaticamente.");
      console.log("   Use --db-path para especificar o caminho manualmente.");
      console.log("\n   Caminhos comuns:");
      console.log("   Windows: %APPDATA%\\Intelbras\\SIM Play\\simplay.db");
      console.log("   Linux:   ~/.wine/drive_c/.../Intelbras/SIM Play/simplay.db");
      process.exit(1);
    }
    console.log(`✅ Banco encontrado: ${dbPath}`);
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Arquivo não encontrado: ${dbPath}`);
    process.exit(1);
  }

  const devices = readDevices(dbPath);

  if (devices.length === 0) {
    console.log("⚠️ Nenhum dispositivo válido encontrado no banco.");
    process.exit(0);
  }

  console.log("\n📋 Dispositivos encontrados:");
  devices.forEach((d, i) => {
    console.log(`   ${i + 1}. ${d.name} (${d.host}:${d.port}) - ${d.channels} canais`);
  });

  await importDevices(args.clientId, devices);
}

main().catch(console.error);
