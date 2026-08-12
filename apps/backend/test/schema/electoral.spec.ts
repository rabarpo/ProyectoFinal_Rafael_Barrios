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

  // 8.3 RED/GREEN (administracion-procesos-electorales, design.md D1): el delta declarado contra
  // este grupo agrega `publico_objetivo`/`alcance` NOT NULL sin default (el `ADD DEFAULT` +
  // `DROP DEFAULT` de la migración es transitorio, solo para poblar filas preexistentes) y el
  // snapshot `nivel_id_snapshot`/`grado_ids_snapshot`.
  it('[D1] ProcesoElectoral tiene publico_objetivo/alcance NOT NULL sin default, y el snapshot de nivel/grado', async () => {
    const result = await client.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ProcesoElectoral'`,
    );

    const columnas = new Map(result.rows.map((r) => [r.column_name, r]));

    const publicoObjetivo = columnas.get('publico_objetivo');
    expect(publicoObjetivo?.is_nullable).toBe('NO');
    expect(publicoObjetivo?.column_default).toBeNull();

    const alcance = columnas.get('alcance');
    expect(alcance?.is_nullable).toBe('NO');
    expect(alcance?.column_default).toBeNull();

    const nivelIdSnapshot = columnas.get('nivel_id_snapshot');
    expect(nivelIdSnapshot?.is_nullable).toBe('YES');

    const gradoIdsSnapshot = columnas.get('grado_ids_snapshot');
    expect(gradoIdsSnapshot?.is_nullable).toBe('NO');
  });

  // 2.3 RED: un ProcesoAula referenciando un Aula inexistente es rechazado por FK.
  it('rechaza un insert de ProcesoAula referenciando un Aula inexistente', async () => {
    await withTransaction(client, async () => {
      const procesoId = randomUUID();
      await client.query(
        `INSERT INTO "ProcesoElectoral"
           (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista,
            publico_objetivo, alcance)
         VALUES ($1, 'proceso-electoral-2-3', 'municipio', 'borrador', now(), now(),
                 'estudiantes', 'institucion')`,
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
