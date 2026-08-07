import type { Client } from 'pg';
import { createPgClient, withTransaction } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * Self-test del arnés `test:schema` (base-schema-and-migrations, tareas 0.7/0.8). Ejercita
 * `expectPgError` contra una tabla TEMP con un `CHECK` real, sin depender de ningún modelo de
 * dominio de #2 (que todavía no existe en PR0). Prueba las dos ramas del helper:
 *   1. La violación real del `CHECK` se detecta con el código `23514` y el nombre exacto de la
 *      restricción.
 *   2. Si la operación es aceptada en vez de rechazada, el helper lanza su propio error en lugar
 *      de pasar en silencio.
 */
describe('expectPgError (arnés test:schema) — self-test contra tabla TEMP con CHECK', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  it('detecta el rechazo real (23514) de un CHECK violado', async () => {
    await withTransaction(client, async () => {
      await client.query(`
        CREATE TEMP TABLE tabla_check_temporal (
          id integer,
          valor integer,
          CONSTRAINT valor_positivo_chk CHECK (valor > 0)
        ) ON COMMIT DROP
      `);

      await expectPgError(
        () => client.query('INSERT INTO tabla_check_temporal (id, valor) VALUES (1, -1)'),
        { code: '23514', constraint: 'valor_positivo_chk' },
      );
    });
  });

  it('lanza su propio error si la operación fue aceptada en vez de rechazada', async () => {
    await withTransaction(client, async () => {
      await client.query(`
        CREATE TEMP TABLE tabla_check_temporal_aceptada (
          id integer,
          valor integer,
          CONSTRAINT valor_positivo_aceptada_chk CHECK (valor > 0)
        ) ON COMMIT DROP
      `);

      await expect(
        expectPgError(
          () => client.query('INSERT INTO tabla_check_temporal_aceptada (id, valor) VALUES (1, 1)'),
          { code: '23514' },
        ),
      ).rejects.toThrow(/Se esperaba 23514 y la operación fue aceptada/);
    });
  });
});
