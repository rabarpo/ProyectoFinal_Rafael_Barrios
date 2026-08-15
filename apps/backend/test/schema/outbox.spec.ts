import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';

/**
 * outbox-correo-comprobante-autenticado (#15, PR1; design.md D1/D6, tareas 1.3-1.6). Ejercita
 * la migración `jobcorreo_outbox_voto` contra Postgres real (`seei_app`): FK, `UNIQUE(voto_id)`
 * nullable, y la barrera CAS que D6 usa para reclamar un job de forma segura ante reentregas
 * concurrentes. Mismo patrón de `withTransaction`/`withSavepoint` que `test/schema/voting.spec.ts`.
 */
describe('jobcorreo_outbox_voto', () => {
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
       VALUES ($1, 'Votante Outbox Test', $2, $3, $4, 'estudiante', 'activo')`,
      [usuarioId, `dni-outbox-${sufijo}`, `codigo-outbox-${sufijo}`, `correo-outbox-${sufijo}@seei.local`],
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
      [procesoId, `proceso-outbox-${sufijo}`],
    );
    return procesoId;
  }

  async function crearDerechoVoto(query: Client['query'], procesoId: string, usuarioId: string): Promise<string> {
    const derechoVotoId = randomUUID();
    await query(
      `INSERT INTO "DerechoVoto" (id, proceso_id, usuario_id, en_calidad_de, aula_snapshot)
       VALUES ($1, $2, $3, 'estudiante', $4)`,
      [derechoVotoId, procesoId, usuarioId, randomUUID()],
    );
    return derechoVotoId;
  }

  async function crearVoto(
    query: Client['query'],
    procesoId: string,
    derechoVotoId: string,
    sufijo: string,
  ): Promise<string> {
    const votoId = randomUUID();
    await query(
      `INSERT INTO "Voto"
         (id, proceso_id, derecho_voto_id, blanco, codigo_comprobante, clave_idempotencia)
       VALUES ($1, $2, $3, true, $4, $5)`,
      [votoId, procesoId, derechoVotoId, `comprobante-outbox-${sufijo}`, `idem-outbox-${sufijo}`],
    );
    return votoId;
  }

  async function crearJobCorreo(
    query: Client['query'],
    usuarioId: string,
    overrides: { votoId?: string | null; estado?: string } = {},
  ): Promise<string> {
    const jobId = randomUUID();
    await query(
      `INSERT INTO "JobCorreo" (id, usuario_id, asunto, cuerpo, estado, voto_id)
       VALUES ($1, $2, 'asunto', 'cuerpo', $3, $4)`,
      [jobId, usuarioId, overrides.estado ?? 'pendiente', overrides.votoId ?? null],
    );
    return jobId;
  }

  // [1.3] UNIQUE(voto_id) rechaza un segundo job del mismo voto (23505).
  it('[1.3] rechaza un segundo JobCorreo para el mismo voto_id (23505)', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '1-3');
      const procesoId = await crearProceso(client.query.bind(client), '1-3');
      const derechoVotoId = await crearDerechoVoto(client.query.bind(client), procesoId, usuarioId);
      const votoId = await crearVoto(client.query.bind(client), procesoId, derechoVotoId, '1-3');

      await crearJobCorreo(client.query.bind(client), usuarioId, { votoId });

      await withSavepoint(client, 's_1_3', () =>
        expectPgError(() => crearJobCorreo(client.query.bind(client), usuarioId, { votoId }), {
          code: '23505',
          constraint: 'JobCorreo_voto_id_key',
        }),
      );
    });
  });

  // [1.4] La FK rechaza un voto_id inexistente (23503).
  it('[1.4] rechaza un JobCorreo con voto_id inexistente (23503)', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '1-4');

      await withSavepoint(client, 's_1_4', () =>
        expectPgError(() => crearJobCorreo(client.query.bind(client), usuarioId, { votoId: randomUUID() }), {
          code: '23503',
          constraint: 'JobCorreo_voto_id_fkey',
        }),
      );
    });
  });

  // [1.5] Dos filas con voto_id NULL conviven sin colisión (NULL no colisiona con NULL en Postgres).
  it('[1.5] acepta dos JobCorreo con voto_id NULL sin colisión', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '1-5');

      const primero = await crearJobCorreo(client.query.bind(client), usuarioId, { votoId: null });
      const segundo = await crearJobCorreo(client.query.bind(client), usuarioId, { votoId: null });

      expect(primero).not.toBe(segundo);
    });
  });

  // [1.6] UPDATE ... WHERE id=$1 AND estado='pendiente' devuelve rowCount=0 si otra transacción ya
  // lo movió — la barrera CAS real de D6, verificable sin código de worker.
  it('[1.6] el CAS de reclamo devuelve rowCount=0 si el job ya no está pendiente', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '1-6');
      const jobId = await crearJobCorreo(client.query.bind(client), usuarioId, { estado: 'enviado' });

      const resultado = await client.query(
        `UPDATE "JobCorreo" SET intentos = intentos + 1 WHERE id = $1 AND estado = 'pendiente'`,
        [jobId],
      );

      expect(resultado.rowCount).toBe(0);
    });
  });

  it('[1.6 triangulación] el CAS de reclamo devuelve rowCount=1 si el job sigue pendiente', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), '1-6-tri');
      const jobId = await crearJobCorreo(client.query.bind(client), usuarioId, { estado: 'pendiente' });

      const resultado = await client.query(
        `UPDATE "JobCorreo" SET intentos = intentos + 1 WHERE id = $1 AND estado = 'pendiente'`,
        [jobId],
      );

      expect(resultado.rowCount).toBe(1);
    });
  });

  // [1.1/D1] Las columnas nuevas existen y son nullable; las previas no cambiaron de nombre/tipo.
  it('[1.1] expone voto_id/proceso_id/codigo_comprobante como columnas nullable en information_schema', async () => {
    const result = await client.query<{ column_name: string; is_nullable: string; data_type: string }>(
      `SELECT column_name, is_nullable, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'JobCorreo'
         AND column_name IN ('voto_id', 'proceso_id', 'codigo_comprobante')`,
    );
    expect(result.rows).toHaveLength(3);
    for (const fila of result.rows) {
      expect(fila.is_nullable).toBe('YES');
    }
  });
});
