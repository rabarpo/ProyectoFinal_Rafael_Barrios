import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * reportes-y-exportaciones (#18, PR1; design.md D2/D3). Ejercita la migración `reporte` contra un
 * Postgres real (`seei_app`): los 3 enums nuevos, la AUSENCIA deliberada de
 * `@@unique([proceso_id, dimension, formato])` (D3 — dos filas con la misma combinación conviven
 * sin 23505), `solicitado_por` NOT NULL, ambas FK RESTRICT, y los dos índices que sostienen el
 * despachador y la historia de solicitudes. Mismo patrón que `test/schema/actas.spec.ts`.
 */
describe('reporte', () => {
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
      [procesoId, `proceso-reportes-${sufijo}`],
    );
    return procesoId;
  }

  async function crearUsuario(query: Client['query'], sufijo: string): Promise<string> {
    const usuarioId = randomUUID();
    await query(
      `INSERT INTO "Usuario" (id, nombres, dni, codigo, correo, rol)
       VALUES ($1, $2, $3, $4, $5, 'director')`,
      [
        usuarioId,
        `Usuario Reportes ${sufijo}`,
        `dni-reportes-${sufijo}`,
        `cod-reportes-${sufijo}`,
        `reportes-${sufijo}@example.com`,
      ],
    );
    return usuarioId;
  }

  async function crearReporte(
    query: Client['query'],
    procesoId: string,
    solicitadoPor: string,
    overrides: {
      dimension?: string;
      formato?: string;
      estado?: string;
      contenido?: unknown;
    } = {},
  ): Promise<string> {
    const reporteId = randomUUID();
    await query(
      `INSERT INTO "Reporte" (id, proceso_id, dimension, formato, estado, solicitado_por, contenido)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        reporteId,
        procesoId,
        overrides.dimension ?? 'resultados',
        overrides.formato ?? 'pdf',
        overrides.estado ?? 'borrador',
        solicitadoPor,
        JSON.stringify(overrides.contenido ?? { version: 1, secciones: [] }),
      ],
    );
    return reporteId;
  }

  // [2.1] Los 3 enums tienen sus valores exactos.
  it('[2.1] DimensionReporte, FormatoReporte y EstadoReporte exponen sus valores exactos', async () => {
    const dimension = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."DimensionReporte"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(dimension.rows.map((r) => r.enumlabel)).toEqual([
      'participacion',
      'votantes',
      'abstenciones',
      'resultados',
      'candidatos',
      'consultas',
    ]);

    const formato = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."FormatoReporte"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(formato.rows.map((r) => r.enumlabel)).toEqual(['excel', 'pdf', 'csv']);

    const estado = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."EstadoReporte"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(estado.rows.map((r) => r.enumlabel)).toEqual(['borrador', 'emitida', 'fallido']);
  });

  // [2.2] D3: dos filas con el mismo (proceso_id, dimension, formato) conviven SIN 23505 — esta
  // prueba debe FALLAR si alguien agrega el @@unique por "simetría" con Acta.
  it('[2.2] dos Reporte con el mismo (proceso_id, dimension, formato) conviven sin 23505 (D3)', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-2');
      const usuarioId = await crearUsuario(client.query.bind(client), '2-2');

      const primero = await crearReporte(client.query.bind(client), procesoId, usuarioId, {
        dimension: 'votantes',
        formato: 'csv',
      });
      const segundo = await crearReporte(client.query.bind(client), procesoId, usuarioId, {
        dimension: 'votantes',
        formato: 'csv',
      });

      expect(primero).not.toBe(segundo);

      const filas = await client.query<{ id: string }>(
        `SELECT id FROM "Reporte" WHERE proceso_id = $1 AND dimension = 'votantes' AND formato = 'csv'`,
        [procesoId],
      );
      expect(filas.rows).toHaveLength(2);
    });
  });

  // [2.3] solicitado_por NOT NULL rechaza NULL.
  it('[2.3] solicitado_por NOT NULL rechaza NULL', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-3');

      await withSavepoint(client, 's_2_3', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Reporte" (id, proceso_id, dimension, formato, estado, solicitado_por, contenido)
               VALUES ($1, $2, 'candidatos', 'excel', 'borrador', NULL, '{}'::jsonb)`,
              [randomUUID(), procesoId],
            ),
          { code: '23502' },
        ),
      );
    });
  });

  // [2.4] DELETE de un Usuario con Reporte(s) asociados falla por RESTRICT.
  it('[2.4] DELETE de un Usuario con Reporte(s) asociados falla por RESTRICT', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-4');
      const usuarioId = await crearUsuario(client.query.bind(client), '2-4');
      await crearReporte(client.query.bind(client), procesoId, usuarioId);

      await withSavepoint(client, 's_2_4', () =>
        expectPgError(() => client.query(`DELETE FROM "Usuario" WHERE id = $1`, [usuarioId]), {
          code: '23503',
          constraint: 'Reporte_solicitado_por_fkey',
        }),
      );
    });
  });

  // [2.5] DELETE de un ProcesoElectoral con Reporte(s) asociados falla por RESTRICT.
  it('[2.5] DELETE de un ProcesoElectoral con Reporte(s) asociados falla por RESTRICT', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client), '2-5');
      const usuarioId = await crearUsuario(client.query.bind(client), '2-5');
      await crearReporte(client.query.bind(client), procesoId, usuarioId);

      await withSavepoint(client, 's_2_5', () =>
        expectPgError(() => client.query(`DELETE FROM "ProcesoElectoral" WHERE id = $1`, [procesoId]), {
          code: '23503',
          constraint: 'Reporte_proceso_id_fkey',
        }),
      );
    });
  });

  // [2.6] Existen los dos índices declarados en D2.
  it('[2.6] existen Reporte_estado_creado_en_idx y Reporte_proceso_id_dimension_formato_creado_en_idx', async () => {
    const result = await client.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'Reporte'
         AND indexname IN ('Reporte_estado_creado_en_idx', 'Reporte_proceso_id_dimension_formato_creado_en_idx')
       ORDER BY indexname`,
    );
    expect(result.rows.map((r) => r.indexname)).toEqual([
      'Reporte_estado_creado_en_idx',
      'Reporte_proceso_id_dimension_formato_creado_en_idx',
    ]);
  });
});
