/**
 * SIMPlay SQLite Importer
 * 
 * Lê o banco de dados SQLite do SIMPlay da Intelbras
 * e envia os dispositivos cadastrados para o painel de monitoramento.
 * 
 * Lista os clientes do painel e permite escolher interativamente
 * qual cliente associar a cada DVR.
 *
 * === INSTALAÇÃO ===
 * npm install better-sqlite3 axios
 *
 * === USO ===
 * node simplay-importer.js [--db-path <caminho_do_banco>]
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
const readline = require("readline");

// ================= CONFIG =================
const SUPABASE_URL = "https://egbusmegupjfxqswdlxq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnYnVzbWVndXBqZnhxc3dkbHhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MDUxMDYsImV4cCI6MjA4MTk4MTEwNn0.SPh-z2s1UEyacv5ucviiMwWO58JifVKQ8NIYYYcfuQw";

// ================= READLINE =================
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ================= ARGS =================
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--db-path" && args[i + 1]) {
      parsed.dbPath = args[++i];
    } else if (args[i] === "--help") {
      console.log(`
Uso: node simplay-importer.js [--db-path <caminho>]

Opções:
  --db-path    Caminho do banco SQLite do SIMPlay
               (se omitido, tenta encontrar automaticamente)
  --help       Mostra esta ajuda

O script lista os clientes do painel e permite associar
cada DVR ao cliente correto interativamente.
      `);
      process.exit(0);
    }
  }
  return parsed;
}

// ================= BUSCAR CLIENTES =================
async function fetchClients() {
  try {
    const { data } = await axios.get(
      `${SUPABASE_URL}/rest/v1/clients?select=id,full_name&order=full_name`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );
    return data || [];
  } catch (err) {
    console.error("❌ Erro ao buscar clientes:", err.message);
    return [];
  }
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
      path.join(appData, "Intelbras", "SIM Next", "simplay.db"),
    );
  } else {
    const winePrefix = path.join(os.homedir(), ".wine", "drive_c", "users", os.userInfo().username);
    possiblePaths.push(
      path.join(winePrefix, "AppData", "Roaming", "Intelbras", "SIM Play", "simplay.db"),
      path.join(winePrefix, "AppData", "Roaming", "Intelbras", "SIMPlay", "simplay.db"),
    );
  }

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// ================= LER DISPOSITIVOS =================
function readDevices(dbPath) {
  console.log(`\n📂 Abrindo banco: ${dbPath}`);
  const db = new Database(dbPath, { readonly: true });

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log(`📋 Tabelas encontradas: ${tables.map(t => t.name).join(", ")}`);

  const possibleTableNames = ["devices", "device", "dvr", "dvrs", "equipments", "equipment", "cameras"];
  let deviceTable = null;

  for (const tbl of possibleTableNames) {
    if (tables.some(t => t.name.toLowerCase() === tbl.toLowerCase())) {
      deviceTable = tbl;
      break;
    }
  }

  if (!deviceTable) {
    for (const tbl of tables) {
      try {
        const cols = db.prepare(`PRAGMA table_info(${tbl.name})`).all();
        const colNames = cols.map(c => c.name.toLowerCase());
        if (colNames.some(c => ["ip", "host", "address", "ip_address"].includes(c))) {
          deviceTable = tbl.name;
          console.log(`🔍 Tabela candidata: ${tbl.name} (${cols.map(c => c.name).join(", ")})`);
          break;
        }
      } catch (e) {}
    }
  }

  if (!deviceTable) {
    console.error("❌ Nenhuma tabela de dispositivos encontrada.");
    console.log("\n🔍 Estrutura do banco:");
    for (const tbl of tables) {
      const cols = db.prepare(`PRAGMA table_info(${tbl.name})`).all();
      console.log(`  ${tbl.name}: ${cols.map(c => `${c.name}(${c.type})`).join(", ")}`);
    }
    db.close();
    return [];
  }

  console.log(`✅ Usando tabela: ${deviceTable}`);

  const columns = db.prepare(`PRAGMA table_info(${deviceTable})`).all();
  console.log(`   Colunas: ${columns.map(c => c.name).join(", ")}`);

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
    return data;
  } catch (err) {
    console.error("❌ Erro ao enviar:", err.response?.data || err.message);
    return null;
  }
}

// ================= MAIN =================
async function main() {
  console.log("=== SIMPlay SQLite Importer ===");
  console.log("================================\n");

  const args = parseArgs();

  // 1. Buscar clientes do painel
  console.log("📡 Buscando clientes do painel...\n");
  const clients = await fetchClients();

  if (clients.length === 0) {
    console.error("❌ Nenhum cliente encontrado no painel. Cadastre clientes primeiro.");
    rl.close();
    process.exit(1);
  }

  console.log("📋 Clientes disponíveis:");
  console.log("─".repeat(50));
  clients.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${c.full_name}`);
  });
  console.log("─".repeat(50));
  console.log("");

  // 2. Localizar banco do SIMPlay
  let dbPath = args.dbPath;
  if (!dbPath) {
    console.log("🔍 Procurando banco do SIMPlay...");
    dbPath = findSimPlayDB();
    if (!dbPath) {
      dbPath = await ask("❓ Banco não encontrado. Informe o caminho completo: ");
      dbPath = dbPath.trim().replace(/"/g, "");
    } else {
      console.log(`✅ Banco encontrado: ${dbPath}`);
    }
  }

  if (!fs.existsSync(dbPath)) {
    console.error(`❌ Arquivo não encontrado: ${dbPath}`);
    rl.close();
    process.exit(1);
  }

  // 3. Ler dispositivos
  const devices = readDevices(dbPath);

  if (devices.length === 0) {
    console.log("⚠️ Nenhum dispositivo válido encontrado no banco.");
    rl.close();
    process.exit(0);
  }

  console.log("\n📋 DVRs encontrados no SIMPlay:");
  console.log("─".repeat(60));
  devices.forEach((d, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${d.name} (${d.host}:${d.port}) - ${d.channels} canais`);
  });
  console.log("─".repeat(60));

  // 4. Escolher modo de associação
  console.log("\n🔗 Como deseja associar os DVRs aos clientes?\n");
  console.log("  1. Associar TODOS os DVRs a um único cliente");
  console.log("  2. Escolher cliente para CADA DVR individualmente");
  console.log("");

  const mode = await ask("Opção (1 ou 2): ");

  let totalImported = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  if (mode.trim() === "1") {
    // Modo 1: Todos para um cliente
    const clientNum = await ask(`\nNúmero do cliente (1-${clients.length}): `);
    const idx = parseInt(clientNum) - 1;

    if (idx < 0 || idx >= clients.length) {
      console.error("❌ Número inválido.");
      rl.close();
      process.exit(1);
    }

    const selectedClient = clients[idx];
    console.log(`\n📤 Importando ${devices.length} DVRs para "${selectedClient.full_name}"...`);

    const result = await importDevices(selectedClient.id, devices);
    if (result) {
      totalImported = result.imported;
      totalSkipped = result.skipped;
      if (result.errors) totalErrors = result.errors.length;
    }
  } else {
    // Modo 2: Escolher para cada DVR
    const grouped = {}; // { clientId: [devices] }

    for (let i = 0; i < devices.length; i++) {
      const dvr = devices[i];
      console.log(`\n🎥 DVR ${i + 1}/${devices.length}: ${dvr.name} (${dvr.host})`);
      const clientNum = await ask(`   Cliente (1-${clients.length}, ou 's' para pular): `);

      if (clientNum.trim().toLowerCase() === "s") {
        console.log("   ⏭ Pulado.");
        totalSkipped++;
        continue;
      }

      const idx = parseInt(clientNum) - 1;
      if (idx < 0 || idx >= clients.length) {
        console.log("   ⚠️ Número inválido, pulando.");
        totalSkipped++;
        continue;
      }

      const clientId = clients[idx].id;
      if (!grouped[clientId]) grouped[clientId] = { name: clients[idx].full_name, devices: [] };
      grouped[clientId].devices.push(dvr);
      console.log(`   ✅ → ${clients[idx].full_name}`);
    }

    // Enviar agrupados
    for (const [clientId, group] of Object.entries(grouped)) {
      console.log(`\n📤 Enviando ${group.devices.length} DVRs para "${group.name}"...`);
      const result = await importDevices(clientId, group.devices);
      if (result) {
        totalImported += result.imported;
        totalSkipped += result.skipped;
        if (result.errors) totalErrors += result.errors.length;
      }
    }
  }

  // Resumo final
  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMO DA IMPORTAÇÃO");
  console.log("═".repeat(50));
  console.log(`   ✅ Importados:  ${totalImported}`);
  console.log(`   ⏭ Pulados:     ${totalSkipped}`);
  console.log(`   ❌ Erros:       ${totalErrors}`);
  console.log("═".repeat(50));

  rl.close();
}

main().catch((err) => {
  console.error(err);
  rl.close();
});
