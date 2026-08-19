import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * cierre-escrutinio-actas (#17, PR1; design.md D2). Ejercita la migración
 * `acta_escrutinio_pdf` contra un Postgres real (`seei_app`): los 5 valores de `TipoActa`, los 3
 * de `EstadoActa`, el CHECK que deprecia `resultados`, el índice único `(proceso_id, tipo)`, la
 * columna `contenido` como JSONB consultable, y el índice `(estado, creado_en)` del dispatcher.
 * Mismo patrón que `test/schema/outbox.spec.ts`.
 */
describe('acta_escrutinio_pdf', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  async function crearProceso(query: Client['query'], sufijo: string): Promise<string> {
    const procesoId = randomUUID();
    await query(
      `INSERT INTO "ProcesoElectoral"
         (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista,
          publico_objetivo, alcance)
       VALUES ($1, $2, 'municipio', 'borrador', now(), now(), 'estudiantes', 'institucion')`,
      [procesoId, `proceso-actas-${sufijo}`],
    );
    return procesoId;
  }

  async function crearActa(
    query: Client['query'],
    procesoId: string,
    overrides: { tipo?: string; estado?: string; contenido?: unknown } = {},
  ): Promise<string> {
    const actaId = randomUUID();
    await query(
      `INSERT INTO "Acta" (id, proceso_id, tipo, estado, contenido)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        actaId,
        procesoId,
        overrides.tipo ?? 'apertura',
        overrides.estado ?? 'borrador',
        JSON.stringify(overrides.contenido ?? { nota: 'contenido de prueba' }),
      ],
    );
    return actaId;
  }

  // [2.1] TipoActa tiene los 5 valores; EstadoActa tiene los 3.
  it('[2.1] TipoActa expone los 5 valores y EstadoActa los 3', async () => {
    const tipoActa = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."TipoActa"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(tipoActa.rows.map((r) => r.enumlabel)).toEqual([
      'apertura',
      'cierre',
      'resultados',
      'escrutinio',
      'oficial',
    ]);

    const estadoActa = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."EstadoActa"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(estadoActa.rows.map((r) => r.enumlabel)).toEqual(['borrador', 'emitida', 'fallido']);
  });

  // [2.2] INSERT con tipo='resultados' es rechazado por el CHECK que lo deprecia.
  it("[2.2] rechaza un insert de Acta con tipo='resultados' (CHECK)", async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-2');

      await withSavepoint(client, 's_2_2', () =>
        expectPgError(() => crearActa(client.query.bind(client), procesoId, { tipo: 'resultados' }), {
          code: '23514',
          constraint: 'acta_tipo_no_deprecado_chk',
        }),
      );
    });
  });

  // [2.3] Segunda Acta con el mismo (proceso_id, tipo) es rechazada por el índice único.
  it('[2.3] rechaza una segunda Acta con el mismo (proceso_id, tipo) (23505)', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-3');
      await crearActa(client.query.bind(client), procesoId, { tipo: 'cierre' });

      await withSavepoint(client, 's_2_3', () =>
        expectPgError(() => crearActa(client.query.bind(client), procesoId, { tipo: 'cierre' }), {
          code: '23505',
          constraint: 'Acta_proceso_id_tipo_key',
        }),
      );
    });
  });

  // [2.4] contenido acepta un objeto y se consulta con el operador -> / ->>.
  it("[2.4] contenido acepta un objeto y se consulta con contenido->'cuadre'->>'padron_total'", async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-4');
      const actaId = await crearActa(client.query.bind(client), procesoId, {
        tipo: 'escrutinio',
        contenido: { cuadre: { padron_total: 42 } },
      });

      const result = await client.query<{ padron_total: string }>(
        `SELECT contenido->'cuadre'->>'padron_total' AS padron_total FROM "Acta" WHERE id = $1`,
        [actaId],
      );

      expect(result.rows[0].padron_total).toBe('42');
    });
  });

  // [2.5] contenido inválido como JSON es rechazado por el motor.
  it('[2.5] rechaza un contenido inválido como JSON', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-5');

      await withSavepoint(client, 's_2_5', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Acta" (id, proceso_id, tipo, estado, contenido)
               VALUES ($1, $2, 'apertura', 'borrador', 'no es json'::jsonb)`,
              [randomUUID(), procesoId],
            ),
          { code: '22P02' },
        ),
      );
    });
  });

  // [2.6] El índice Acta_estado_creado_en_idx existe.
  it('[2.6] el índice Acta_estado_creado_en_idx existe', async () => {
    const result = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'Acta' AND indexname = 'Acta_estado_creado_en_idx'`,
    );
    expect(result.rows).toHaveLength(1);
  });
});
