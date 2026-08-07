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
