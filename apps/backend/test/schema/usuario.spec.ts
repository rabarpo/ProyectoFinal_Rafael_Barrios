import type { Client } from 'pg';
import { createPgClient } from './helpers/pg-client';

/**
 * Fundación de credenciales (auth-server-sessions, PR1; design.md, "Cambios de archivos").
 * Ejercita la migración `credencial_usuario` contra un Postgres real (`seei_app`): agrega
 * `password_hash` a `Usuario` como columna aditiva y nulable (compatible con OAuth de #5, spec
 * "Columna de credencial en `Usuario`").
 */
describe('credencial_usuario', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // [R1] La columna existe tras la migración, spec "La columna existe tras la migración".
  it('[R1] declara password_hash como columna nulable de Usuario', async () => {
    const result = await client.query<{
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Usuario' AND column_name = 'password_hash'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_nullable).toBe('YES');
    expect(result.rows[0].data_type).toBe('text');
  });
});

/**
 * google-oauth-y-recuperacion, PR1 (design.md "Cambios de archivos"; spec "Columna `google_id`
 * en `Usuario`"). Ejercita la migración `google_id_usuario` contra un Postgres real (`seei_app`):
 * agrega `google_id` a `Usuario` como columna aditiva, nulable y única, apilada después de la
 * migración de credencial de `auth-server-sessions`.
 */
describe('google_id_usuario', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // [R1] La columna existe tras la migración, spec "La columna existe tras la migración".
  it('[R1] declara google_id como columna nulable y única de Usuario', async () => {
    const result = await client.query<{
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Usuario' AND column_name = 'google_id'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_nullable).toBe('YES');
    expect(result.rows[0].data_type).toBe('text');

    // Prisma expresa `@unique` como un índice único plano (no una constraint ALTER TABLE ADD
    // CONSTRAINT), igual que `password_hash`/`dni`/`codigo`/`correo` en migraciones previas.
    const uniqueIndex = await client.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'Usuario' AND indexname = 'Usuario_google_id_key'`,
    );
    expect(uniqueIndex.rows).toHaveLength(1);
    expect(uniqueIndex.rows[0].indexdef).toContain('UNIQUE');
  });
});

/**
 * bloqueo-desbloqueo-cuentas, PR1 (design.md "Cambios de archivos"; spec "Columna
 * `bloqueado_hasta` en `Usuario`"). Ejercita la migración `bloqueado_hasta_usuario` contra un
 * Postgres real (`seei_app`): agrega `bloqueado_hasta` a `Usuario` como columna aditiva y
 * nulable (mismo tipo que `creado_en`: `timestamptz(3)`), apilada después de la migración
 * `google_id_usuario`.
 */
describe('bloqueado_hasta_usuario', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // [R1] La columna existe tras la migración, spec "La columna existe tras la migración".
  it('[R1] declara bloqueado_hasta como columna nulable timestamptz(3) de Usuario', async () => {
    const result = await client.query<{
      column_name: string;
      is_nullable: string;
      data_type: string;
    }>(
      `SELECT column_name, is_nullable, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Usuario' AND column_name = 'bloqueado_hasta'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_nullable).toBe('YES');
    expect(result.rows[0].data_type).toBe('timestamp with time zone');
  });
});
