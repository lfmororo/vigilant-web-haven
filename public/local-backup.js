#!/usr/bin/env node
'use strict';

/**
 * copiar-pastas.js
 * ------------------------------------------------------------
 * Copia uma ou mais pastas para um destino, mostrando progresso
 * em tempo real (bytes copiados, %, velocidade, ETA).
 *
 * Usa modelo produtor/consumidor: o mapeamento das pastas roda em
 * paralelo com a cópia (que começa assim que os primeiros arquivos
 * são encontrados, sem esperar a árvore inteira ser listada) e a
 * fila de arquivos pendentes tem tamanho limitado — isso mantém o
 * uso de memória sob controle mesmo em árvores com milhões de
 * arquivos (evita o erro "JavaScript heap out of memory").
 *
 * USO INTERATIVO:
 *   node copiar-pastas.js
 *
 * USO POR LINHA DE COMANDO:
 *   node copiar-pastas.js "C:\pasta1" "\\servidor\pasta2" --destino "D:\backup"
 *
 * OPÇÕES:
 *   --destino <caminho>   Pasta de destino (obrigatório)
 *   --concorrencia <N>    Arquivos copiados ao mesmo tempo (padrão: 16)
 *   --partes <N>          Partes paralelas por arquivo grande ≥64MB (padrão: 4)
 *   --vigiar              Após a cópia inicial, continua rodando e copia
 *                         imediatamente todo arquivo novo ou alterado na origem
 *
 * IMPORTANTE: arquivos apagados na origem NUNCA são apagados no destino.
 * ------------------------------------------------------------
 */


const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const readline = require('readline');

// ============ CONFIGURAÇÕES (ajuste conforme sua rede) ============
function obterArgConcorrencia() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--concorrencia');
  if (idx !== -1 && args[idx + 1]) {
    const valor = parseInt(args[idx + 1], 10);
    if (!isNaN(valor) && valor > 0) return valor;
  }
  return 16;
}

function obterArgPartes() {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--partes');
  if (idx !== -1 && args[idx + 1]) {
    const valor = parseInt(args[idx + 1], 10);
    if (!isNaN(valor) && valor > 0) return valor;
  }
  return 4;
}

const CONCORRENCIA = obterArgConcorrencia();
const PARTES_ARQUIVO_GRANDE = obterArgPartes();
// Modo vigia: após a cópia inicial, continua monitorando a origem e copia
// imediatamente qualquer arquivo criado ou alterado. Nunca apaga no destino.
const MODO_VIGIA = process.argv.slice(2).some(a => a === '--vigiar' || a === '--watch');
const DEBOUNCE_VIGIA_MS = 800;
const TAMANHO_BUFFER = 4 * 1024 * 1024;
const LIMITE_ARQUIVO_PEQUENO = 2 * 1024 * 1024;
const LIMITE_ARQUIVO_DIVIDIR = 64 * 1024 * 1024;
const TOLERANCIA_MTIME_MS = 2000;

// Tamanho máximo da fila de arquivos pendentes. O mapeamento pausa quando
// atinge esse limite e só volta a listar mais quando os consumidores (cópia)
// abrirem espaço. É isso que mantém a memória limitada em árvores enormes.
const LIMITE_FILA = 5000;
const LIMITE_TRAVESSIA_PARALELA = Math.min(CONCORRENCIA, 12);

// ============ UTILITÁRIOS ============
function formatarBytes(bytes) {
  if (bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${unidades[i]}`;
}

function formatarTempo(segundos) {
  if (!isFinite(segundos) || segundos < 0) return '--:--:--';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function perguntar(pergunta) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(pergunta, resposta => {
    rl.close();
    resolve(resposta.trim());
  }));
}

async function existeCaminho(caminho) {
  try {
    await fsp.access(caminho);
    return true;
  } catch {
    return false;
  }
}

// ============ COLETA DE ENTRADA (interativa ou via CLI) ============
async function coletarEntrada() {
  const args = process.argv.slice(2);
  let origens = [];
  let destino = null;

  const flagsComValor = ['--destino', '--concorrencia', '--partes'];
  const indicesParaRemover = new Set();
  for (const flag of flagsComValor) {
    const idx = args.indexOf(flag);
    if (idx !== -1) {
      if (flag === '--destino') destino = args[idx + 1];
      indicesParaRemover.add(idx);
      indicesParaRemover.add(idx + 1);
    }
  }
  const restantes = args.filter(
    (a, i) => !indicesParaRemover.has(i) && a !== '--vigiar' && a !== '--watch'
  );
  if (restantes.length > 0) origens = restantes;

  if (origens.length > 0 && destino) {
    return { origens, destino };
  }

  console.log('=== Copiar Pastas com Progresso ===\n');
  origens = [];
  while (true) {
    const resp = await perguntar(
      origens.length === 0
        ? 'Pasta de origem (caminho completo): '
        : 'Outra pasta de origem (ENTER para continuar): '
    );
    if (!resp) {
      if (origens.length === 0) {
        console.log('Você precisa informar pelo menos uma pasta de origem.');
        continue;
      }
      break;
    }
    origens.push(resp);
  }

  while (!destino) {
    destino = await perguntar('\nPasta de destino: ');
    if (!destino) console.log('Informe um destino válido.');
  }

  return { origens, destino };
}

// ============ POOL DE CONCORRÊNCIA GENÉRICO ============
async function executarComLimite(itens, limite, worker) {
  let indice = 0;
  async function proximo() {
    if (indice >= itens.length) return;
    const item = itens[indice++];
    await worker(item);
    return proximo();
  }
  const trabalhadores = [];
  for (let i = 0; i < Math.min(limite, itens.length); i++) trabalhadores.push(proximo());
  await Promise.all(trabalhadores);
}

// ============ CACHE DE DIRETÓRIOS JÁ CRIADOS ============
const diretoriosCriados = new Set();
async function garantirDiretorio(dir) {
  if (diretoriosCriados.has(dir)) return;
  await fsp.mkdir(dir, { recursive: true });
  let atual = dir;
  while (atual && !diretoriosCriados.has(atual)) {
    diretoriosCriados.add(atual);
    const pai = path.dirname(atual);
    if (pai === atual) break;
    atual = pai;
  }
}

// ============ VERIFICAÇÃO DE ARQUIVO JÁ COPIADO ============
async function arquivoJaCopiado(item) {
  try {
    const statDestino = await fsp.stat(item.destino);
    if (statDestino.size !== item.tamanho) return false;
    const diffMs = Math.abs(statDestino.mtimeMs - item.mtimeMs);
    return diffMs <= TOLERANCIA_MTIME_MS;
  } catch {
    return false;
  }
}

// ============ CÓPIA DIVIDIDA (arquivos grandes, múltiplas partes em paralelo) ============
async function copiarIntervalo(handleLeitura, handleEscrita, inicio, fim, onProgresso) {
  const buffer = Buffer.alloc(TAMANHO_BUFFER);
  let posicao = inicio;
  while (posicao < fim) {
    const tamanhoLeitura = Math.min(TAMANHO_BUFFER, fim - posicao);
    const { bytesRead } = await handleLeitura.read(buffer, 0, tamanhoLeitura, posicao);
    if (bytesRead === 0) break;
    await handleEscrita.write(buffer, 0, bytesRead, posicao);
    onProgresso(bytesRead);
    posicao += bytesRead;
  }
}

async function copiarArquivoDividido(item, onProgresso) {
  const handleLeitura = await fsp.open(item.origem, 'r');
  const handleEscrita = await fsp.open(item.destino, 'w');
  try {
    const tamanhoParte = Math.ceil(item.tamanho / PARTES_ARQUIVO_GRANDE);
    const tarefas = [];
    for (let i = 0; i < PARTES_ARQUIVO_GRANDE; i++) {
      const inicio = i * tamanhoParte;
      const fim = Math.min(inicio + tamanhoParte, item.tamanho);
      if (inicio >= fim) break;
      tarefas.push(copiarIntervalo(handleLeitura, handleEscrita, inicio, fim, onProgresso));
    }
    await Promise.all(tarefas);
  } finally {
    await handleLeitura.close();
    await handleEscrita.close();
  }
}

// ============ CÓPIA DE UM ARQUIVO (com callback de progresso) ============
// Retorna 'copiado' ou 'pulado'
async function copiarArquivo(item, onProgresso) {
  if (await arquivoJaCopiado(item)) {
    onProgresso(item.tamanho);
    return 'pulado';
  }

  await garantirDiretorio(path.dirname(item.destino));

  if (item.tamanho <= LIMITE_ARQUIVO_PEQUENO) {
    await fsp.copyFile(item.origem, item.destino);
    await fsp.utimes(item.destino, item.atime, item.mtime);
    onProgresso(item.tamanho);
    return 'copiado';
  }

  if (item.tamanho >= LIMITE_ARQUIVO_DIVIDIR) {
    await copiarArquivoDividido(item, onProgresso);
    await fsp.utimes(item.destino, item.atime, item.mtime);
    return 'copiado';
  }

  await new Promise((resolve, reject) => {
    const leitura = fs.createReadStream(item.origem, { highWaterMark: TAMANHO_BUFFER });
    const escrita = fs.createWriteStream(item.destino, { highWaterMark: TAMANHO_BUFFER });
    leitura.on('data', chunk => onProgresso(chunk.length));
    leitura.on('error', err => { escrita.destroy(); reject(err); });
    escrita.on('error', reject);
    escrita.on('finish', resolve);
    leitura.pipe(escrita);
  });
  await fsp.utimes(item.destino, item.atime, item.mtime);
  return 'copiado';
}

// ============ PAINEL DE PROGRESSO (mapeamento + cópia acontecendo juntos) ============
function criarMonitor() {
  let pastasVisitadas = 0;
  let arquivosDescobertos = 0;
  let arquivosProcessados = 0;
  let arquivosCopiados = 0;
  let arquivosPulados = 0;
  let arquivosComErro = 0;
  let bytesCopiados = 0;
  let mapeamentoConcluido = false;

  const inicio = Date.now();
  let ultimoBytes = 0;
  let ultimoTempo = inicio;

  const intervalo = setInterval(desenhar, 300);

  function desenhar() {
    const agora = Date.now();
    const decorrido = (agora - inicio) / 1000;
    const deltaBytes = bytesCopiados - ultimoBytes;
    const deltaTempo = (agora - ultimoTempo) / 1000 || 1;
    const velocidade = deltaBytes / deltaTempo;
    ultimoBytes = bytesCopiados;
    ultimoTempo = agora;

    const statusMapa = mapeamentoConcluido ? 'concluído' : 'em andamento';
    const percentual = arquivosDescobertos > 0
      ? (arquivosProcessados / arquivosDescobertos) * 100
      : 0;

    const largura = (process.stdout.columns || 120) - 1;
    const linha =
      `Mapeamento: ${statusMapa} (${pastasVisitadas} pastas, ${arquivosDescobertos} arquivos) | ` +
      `Copiados: ${arquivosProcessados}/${arquivosDescobertos} (${percentual.toFixed(1)}%) | ` +
      `${formatarBytes(bytesCopiados)} | ${formatarBytes(velocidade)}/s | ${formatarTempo(decorrido)}`;
    process.stdout.write('\r' + linha.slice(0, largura).padEnd(largura, ' '));
  }

  return {
    registrarPasta() { pastasVisitadas++; },
    registrarArquivoDescoberto() { arquivosDescobertos++; },
    marcarMapeamentoConcluido() { mapeamentoConcluido = true; },
    adicionarBytes(qtd) { bytesCopiados += qtd; },
    arquivoProcessado(resultado) {
      arquivosProcessados++;
      if (resultado === 'copiado') arquivosCopiados++;
      else if (resultado === 'pulado') arquivosPulados++;
      else arquivosComErro++;
    },
    finalizar() {
      clearInterval(intervalo);
      desenhar();
      process.stdout.write('\n');
      return {
        arquivosCopiados, arquivosPulados, arquivosComErro,
        bytesCopiados, segundos: (Date.now() - inicio) / 1000
      };
    }
  };
}

// ============ PRODUTOR: mapeia diretórios e enfileira arquivos ============
// Percorre subpastas em paralelo (várias chamadas readdir simultâneas —
// reduz o impacto da latência de rede) e aplica "backpressure": se a fila
// já tem LIMITE_FILA itens pendentes, espera antes de descobrir mais.
async function mapear(dirOrigem, dirDestino, fila, monitor) {
  monitor.registrarPasta();
  let entradas;
  try {
    entradas = await fsp.readdir(dirOrigem, { withFileTypes: true });
  } catch (err) {
    console.error(`\nNão foi possível ler "${dirOrigem}": ${err.message}`);
    return;
  }

  const subpastas = [];
  for (const entrada of entradas) {
    const origemCompleta = path.join(dirOrigem, entrada.name);
    const destinoCompleto = path.join(dirDestino, entrada.name);
    if (entrada.isDirectory()) {
      subpastas.push({ origemCompleta, destinoCompleto });
    } else if (entrada.isFile()) {
      while (fila.length >= LIMITE_FILA) await esperar(20);
      fila.push({ origem: origemCompleta, destino: destinoCompleto });
      monitor.registrarArquivoDescoberto();
    }
  }

  await executarComLimite(
    subpastas,
    LIMITE_TRAVESSIA_PARALELA,
    sp => mapear(sp.origemCompleta, sp.destinoCompleto, fila, monitor)
  );
}

// ============ CONSUMIDOR: retira da fila e copia ============
async function trabalhador(fila, monitor, estadoMapeamento) {
  while (true) {
    if (fila.length === 0) {
      if (estadoMapeamento.concluido) return;
      await esperar(30);
      continue;
    }
    const ref = fila.shift();
    try {
      const stat = await fsp.stat(ref.origem);
      const item = {
        origem: ref.origem,
        destino: ref.destino,
        tamanho: stat.size,
        mtime: stat.mtime,
        mtimeMs: stat.mtimeMs,
        atime: stat.atime
      };
      const resultado = await copiarArquivo(item, (bytes) => monitor.adicionarBytes(bytes));
      monitor.arquivoProcessado(resultado);
    } catch (err) {
      console.error(`\nErro ao copiar "${ref.origem}": ${err.message}`);
      monitor.arquivoProcessado('erro');
    }
  }
}

// ============ MODO VIGIA (cópia imediata de novos/alterados) ============
// Observa recursivamente cada pasta de origem. Ao detectar criação ou alteração
// de um arquivo, copia na hora para o destino correspondente.
// Exclusões na origem são IGNORADAS de propósito: o destino preserva o histórico.
function iniciarVigia(origens, destino) {
  const pendentes = new Map(); // caminho relativo -> timer de debounce
  let emAndamento = 0;

  function registrar(origemBase, destinoBase, relativo) {
    if (!relativo) return;
    const chave = path.join(origemBase, relativo);
    const timerAnterior = pendentes.get(chave);
    if (timerAnterior) clearTimeout(timerAnterior);
    pendentes.set(
      chave,
      setTimeout(() => {
        pendentes.delete(chave);
        processar(path.join(origemBase, relativo), path.join(destinoBase, relativo));
      }, DEBOUNCE_VIGIA_MS)
    );
  }

  async function processar(origemCompleta, destinoCompleto) {
    let stat;
    try {
      stat = await fsp.stat(origemCompleta);
    } catch {
      // Arquivo removido ou renomeado na origem: nada a fazer (destino é preservado).
      return;
    }
    if (stat.isDirectory()) {
      // Pasta nova: varre e copia o conteúdo.
      let entradas = [];
      try {
        entradas = await fsp.readdir(origemCompleta, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entrada of entradas) {
        await processar(
          path.join(origemCompleta, entrada.name),
          path.join(destinoCompleto, entrada.name)
        );
      }
      return;
    }
    if (!stat.isFile()) return;

    const item = {
      origem: origemCompleta,
      destino: destinoCompleto,
      tamanho: stat.size,
      mtime: stat.mtime,
      mtimeMs: stat.mtimeMs,
      atime: stat.atime
    };
    emAndamento++;
    try {
      const resultado = await copiarArquivo(item, () => {});
      if (resultado === 'copiado') {
        console.log(
          `[${new Date().toLocaleTimeString('pt-BR')}] Atualizado: ${origemCompleta} ` +
          `(${formatarBytes(stat.size)})`
        );
      }
    } catch (err) {
      console.error(`[vigia] Erro ao copiar "${origemCompleta}": ${err.message}`);
    } finally {
      emAndamento--;
    }
  }

  for (const origem of origens) {
    const nomeBase = path.basename(path.resolve(origem));
    const destinoDaOrigem = path.join(destino, nomeBase);
    try {
      const observador = fs.watch(origem, { recursive: true }, (_evento, nomeArquivo) => {
        if (!nomeArquivo) return;
        registrar(origem, destinoDaOrigem, nomeArquivo.toString());
      });
      observador.on('error', err => console.error(`[vigia] ${origem}: ${err.message}`));
      console.log(`Vigiando: ${origem} -> ${destinoDaOrigem}`);
    } catch (err) {
      console.error(
        `[vigia] Não foi possível vigiar "${origem}": ${err.message}. ` +
        `Em Linux com pastas de rede o modo recursivo pode não ser suportado.`
      );
    }
  }

  console.log(
    '\nModo vigia ativo. Novos arquivos e alterações são copiados na hora; ' +
    'arquivos apagados na origem permanecem no destino. Pressione Ctrl+C para sair.\n'
  );

  process.on('SIGINT', () => {
    console.log(`\nEncerrando vigia${emAndamento ? ` (${emAndamento} cópias em andamento)` : ''}...`);
    process.exit(0);
  });
}


// ============ FLUXO PRINCIPAL ============
async function main() {
  const { origens, destino } = await coletarEntrada();

  for (const origem of origens) {
    if (!(await existeCaminho(origem))) {
      console.error(`\nErro: a pasta de origem não existe: ${origem}`);
      process.exit(1);
    }
  }

  console.log(
    `\nMapeando e copiando ao mesmo tempo — ${CONCORRENCIA} cópias simultâneas ` +
    `(--concorrencia N), ${PARTES_ARQUIVO_GRANDE} partes por arquivo grande (--partes N).\n`
  );

  const fila = [];
  const estadoMapeamento = { concluido: false };
  const monitor = criarMonitor();

  const promessaMapeamento = (async () => {
    for (const origem of origens) {
      const nomeBase = path.basename(path.resolve(origem));
      const destinoDaOrigem = path.join(destino, nomeBase);
      await mapear(origem, destinoDaOrigem, fila, monitor);
    }
    estadoMapeamento.concluido = true;
    monitor.marcarMapeamentoConcluido();
  })();

  const trabalhadores = [];
  for (let i = 0; i < CONCORRENCIA; i++) {
    trabalhadores.push(trabalhador(fila, monitor, estadoMapeamento));
  }

  await Promise.all([promessaMapeamento, ...trabalhadores]);

  const stats = monitor.finalizar();
  const velocidadeMedia = stats.segundos > 0 ? stats.bytesCopiados / stats.segundos : 0;
  console.log(
    `\nConcluído! ${stats.arquivosCopiados} arquivos copiados, ${stats.arquivosPulados} já ` +
    `estavam atualizados${stats.arquivosComErro ? `, ${stats.arquivosComErro} falharam` : ''}. ` +
    `Total: ${formatarBytes(stats.bytesCopiados)} em ${formatarTempo(stats.segundos)} ` +
    `(média de ${formatarBytes(velocidadeMedia)}/s).`
  );
}

main().catch(err => {
  console.error('\nErro fatal:', err);
  process.exit(1);
});
