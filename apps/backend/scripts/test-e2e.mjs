#!/usr/bin/env node
// Orquesta el e2e del backend (tarea 5.8, design.md "Estrategia de testing"):
//   up -d --wait (docker-compose.test.yml) -> prisma migrate deploy -> Jest -> down -v
//
// Lee `infra/docker/.env.test` (no versionado) para las contraseñas/URLs de Postgres y Redis
// efímeros en los puertos alternos 5433/6380. Si el proceso ya trae esas variables definidas
// (p. ej. en CI), no las sobrescribe.

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(__dirname, '..');
const dockerRoot = resolve(backendRoot, '../../infra/docker');
const composeFile = resolve(dockerRoot, 'docker-compose.test.yml');
const envFile = resolve(dockerRoot, '.env.test');

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
    cwd: backendRoot,
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} salió con código ${result.status}`);
  }
  return result;
}

loadEnvFile(envFile);

const composeArgs = ['compose', '--env-file', envFile, '-f', composeFile];

let jestExitCode = 1;
try {
  run('docker', [...composeArgs, 'up', '-d', '--wait']);
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy']);
  const jestResult = spawnSync('pnpm', ['exec', 'jest', '--config', 'test/jest-e2e.config.ts'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: backendRoot,
    env: process.env,
  });
  jestExitCode = jestResult.status ?? 1;
} finally {
  spawnSync('docker', [...composeArgs, 'down', '-v'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: backendRoot,
    env: process.env,
  });
}

process.exit(jestExitCode);
