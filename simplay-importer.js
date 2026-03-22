/**
 * SIMPlay SQLite Importer
 * 
 * Lê o banco de dados SQLite do SIMPlay da Intelbras
 * e compara com os DVRs já cadastrados no painel.
 * O admin escolhe interativamente quais importar/manter.
 *
 * === INSTALAÇÃO ===
 * npm install better-sqlite3 axios
 *
 * === USO ===
 * node simplay-importer.js [--db-path <caminho_do_banco>]
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
      `);
      process.exit(0);
    }
  }
  return parsed;
}

// ================= API HELPERS (via Edge Functions) =================
async function fetchClients() {
  try {
    const { data } = await axios.get(
      `${SUPABASE_URL}/functions/v1/dvr-list?type=clients`,
      { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    return data || [];
  } catch (err) {
    console.error("❌ Erro ao buscar clientes:", err.response?.data || err.message);
    return [];
  }
}

async function fetchExistingDVRs() {
  try {
    const { data } = await axios.get(
      `${SUPABASE_URL}/functions/v1/dvr-list?type=dvrs`,
      { headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    return data || [];
  } catch (err) {
    console.error("❌ Erro ao buscar DVRs existentes:", err.response?.data || err.message);
    return [];
  }
}

async function importDevices(clientId, devices) {
  try {
    const { data } = await axios.post(
      `${SUPABASE_URL}/functions/v1/dvr-import`,
      { client_id: clientId, devices },
      {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        timeout: 30000,
      }
    );
    return data;
  } catch (err) {
    console.error("❌ Erro ao enviar:", err.response?.data || err.message);
    return null;
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

// ================= LER DISPOSITIVOS DO SQLITE =================
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
          break;
        }
      } catch (e) {}
    }
  }

  if (!deviceTable) {
    console.error("❌ Nenhuma tabela de dispositivos encontrada.");
    db.close();
    return [];
  }

  console.log(`✅ Usando tabela: ${deviceTable}`);
  const columns = db.prepare(`PRAGMA table_info(${deviceTable})`).all();

  const nameCol = columns.find(c => ["name", "nome", "device_name", "alias", "title"].includes(c.name.toLowerCase()))?.name || "name";
  const hostCol = columns.find(c => ["ip", "host", "address", "ip_address", "ddns", "domain"].includes(c.name.toLowerCase()))?.name || "ip";
  const portCol = columns.find(c => ["port", "porta", "http_port"].includes(c.name.toLowerCase()))?.name;
  const userCol = columns.find(c => ["username", "user", "usuario", "login"].includes(c.name.toLowerCase()))?.name;
  const passCol = columns.find(c => ["password", "pass", "senha", "pwd"].includes(c.name.toLowerCase()))?.name;
  const channelsCol = columns.find(c => ["channels", "channel_count", "camera_count", "canais", "num_cameras"].includes(c.name.toLowerCase()))?.name;

  const rows = db.prepare(`SELECT * FROM ${deviceTable}`).all();
  console.log(`📊 ${rows.length} dispositivos encontrados no SIMPlay`);

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

// ================= COMPARAR =================
function normalizeHost(h) {
  return (h || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

function compareDevices(simplayDevices, existingDVRs) {
  const existingMap = new Map();
  for (const dvr of existingDVRs) {
    const key = `${normalizeHost(dvr.host)}:${dvr.port}`;
    existingMap.set(key, dvr);
  }
  return simplayDevices.map(sp => {
    const key = `${normalizeHost(sp.host)}:${sp.port}`;
    const existing = existingMap.get(key);
    return { simplay: sp, existing: existing || null, isDuplicate: !!existing };
  });
}

// ================= MAIN =================
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("   SIMPlay SQLite Importer — Comparação Avançada");
  console.log("═══════════════════════════════════════════════════\n");

  const args = parseArgs();

  console.log("📡 Buscando dados do painel...\n");
  const [clients, existingDVRs] = await Promise.all([fetchClients(), fetchExistingDVRs()]);

  if (clients.length === 0) {
    console.error("❌ Nenhum cliente encontrado no painel. Cadastre clientes primeiro.");
    rl.close();
    process.exit(1);
  }

  console.log(`📋 ${clients.length} clientes no painel`);
  console.log(`📹 ${existingDVRs.length} DVRs já cadastrados no sistema\n`);

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

  const simplayDevices = readDevices(dbPath);
  if (simplayDevices.length === 0) {
    console.log("⚠️ Nenhum dispositivo válido encontrado no banco.");
    rl.close();
    process.exit(0);
  }

  const comparison = compareDevices(simplayDevices, existingDVRs);
  const newDevices = comparison.filter(c => !c.isDuplicate);
  const duplicates = comparison.filter(c => c.isDuplicate);

  console.log("\n" + "═".repeat(65));
  console.log("  COMPARAÇÃO: SIMPlay vs Sistema");
  console.log("═".repeat(65));
  console.log(`  📊 Total no SIMPlay:        ${simplayDevices.length}`);
  console.log(`  ✅ Novos (não existe):       ${newDevices.length}`);
  console.log(`  ⚠️  Duplicados (já existe):  ${duplicates.length}`);
  console.log("═".repeat(65));

  if (duplicates.length > 0) {
    console.log("\n⚠️  DVRs que JÁ EXISTEM no sistema:");
    console.log("─".repeat(65));
    duplicates.forEach((d, i) => {
      const clientName = d.existing.clients?.full_name || "Sem cliente";
      console.log(`  ${String(i + 1).padStart(3)}. ${d.simplay.name}`);
      console.log(`       SIMPlay: ${d.simplay.host}:${d.simplay.port}`);
      console.log(`       Sistema: ${d.existing.name} (${d.existing.host}:${d.existing.port}) — ${clientName} [${d.existing.status}]`);
    });
    console.log("─".repeat(65));
  }

  if (newDevices.length === 0 && duplicates.length === 0) {
    console.log("\n✅ Nada a importar.");
    rl.close();
    return;
  }

  if (newDevices.length > 0) {
    console.log("\n🆕 DVRs NOVOS para importar:");
    console.log("─".repeat(65));
    newDevices.forEach((d, i) => {
      console.log(`  ${String(i + 1).padStart(3)}. ${d.simplay.name} (${d.simplay.host}:${d.simplay.port}) - ${d.simplay.channels} canais`);
    });
    console.log("─".repeat(65));
  }

  // Duplicates handling
  let reimportDuplicates = [];
  if (duplicates.length > 0) {
    console.log("\n🔄 O que fazer com os DVRs duplicados?\n");
    console.log("  1. Ignorar duplicados (importar apenas os novos)");
    console.log("  2. Selecionar quais duplicados reimportar");
    console.log("  3. Reimportar TODOS (novos + duplicados)");
    console.log("");
    const dupChoice = await ask("Opção (1, 2 ou 3): ");
    if (dupChoice.trim() === "2") {
      for (let i = 0; i < duplicates.length; i++) {
        const d = duplicates[i];
        const answer = await ask(`  ${d.simplay.name} (${d.simplay.host}) — reimportar? (s/n): `);
        if (answer.trim().toLowerCase() === "s") reimportDuplicates.push(d);
      }
    } else if (dupChoice.trim() === "3") {
      reimportDuplicates = [...duplicates];
    }
  }

  const devicesToImport = [
    ...newDevices.map(d => d.simplay),
    ...reimportDuplicates.map(d => d.simplay),
  ];

  if (devicesToImport.length === 0) {
    console.log("\n⚠️ Nenhum DVR selecionado para importar.");
    rl.close();
    return;
  }

  console.log(`\n📦 Total de DVRs a importar: ${devicesToImport.length}`);

  // Client association
  console.log("\n📋 Clientes disponíveis:");
  console.log("─".repeat(50));
  clients.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(3)}. ${c.full_name}`);
  });
  console.log("─".repeat(50));

  console.log("\n🔗 Como associar os DVRs aos clientes?\n");
  console.log("  1. Associar TODOS a um único cliente");
  console.log("  2. Escolher cliente para CADA DVR");
  console.log("");
  const mode = await ask("Opção (1 ou 2): ");

  let totalImported = 0, totalSkipped = 0, totalErrors = 0;

  if (mode.trim() === "1") {
    const clientNum = await ask(`\nNúmero do cliente (1-${clients.length}): `);
    const idx = parseInt(clientNum) - 1;
    if (idx < 0 || idx >= clients.length) {
      console.error("❌ Número inválido.");
      rl.close();
      process.exit(1);
    }
    const sel = clients[idx];
    console.log(`\n📤 Importando ${devicesToImport.length} DVRs para "${sel.full_name}"...`);
    const result = await importDevices(sel.id, devicesToImport);
    if (result) {
      totalImported = result.imported || 0;
      totalSkipped = result.skipped || 0;
      if (result.errors) totalErrors = result.errors.length;
    }
  } else {
    const grouped = {};
    for (let i = 0; i < devicesToImport.length; i++) {
      const dvr = devicesToImport[i];
      console.log(`\n🎥 DVR ${i + 1}/${devicesToImport.length}: ${dvr.name} (${dvr.host})`);
      const clientNum = await ask(`   Cliente (1-${clients.length}, ou 's' para pular): `);
      if (clientNum.trim().toLowerCase() === "s") { totalSkipped++; continue; }
      const idx = parseInt(clientNum) - 1;
      if (idx < 0 || idx >= clients.length) { console.log("   ⚠️ Número inválido, pulando."); totalSkipped++; continue; }
      const cid = clients[idx].id;
      if (!grouped[cid]) grouped[cid] = { name: clients[idx].full_name, devices: [] };
      grouped[cid].devices.push(dvr);
      console.log(`   ✅ → ${clients[idx].full_name}`);
    }
    for (const [cid, group] of Object.entries(grouped)) {
      console.log(`\n📤 Enviando ${group.devices.length} DVRs para "${group.name}"...`);
      const result = await importDevices(cid, group.devices);
      if (result) {
        totalImported += result.imported || 0;
        totalSkipped += result.skipped || 0;
        if (result.errors) totalErrors += result.errors.length;
      }
    }
  }

  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMO DA IMPORTAÇÃO");
  console.log("═".repeat(50));
  console.log(`   ✅ Importados:  ${totalImported}`);
  console.log(`   ⏭ Pulados:     ${totalSkipped}`);
  console.log(`   ❌ Erros:       ${totalErrors}`);
  console.log("═".repeat(50));

  rl.close();
}

main().catch((err) => { console.error(err); rl.close(); });
