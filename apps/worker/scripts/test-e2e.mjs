#!/usr/bin/env node
// cierre-escrutinio-actas (#17, PR5; design.md D11, tarea 22.5). Copia estructural de
// `apps/backend/scripts/test-e2e.mjs` (tarea 5.8 de outbox-correo-comprobante-autenticado):
//   up -d --wait (docker-compose.test.yml) -> prisma migrate deploy -> Vitest -> down -v
//
// Reutiliza el MISMO Postgres/Redis efímero del backend (`infra/docker/.env.test`, puertos
// 5433/6380) — el worker no necesita un segundo compose de test. Si el proceso ya trae
// DATABASE_URL definida (p. ej. CI), no la sobrescribe.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerRoot = resolve(__dirname, '..');
const dockerRoot = resolve(workerRoot, '../../infra/docker');
const composeFile = resolve(dockerRoot, 'docker-compose.test.yml');
const envFile = resolve(dockerRoot, '.env.test');
const backendSchema = resolve(workerRoot, '../backend/prisma/schema.prisma');

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: workerRoot,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} salió con código ${result.status}`);
  }
  return result;
}

loadEnvFile(envFile);

const composeArgs = ['compose', '--env-file', envFile, '-f', composeFile];

let vitestExitCode = 1;
try {
  run('docker', [...composeArgs, 'up', '-d', '--wait']);
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', backendSchema]);
  const vitestResult = spawnSync(
    'pnpm',
    ['exec', 'vitest', 'run', '--config', 'vitest.e2e.config.ts'],
    { stdio: 'inherit', shell: process.platform === 'win32', cwd: workerRoot, env: process.env },
  );
  vitestExitCode = vitestResult.status ?? 1;
} finally {
  spawnSync('docker', [...composeArgs, 'down', '-v'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: workerRoot,
    env: process.env,
  });
}

process.exit(vitestExitCode);
