import { Client } from 'pg';

// Helper compartido del arnés `test:schema` (design.md, D3). Conecta con `DATABASE_URL`
// (rol `seei_app`, sin privilegios de DDL) porque las restricciones bajo prueba (FK, `CHECK`,
// índice único parcial) deben ser rechazadas por el mismo rol que usa la aplicación en runtime.
//
// Patrón de aislamiento sin orden implícito: `BEGIN` al inicio del test, `SAVEPOINT` antes de cada
// intento que se espera rechazado, `ROLLBACK TO` inmediatamente después, y `ROLLBACK` final en el
// `afterEach` del caller — así la base queda intacta entre archivos y ningún test depende del
// anterior.

export async function createPgClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  return client;
}

// append-only-audit-engine (design.md D5, tarea 2.1): la capa de trigger se prueba con el rol
// propietario `seei_migrator` (MIGRATION_DATABASE_URL) porque Postgres verifica privilegios
// ANTES de disparar un trigger — con `seei_app` todo UPDATE/DELETE da 42501 y el trigger nunca
// corre. Sin este cliente, la capa de trigger queda sin prueba y un `DROP TRIGGER` accidental
// pasaría verde.
export async function createMigratorPgClient(): Promise<Client> {
  const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await client.connect();
  return client;
}

export async function withTransaction<T>(
  client: Client,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

export async function withSavepoint<T>(
  client: Client,
  name: string,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    return await fn();
  } finally {
    await client.query(`ROLLBACK TO ${name}`);
  }
}
