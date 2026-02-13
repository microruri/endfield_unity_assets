#!/usr/bin/env node
'use strict';

const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const DEFAULT_CLI_PATH = path.join(ROOT, 'AnimeStudio.CLI.exe');
const OUTPUT_DIR = path.join(ROOT, 'assets');
const LOG_DIR = path.join(ROOT, 'assets', 'log');
const ASSETS_MAP_PATH = path.join(ROOT, 'assets', 'assets_map.txt');
const PROGRESS_PATH = path.join(ROOT, 'assets', 'export_progress.txt');

async function ensurePathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function relFromRoot(targetPath) {
  return path.relative(ROOT, targetPath).split(path.sep).join('/');
}

function sanitizeLogName(input) {
  return input.replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function walkChkFiles(inputPath) {
  const stat = await fs.stat(inputPath);
  if (stat.isFile()) {
    return inputPath.toLowerCase().endsWith('.chk') ? [inputPath] : [];
  }

  const result = [];
  const stack = [inputPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.chk')) {
        result.push(fullPath);
      }
    }
  }

  result.sort((a, b) => a.localeCompare(b));
  return result;
}

async function listFilesWithStat(baseDir) {
  const map = new Map();
  const exists = await ensurePathExists(baseDir);
  if (!exists) {
    return map;
  }

  const stack = [baseDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stat = await fs.stat(fullPath);
      const rel = path.relative(baseDir, fullPath).split(path.sep).join('/');
      map.set(rel, { size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return map;
}

function compareByName(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function buildTreeManifest(paths) {
  const root = { dirs: new Map(), files: [] };

  for (const relPath of paths) {
    const parts = relPath.split('/').filter(Boolean);
    if (parts.length === 0) {
      continue;
    }

    let node = root;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        node.files.push(part);
        continue;
      }
      if (!node.dirs.has(part)) {
        node.dirs.set(part, { dirs: new Map(), files: [] });
      }
      node = node.dirs.get(part);
    }
  }

  const lines = ['.'];

  function walk(node, prefix) {
    const dirNames = Array.from(node.dirs.keys()).sort(compareByName);
    const fileNames = Array.from(new Set(node.files)).sort(compareByName);

    for (const dirName of dirNames) {
      lines.push(`${prefix}├─${dirName}`);
      walk(node.dirs.get(dirName), `${prefix}│  `);
    }

    for (const fileName of fileNames) {
      lines.push(`${prefix}├─${fileName}`);
    }
  }

  walk(root, '');
  return lines.join('\n');
}

function runExport(cliPath, chkFilePath) {
  return new Promise((resolve) => {
    const args = [chkFilePath, OUTPUT_DIR, '--game', 'ArknightsEndfield', '--map_op', 'All', '--map_type', 'None'];
    const child = spawn(cliPath, args, {
      cwd: ROOT,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      stderr += `\n[spawn-error] ${error.stack || error.message}\n`;
      resolve({
        code: -1,
        stdout,
        stderr
      });
    });

    child.on('close', (code) => {
      resolve({
        code: typeof code === 'number' ? code : -1,
        stdout,
        stderr
      });
    });
  });
}

async function writeLog(logPath, data) {
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, data, 'utf8');
}

async function readProgress(progressPath) {
  if (!(await ensurePathExists(progressPath))) {
    return new Set();
  }
  const content = await fs.readFile(progressPath, 'utf8');
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return new Set(lines);
}

async function appendProgress(progressPath, chkFileName) {
  await fs.appendFile(progressPath, `${chkFileName}\n`, 'utf8');
}

function usage() {
  console.error('Usage: node .\\export.js <input-path> [--cli <path-to-AnimeStudio.CLI.exe>]');
}

function parseArgs(argv) {
  let inputArg = '';
  let cliArg = '';

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      return { showHelp: true };
    }
    if (token === '--cli' || token === '-c') {
      if (i + 1 >= argv.length) {
        throw new Error('Missing value for --cli');
      }
      cliArg = argv[i + 1];
      i += 1;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`);
    }
    if (inputArg) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    inputArg = token;
  }

  if (!inputArg) {
    return { showHelp: true };
  }

  return {
    showHelp: false,
    inputArg,
    cliArg
  };
}

function resolveCliPath(cliArg) {
  const byArg = cliArg && cliArg.trim();
  const byEnv = process.env.ANIMESTUDIO_CLI_PATH && process.env.ANIMESTUDIO_CLI_PATH.trim();
  const picked = byArg || byEnv || DEFAULT_CLI_PATH;
  return path.isAbsolute(picked) ? picked : path.resolve(ROOT, picked);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message || String(err));
    usage();
    process.exitCode = 1;
    return;
  }
  if (parsed.showHelp) {
    usage();
    process.exitCode = 0;
    return;
  }

  const inputArg = parsed.inputArg;
  const cliPath = resolveCliPath(parsed.cliArg);

  const inputPath = path.resolve(ROOT, inputArg);
  if (!(await ensurePathExists(inputPath))) {
    console.error(`Input path does not exist: ${inputPath}`);
    process.exitCode = 1;
    return;
  }

  if (!(await ensurePathExists(cliPath))) {
    console.error(`AnimeStudio.CLI.exe not found: ${cliPath}`);
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.mkdir(path.dirname(ASSETS_MAP_PATH), { recursive: true });
  const doneSet = await readProgress(PROGRESS_PATH);

  const chkFiles = await walkChkFiles(inputPath);
  if (chkFiles.length === 0) {
    console.log('No .chk files found. Nothing to export.');
    await fs.writeFile(ASSETS_MAP_PATH, '', 'utf8');
    return;
  }

  const beforeSnapshot = await listFilesWithStat(OUTPUT_DIR);

  let failedCount = 0;
  let skippedCount = 0;
  for (let i = 0; i < chkFiles.length; i += 1) {
    const chkPath = chkFiles[i];
    const relativeChk = relFromRoot(chkPath);
    const index = String(i + 1).padStart(4, '0');
    const chkFileName = path.basename(chkPath);
    if (doneSet.has(chkFileName)) {
      skippedCount += 1;
      console.log(`[${i + 1}/${chkFiles.length}] skip ${relativeChk} (already exported)`);
      continue;
    }

    const filePart = sanitizeLogName(path.basename(chkPath, path.extname(chkPath)));
    const logName = `${filePart}.log`;
    const logPath = path.join(LOG_DIR, logName);

    const startedAt = new Date();
    const startedHr = process.hrtime.bigint();
    const result = await runExport(cliPath, chkPath);
    const durationMs = Number(process.hrtime.bigint() - startedHr) / 1e6;
    const endedAt = new Date();

    if (result.code !== 0) {
      failedCount += 1;
    } else {
      await appendProgress(PROGRESS_PATH, chkFileName);
      doneSet.add(chkFileName);
    }

    const logContent = [
      `duration_ms=${durationMs.toFixed(2)}`,
      `exit_code=${result.code}`,
      '',
      '=== STDOUT ===',
      result.stdout || '(empty)',
      '',
      '=== STDERR ===',
      result.stderr || '(empty)',
      ''
    ].join('\n');

    await writeLog(logPath, logContent);
    console.log(`[${i + 1}/${chkFiles.length}] exit=${result.code} ${relativeChk} -> ${relFromRoot(logPath)}`);
  }

  const afterSnapshot = await listFilesWithStat(OUTPUT_DIR);
  const exportedFiles = [];
  for (const [relPath, afterMeta] of afterSnapshot.entries()) {
    const beforeMeta = beforeSnapshot.get(relPath);
    if (!beforeMeta) {
      exportedFiles.push(relPath);
      continue;
    }
    if (beforeMeta.size !== afterMeta.size || beforeMeta.mtimeMs !== afterMeta.mtimeMs) {
      exportedFiles.push(relPath);
    }
  }

  exportedFiles.sort((a, b) => compareByName(path.basename(a), path.basename(b)) || compareByName(a, b));
  const manifestContent = buildTreeManifest(exportedFiles);
  await fs.writeFile(ASSETS_MAP_PATH, manifestContent, 'utf8');

  console.log(`Finished. total_chk=${chkFiles.length}, skipped=${skippedCount}, failed=${failedCount}, progress=${relFromRoot(PROGRESS_PATH)}, assets_map=${relFromRoot(ASSETS_MAP_PATH)}`);
  if (failedCount > 0) {
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
