import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';
import { getConstraintDef, countPublicViews } from './helpers/catalog';

/**
 * Grupo 3 — Núcleo de votación (base-schema-and-migrations, tareas 3.4-3.12).
 * Ejercita la migración `voting_core` contra un Postgres real (`seei_app`): FK de `DerechoVoto`,
 * unicidad `@@unique([proceso_id, derecho_voto_id])` (ADR-0003, "0 votos duplicados") y el CHECK
 * "exactamente una elección" (ADR-0008) anexado a mano en SQL raw (design.md D5).
 */
describe('voting_core', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  async function crearProceso(query: Client['query']): Promise<string> {
    const procesoId = randomUUID();
    await query(
      `INSERT INTO "ProcesoElectoral"
         (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista,
          publico_objetivo, alcance)
       VALUES ($1, 'proceso-voting-core', 'municipio', 'borrador', now(), now(),
               'estudiantes', 'institucion')`,
      [procesoId],
    );
    return procesoId;
  }

  async function crearUsuario(query: Client['query'], sufijo: string): Promise<string> {
    const usuarioId = randomUUID();
    await query(
      `INSERT INTO "Usuario" (id, nombres, dni, codigo, correo, rol, estado)
       VALUES ($1, 'Votante Test', $2, $3, $4, 'estudiante', 'activo')`,
      [usuarioId, `dni-${sufijo}`, `codigo-${sufijo}`, `correo-${sufijo}@seei.local`],
    );
    return usuarioId;
  }

  async function crearDerechoVoto(
    query: Client['query'],
    procesoId: string,
    usuarioId: string,
  ): Promise<string> {
    const derechoVotoId = randomUUID();
    await query(
      `INSERT INTO "DerechoVoto" (id, proceso_id, usuario_id, en_calidad_de, aula_snapshot)
       VALUES ($1, $2, $3, 'estudiante', 'snapshot-test')`,
      [derechoVotoId, procesoId, usuarioId],
    );
    return derechoVotoId;
  }

  // [R3a] DerechoVoto referencia un ProcesoElectoral y una cuenta válidos.
  it('[R3a] acepta un DerechoVoto referenciando un ProcesoElectoral y un Usuario válidos', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));
      const usuarioId = await crearUsuario(client.query.bind(client), 'r3a');

      const derechoVotoId = randomUUID();
      const result = await client.query(
        `INSERT INTO "DerechoVoto" (id, proceso_id, usuario_id, en_calidad_de, aula_snapshot)
         VALUES ($1, $2, $3, 'estudiante', 'snapshot-r3a') RETURNING id, proceso_id, usuario_id`,
        [derechoVotoId, procesoId, usuarioId],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].proceso_id).toBe(procesoId);
      expect(result.rows[0].usuario_id).toBe(usuarioId);
    });
  });

  // [R3b] Un DerechoVoto sin ProcesoElectoral válido es rechazado.
  it('[R3b] rechaza un insert de DerechoVoto con proceso_id inexistente', async () => {
    await withTransaction(client, async () => {
      const usuarioId = await crearUsuario(client.query.bind(client), 'r3b');

      await withSavepoint(client, 's_r3b', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "DerechoVoto" (id, proceso_id, usuario_id, en_calidad_de, aula_snapshot)
               VALUES ($1, $2, $3, 'estudiante', 'snapshot-r3b')`,
              [randomUUID(), randomUUID(), usuarioId],
            ),
          { code: '23503', constraint: 'DerechoVoto_proceso_id_fkey' },
        ),
      );
    });
  });

  // [R4] Un segundo Voto para el mismo (proceso_id, derecho_voto_id) es rechazado — 0 votos
  // duplicados (ADR-0003).
  it('[R4] rechaza un segundo Voto para el mismo (proceso_id, derecho_voto_id)', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));
      const usuarioId = await crearUsuario(client.query.bind(client), 'r4');
      const derechoVotoId = await crearDerechoVoto(client.query.bind(client), procesoId, usuarioId);

      await client.query(
        `INSERT INTO "Voto"
           (id, proceso_id, derecho_voto_id, blanco, codigo_comprobante, clave_idempotencia)
         VALUES ($1, $2, $3, true, $4, $5)`,
        [randomUUID(), procesoId, derechoVotoId, `comprobante-r4-1-${derechoVotoId}`, `idem-r4-1-${derechoVotoId}`],
      );

      await withSavepoint(client, 's_r4', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Voto"
                 (id, proceso_id, derecho_voto_id, blanco, codigo_comprobante, clave_idempotencia)
               VALUES ($1, $2, $3, true, $4, $5)`,
              [randomUUID(), procesoId, derechoVotoId, `comprobante-r4-2-${derechoVotoId}`, `idem-r4-2-${derechoVotoId}`],
            ),
          { code: '23505', constraint: 'Voto_proceso_id_derecho_voto_id_key' },
        ),
      );
    });
  });

  // [R5a] Un voto con dos elecciones establecidas es rechazado por el CHECK.
  it('[R5a] rechaza un Voto con lista_id y candidato_id ambos establecidos', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));
      const usuarioId = await crearUsuario(client.query.bind(client), 'r5a');
      const derechoVotoId = await crearDerechoVoto(client.query.bind(client), procesoId, usuarioId);

      await withSavepoint(client, 's_r5a', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Voto"
                 (id, proceso_id, derecho_voto_id, lista_id, candidato_id, blanco,
                  codigo_comprobante, clave_idempotencia)
               VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
              [
                randomUUID(),
                procesoId,
                derechoVotoId,
                randomUUID(),
                randomUUID(),
                `comprobante-r5a-${derechoVotoId}`,
                `idem-r5a-${derechoVotoId}`,
              ],
            ),
          { code: '23514', constraint: 'voto_eleccion_exactamente_una_chk' },
        ),
      );
    });
  });

  // [R5b] Un voto sin ninguna elección establecida es rechazado por el CHECK.
  it('[R5b] rechaza un Voto con lista_id/opcion_id/candidato_id en NULL y blanco=false', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));
      const usuarioId = await crearUsuario(client.query.bind(client), 'r5b');
      const derechoVotoId = await crearDerechoVoto(client.query.bind(client), procesoId, usuarioId);

      await withSavepoint(client, 's_r5b', () =>
        expectPgError(
          () =>
            client.query(
              `INSERT INTO "Voto"
                 (id, proceso_id, derecho_voto_id, blanco, codigo_comprobante, clave_idempotencia)
               VALUES ($1, $2, $3, false, $4, $5)`,
              [randomUUID(), procesoId, derechoVotoId, `comprobante-r5b-${derechoVotoId}`, `idem-r5b-${derechoVotoId}`],
            ),
          { code: '23514', constraint: 'voto_eleccion_exactamente_una_chk' },
        ),
      );
    });
  });

  // [R5c] Un voto en blanco (blanco=true, resto NULL) es aceptado.
  it('[R5c] acepta un Voto en blanco con blanco=true y el resto en NULL', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));
      const usuarioId = await crearUsuario(client.query.bind(client), 'r5c');
      const derechoVotoId = await crearDerechoVoto(client.query.bind(client), procesoId, usuarioId);

      const result = await client.query(
        `INSERT INTO "Voto"
           (id, proceso_id, derecho_voto_id, blanco, codigo_comprobante, clave_idempotencia)
         VALUES ($1, $2, $3, true, $4, $5) RETURNING id, blanco`,
        [randomUUID(), procesoId, derechoVotoId, `comprobante-r5c-${derechoVotoId}`, `idem-r5c-${derechoVotoId}`],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].blanco).toBe(true);
    });
  });

  // 3.10 GREEN: el CHECK existe en pg_constraint con la definición esperada (deriva del lado SQL
  // raw, design.md D2).
  it('expone voto_eleccion_exactamente_una_chk en pg_constraint con la definición esperada', async () => {
    const restriccion = await getConstraintDef(client, 'voto_eleccion_exactamente_una_chk');
    expect(restriccion).not.toBeNull();
    expect(restriccion?.definition).toContain('num_nonnulls');
    expect(restriccion?.definition).toContain('blanco');
  });

  // [R6] Frontera del secreto del voto: cero vistas en el esquema public — ningún artefacto de
  // esquema puede unir identidad y elección (ADR-0010).
  it('[R6] no existe ninguna vista en el esquema public', async () => {
    const total = await countPublicViews(client);
    expect(total).toBe(0);
  });
});
