import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * Grupo 2 — Estructura del proceso electoral (base-schema-and-migrations, tarea 2.3).
 * Ejercita la migración `electoral_process_structure` contra un Postgres real (`seei_app`).
 */
describe('electoral_process_structure', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // 2.3 RED: un ProcesoAula referenciando un Aula inexistente es rechazado por FK.
  it('rechaza un insert de ProcesoAula referenciando un Aula inexistente', async () => {
    await withTransaction(client, async () => {
      const procesoId = randomUUID();
      await client.query(
        `INSERT INTO "ProcesoElectoral"
           (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista)
         VALUES ($1, 'proceso-electoral-2-3', 'municipio', 'borrador', now(), now())`,
        [procesoId],
      );

      await withSavepoint(client, 's_2_3', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "ProcesoAula" (id, proceso_id, aula_id) VALUES ($1, $2, $3)`,
              [randomUUID(), procesoId, randomUUID()],
            ),
          { code: '23503', constraint: 'ProcesoAula_aula_id_fkey' },
        ),
      );
    });
  });
});
