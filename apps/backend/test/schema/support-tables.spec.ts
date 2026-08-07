import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * Grupo 4 — Tablas de soporte (base-schema-and-migrations, tarea 4.3).
 * Ejercita la migración `support_tables` contra un Postgres real (`seei_app`).
 */
describe('support_tables', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // 4.3 RED [R7]: una Acta referenciando un ProcesoElectoral existente es aceptada.
  it('[R7] acepta un insert de Acta referenciando un ProcesoElectoral existente', async () => {
    await withTransaction(client, async () => {
      const procesoId = randomUUID();
      await client.query(
        `INSERT INTO "ProcesoElectoral"
           (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista)
         VALUES ($1, 'proceso-electoral-4-3', 'municipio', 'borrador', now(), now())`,
        [procesoId],
      );

      const result = await client.query(
        `INSERT INTO "Acta" (id, proceso_id, tipo, estado, contenido)
         VALUES ($1, $2, 'apertura', 'borrador', 'contenido de prueba') RETURNING id`,
        [randomUUID(), procesoId],
      );

      expect(result.rows[0].id).toBeDefined();
    });
  });

  // Complemento negativo: Acta referenciando un ProcesoElectoral inexistente es rechazada por FK.
  it('rechaza un insert de Acta referenciando un ProcesoElectoral inexistente', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_4_3_neg', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Acta" (id, proceso_id, tipo, estado, contenido)
               VALUES ($1, $2, 'apertura', 'borrador', 'contenido de prueba')`,
              [randomUUID(), randomUUID()],
            ),
          { code: '23503', constraint: 'Acta_proceso_id_fkey' },
        ),
      );
    });
  });
});
