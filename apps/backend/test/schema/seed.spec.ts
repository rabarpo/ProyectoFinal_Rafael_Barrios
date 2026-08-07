import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Client } from 'pg';
import { createPgClient } from './helpers/pg-client';

// Grupo 1 — Seeds estructurales restringidos a no-producción (base-schema-and-migrations,
// tareas 1.14-1.16; spec "Seeds estructurales restringidos a no-producción"). Ejecuta
// `prisma/seed.ts` como subproceso real (mismo comando que `db:seed`) para verificar el
// comportamiento observable del script, no solo su código fuente.

const backendRoot = path.resolve(__dirname, '../..');

function runSeed(nodeEnv: string) {
  return spawnSync('pnpm', ['exec', 'tsx', 'prisma/seed.ts'], {
    cwd: backendRoot,
    env: { ...process.env, NODE_ENV: nodeEnv },
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
}

async function contarAniosEscolares(client: Client): Promise<number> {
  const result = await client.query<{ count: string }>('SELECT count(*)::text AS count FROM "AnioEscolar"');
  return Number(result.rows[0]?.count ?? '0');
}

describe('seed estructural (prisma/seed.ts)', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // [R9a] El seed se rechaza en producción.
  it('[R9a] termina con código de salida distinto de 0 y sin crear filas cuando NODE_ENV=production', async () => {
    const filasAntes = await contarAniosEscolares(client);

    const result = runSeed('production');

    expect(result.status).not.toBe(0);
    const filasDespues = await contarAniosEscolares(client);
    expect(filasDespues).toBe(filasAntes);
  }, 30000);

  // [R9b] Actualizado por auth-server-sessions (PR1, tarea 3.4): la columna `password_hash`
  // ahora existe por diseño (spec "Columna de credencial en `Usuario`") y el seed la puebla con
  // un hash argon2id — nunca con la contraseña en texto plano ni con ningún identificador OAuth
  // (fuera de alcance, spec "Fuera de alcance").
  it('[R9b] fuera de producción crea filas de Usuario con password_hash argon2id, sin la contraseña en texto plano ni identificador OAuth', async () => {
    const result = runSeed('development');

    expect(result.status).toBe(0);

    const usuarios = await client.query<{ password_hash: string | null }>(
      `SELECT * FROM "Usuario" WHERE codigo LIKE 'seed-%'`,
    );
    expect(usuarios.rows.length).toBeGreaterThanOrEqual(5);
    for (const fila of usuarios.rows) {
      const columnas = Object.keys(fila);
      expect(fila.password_hash).toMatch(/^\$argon2id\$/);
      expect(fila.password_hash).not.toContain('seed-password-dev-2026');
      expect(columnas.some((c) => c.toLowerCase().includes('oauth'))).toBe(false);
    }
  }, 30000);

  // 4.6 [D7] El seed crea el singleton Configuracion sin ninguna columna de secreto SMTP.
  it('fuera de producción crea el singleton Configuracion sin campos de secreto SMTP', async () => {
    const result = runSeed('development');

    expect(result.status).toBe(0);

    const configuraciones = await client.query(`SELECT * FROM "Configuracion" WHERE clave = 'institucional'`);
    expect(configuraciones.rows.length).toBe(1);

    const columnas = Object.keys(configuraciones.rows[0]);
    const columnasPermitidas = new Set([
      'id',
      'clave',
      'anio_escolar_id',
      'smtp_host',
      'smtp_puerto',
      'smtp_remitente',
      'actualizado_en',
    ]);
    for (const columna of columnas) {
      expect(columnasPermitidas.has(columna)).toBe(true);
    }
    expect(columnas.some((c) => c.toLowerCase().includes('password'))).toBe(false);
    expect(columnas.some((c) => c.toLowerCase().includes('secret'))).toBe(false);
  }, 30000);
});
