import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';
import { getIndexDef } from './helpers/catalog';

/**
 * Grupo 1 — Identidad y árbol académico (base-schema-and-migrations, tareas 1.9-1.12).
 * Ejercita la migración `identity_and_academic_tree` contra un Postgres real (`seei_app`).
 */
describe('identity_and_academic_tree', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  // [R1a] El árbol académico se construye completo: Aula.turno existe, y la cadena de FK
  // Nivel -> Grado -> Seccion -> Aula -> Matricula existe con las cardinalidades declaradas.
  it('[R1a] declara la columna Aula.turno y la cadena de FK del árbol académico', async () => {
    const columna = await client.query<{ column_name: string; udt_name: string }>(
      `SELECT column_name, udt_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Aula' AND column_name = 'turno'`,
    );
    expect(columna.rows).toHaveLength(1);
    expect(columna.rows[0].udt_name).toBe('Turno');

    const cadenaFk = [
      'Grado_nivel_id_fkey',
      'Seccion_grado_id_fkey',
      'Seccion_anio_escolar_id_fkey',
      'Aula_grado_id_fkey',
      'Aula_seccion_id_fkey',
      'Aula_anio_escolar_id_fkey',
      'Matricula_usuario_id_fkey',
      'Matricula_aula_id_fkey',
      'Matricula_anio_escolar_id_fkey',
    ];
    for (const nombreFk of cadenaFk) {
      const result = await client.query<{ conname: string }>(
        `SELECT conname FROM pg_constraint WHERE conname = $1 AND contype = 'f'`,
        [nombreFk],
      );
      expect(result.rows).toHaveLength(1);
    }
  });

  // [R1b] Una FK inválida en el árbol académico es rechazada.
  it('[R1b] rechaza un insert de Seccion referenciando un Grado inexistente', async () => {
    await withTransaction(client, async () => {
      const anioId = randomUUID();
      await client.query(
        `INSERT INTO "AnioEscolar" (id, nombre, activo) VALUES ($1, $2, false)`,
        [anioId, `anio-r1b-${anioId}`],
      );

      await withSavepoint(client, 's_r1b', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Seccion" (id, nombre, grado_id, anio_escolar_id)
               VALUES ($1, 'seccion-huerfana', $2, $3)`,
              [randomUUID(), randomUUID(), anioId],
            ),
          { code: '23503', constraint: 'Seccion_grado_id_fkey' },
        ),
      );
    });
  });

  // [R2] Un segundo AnioEscolar activo es rechazado por el índice único parcial (SQL raw, D2/D5).
  it('[R2] rechaza un segundo AnioEscolar activo mientras uno ya está activo', async () => {
    await withTransaction(client, async () => {
      // Neutraliza, solo dentro de esta transacción (se revierte en el `finally` de
      // `withTransaction`), cualquier AnioEscolar activo dejado por otra suite (p. ej.
      // `seed.spec.ts`, que persiste filas reales fuera de transacción) — el escenario exige
      // "un AnioEscolar existente con activo = true" controlado por el propio test.
      await client.query(`UPDATE "AnioEscolar" SET activo = false WHERE activo = true`);

      const primeroId = randomUUID();
      await client.query(
        `INSERT INTO "AnioEscolar" (id, nombre, activo) VALUES ($1, $2, true)`,
        [primeroId, `anio-r2-primero-${primeroId}`],
      );

      const segundoId = randomUUID();
      await withSavepoint(client, 's_r2', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "AnioEscolar" (id, nombre, activo) VALUES ($1, $2, true)`,
              [segundoId, `anio-r2-segundo-${segundoId}`],
            ),
          { code: '23505', constraint: 'anio_escolar_activo_unico_idx' },
        ),
      );
    });
  });

  // 1.12 GREEN: el índice único parcial existe en pg_indexes con la definición esperada
  // (deriva del lado SQL raw, design.md D2).
  it('expone anio_escolar_activo_unico_idx en pg_indexes con la cláusula WHERE esperada', async () => {
    const indice = await getIndexDef(client, 'anio_escolar_activo_unico_idx');
    expect(indice).not.toBeNull();
    expect(indice?.indexdef).toContain('WHERE (activo = true)');
  });
});
