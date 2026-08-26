import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * notificaciones (#19, PR1; design.md D2/D3). Ejercita la migración
 * `notificacion_bandeja_interna` contra Postgres real (`seei_app`): los valores nuevos de
 * `TipoNotificacion`/`EventoNotificacion`, las columnas nuevas de `Notificacion` (`NOT NULL` sin
 * `usuario_id`/`evento`, `job_correo_id` nullable), el índice único de deduplicación
 * `(proceso_id, evento, usuario_id)` con `NULL` no colisionante, el `origen` de `JobCorreo` con su
 * `DEFAULT 'comprobante'` en filas preexistentes, y los 2 índices parciales de D3. Mismo patrón
 * de `withTransaction`/`withSavepoint` que `test/schema/outbox.spec.ts` y `actas.spec.ts`.
 */
describe('notificacion_bandeja_interna', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  async function crearUsuario(query: Client['query'], sufijo: string): Promise<string> {
    const usuarioId = randomUUID();
    await query(
      `INSERT INTO "Usuario" (id, nombres, dni, codigo, correo, rol, estado)
       VALUES ($1, 'Usuario Notificaciones Test', $2, $3, $4, 'estudiante', 'activo')`,
      [
        usuarioId,
        `dni-notif-${sufijo}`,
        `codigo-notif-${sufijo}`,
        `correo-notif-${sufijo}@seei.local`,
      ],
    );
    return usuarioId;
  }

  async function crearProceso(query: Client['query'], sufijo: string): Promise<string> {
    const procesoId = randomUUID();
    await query(
      `INSERT INTO "ProcesoElectoral"
         (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista,
          publico_objetivo, alcance)
       VALUES ($1, $2, 'municipio', 'borrador', now(), now(), 'estudiantes', 'institucion')`,
      [procesoId, `proceso-notif-${sufijo}`],
    );
    return procesoId;
  }

  async function crearJobCorreo(
    query: Client['query'],
    usuarioId: string,
    overrides: { origen?: string } = {},
  ): Promise<string> {
    const jobId = randomUUID();
    const columnas = overrides.origen ? ', origen' : '';
    const valores = overrides.origen ? ', $5' : '';
    const params: unknown[] = [jobId, usuarioId, 'asunto', 'cuerpo'];
    if (overrides.origen) params.push(overrides.origen);
    await query(
      `INSERT INTO "JobCorreo" (id, usuario_id, asunto, cuerpo${columnas})
       VALUES ($1, $2, $3, $4${valores})`,
      params,
    );
    return jobId;
  }

  async function crearNotificacion(
    query: Client['query'],
    usuarioId: string,
    overrides: {
      procesoId?: string | null;
      evento?: string;
      jobCorreoId?: string | null;
      tipo?: string;
    } = {},
  ): Promise<string> {
    const notificacionId = randomUUID();
    await query(
      `INSERT INTO "Notificacion"
         (id, usuario_id, proceso_id, evento, titulo, cuerpo, job_correo_id, tipo)
       VALUES ($1, $2, $3, $4, 'titulo', 'cuerpo', $5, $6)`,
      [
        notificacionId,
        usuarioId,
        overrides.procesoId ?? null,
        overrides.evento ?? 'inicio_votacion',
        overrides.jobCorreoId ?? null,
        overrides.tipo ?? 'interna',
      ],
    );
    return notificacionId;
  }

  // [2.1] TipoNotificacion tiene correo+interna; EventoNotificacion los 4 valores.
  it('[2.1] TipoNotificacion expone correo+interna y EventoNotificacion los 4 valores', async () => {
    const tipoNotificacion = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."TipoNotificacion"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(tipoNotificacion.rows.map((r) => r.enumlabel)).toEqual(['correo', 'interna']);

    const eventoNotificacion = await client.query<{ enumlabel: string }>(
      `SELECT enumlabel FROM pg_enum
       WHERE enumtypid = 'public."EventoNotificacion"'::regtype
       ORDER BY enumsortorder`,
    );
    expect(eventoNotificacion.rows.map((r) => r.enumlabel)).toEqual([
      'inicio_votacion',
      'recordatorio',
      'cierre_proximo',
      'resultados',
    ]);
  });

  // [2.2] INSERT sin usuario_id/evento => error NOT NULL; job_correo_id NULL aceptado.
  it('[2.2] rechaza un INSERT de Notificacion sin usuario_id (NOT NULL)', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_2_2_usuario', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Notificacion" (id, proceso_id, evento, titulo, cuerpo)
               VALUES ($1, NULL, 'inicio_votacion', 'titulo', 'cuerpo')`,
              [randomUUID()],
            ),
          { code: '23502', constraint: undefined },
        ),
      );
    });
  });

  it('[2.2] rechaza un INSERT de Notificacion sin evento (NOT NULL)', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '2-2-evento');

      await withSavepoint(client, 's_2_2_evento', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Notificacion" (id, usuario_id, proceso_id, titulo, cuerpo)
               VALUES ($1, $2, NULL, 'titulo', 'cuerpo')`,
              [randomUUID(), usuarioId],
            ),
          { code: '23502', constraint: undefined },
        ),
      );
    });
  });

  it('[2.2] acepta job_correo_id NULL en una Notificacion interna', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '2-2-null-job');

      const notificacionId = await crearNotificacion(client.query.bind(client), usuarioId, {
        jobCorreoId: null,
      });

      const result = await client.query<{ job_correo_id: string | null }>(
        `SELECT job_correo_id FROM "Notificacion" WHERE id = $1`,
        [notificacionId],
      );
      expect(result.rows[0].job_correo_id).toBeNull();
    });
  });

  // [2.3] Segunda fila con el mismo (proceso_id, evento, usuario_id) => 23505.
  it('[2.3] rechaza una segunda Notificacion con el mismo (proceso_id, evento, usuario_id) (23505)', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '2-3');
      const procesoId = await crearProceso(client.query.bind(client), '2-3');

      await crearNotificacion(client.query.bind(client), usuarioId, {
        procesoId,
        evento: 'inicio_votacion',
      });

      await withSavepoint(client, 's_2_3', () =>
        expectPgError(
          () =>
            crearNotificacion(client.query.bind(client), usuarioId, {
              procesoId,
              evento: 'inicio_votacion',
            }),
          { code: '23505', constraint: 'Notificacion_proceso_id_evento_usuario_id_key' },
        ),
      );
    });
  });

  // [2.4] Dos filas con proceso_id IS NULL no colisionan.
  it('[2.4] acepta dos Notificacion con proceso_id NULL para el mismo usuario/evento sin colisión', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '2-4');

      const primera = await crearNotificacion(client.query.bind(client), usuarioId, {
        procesoId: null,
        evento: 'recordatorio',
      });
      const segunda = await crearNotificacion(client.query.bind(client), usuarioId, {
        procesoId: null,
        evento: 'recordatorio',
      });

      expect(primera).not.toBe(segunda);
    });
  });

  // [2.5] JobCorreo.origen default 'comprobante' en filas preexistentes; los 2 índices parciales
  // existen con su predicado.
  it("[2.5] JobCorreo.origen usa 'comprobante' por default cuando no se especifica", async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '2-5-default');
      const jobId = await crearJobCorreo(client.query.bind(client), usuarioId);

      const result = await client.query<{ origen: string }>(
        `SELECT origen FROM "JobCorreo" WHERE id = $1`,
        [jobId],
      );
      expect(result.rows[0].origen).toBe('comprobante');
    });
  });

  it("[2.5 triangulación] JobCorreo.origen acepta 'notificacion' explícito", async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '2-5-notificacion');
      const jobId = await crearJobCorreo(client.query.bind(client), usuarioId, {
        origen: 'notificacion',
      });

      const result = await client.query<{ origen: string }>(
        `SELECT origen FROM "JobCorreo" WHERE id = $1`,
        [jobId],
      );
      expect(result.rows[0].origen).toBe('notificacion');
    });
  });

  it('[2.5] los índices parciales de origen existen con su predicado exacto', async () => {
    const result = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'JobCorreo'
         AND indexname IN ('JobCorreo_pendiente_comprobante_idx', 'JobCorreo_pendiente_notificacion_idx')
       ORDER BY indexname`,
    );

    expect(result.rows).toHaveLength(2);
    const comprobante = result.rows.find((r) => r.indexname === 'JobCorreo_pendiente_comprobante_idx');
    const notificacion = result.rows.find(
      (r) => r.indexname === 'JobCorreo_pendiente_notificacion_idx',
    );
    expect(comprobante?.indexdef).toContain("WHERE ((estado = 'pendiente'::\"EstadoJobCorreo\") AND (origen = 'comprobante'::\"OrigenJobCorreo\"))");
    expect(notificacion?.indexdef).toContain("WHERE ((estado = 'pendiente'::\"EstadoJobCorreo\") AND (origen = 'notificacion'::\"OrigenJobCorreo\"))");
  });
});
