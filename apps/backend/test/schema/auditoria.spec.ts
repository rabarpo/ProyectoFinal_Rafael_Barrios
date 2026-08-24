import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, createMigratorPgClient, withTransaction, withSavepoint } from './helpers/pg-client';
import { expectPgError } from './helpers/expect-pg-error';
import { getTriggerDef, getTablePrivileges } from './helpers/catalog';

/**
 * Motor de auditoría append-only (append-only-audit-engine, PR1; design.md D1/D2/D3/D5).
 * Ejercita la migración `append_only_audit` contra un Postgres real, con el rol adecuado por
 * capa (design.md D5): `seei_migrator` (MIGRATION_DATABASE_URL) para la capa de trigger —
 * `seei_app` nunca llega a disparar el trigger porque el `REVOKE` lo detiene antes— y `seei_app`
 * (DATABASE_URL) para la capa de permisos y el trigger de claves de elección.
 */
describe('append_only_audit', () => {
  let client: Client;
  let migratorClient: Client;

  beforeAll(async () => {
    client = await createPgClient();
    migratorClient = await createMigratorPgClient();
  });

  afterAll(async () => {
    await client.end();
    await migratorClient.end();
  });

  async function crearUsuario(query: Client['query'], sufijo: string): Promise<string> {
    const usuarioId = randomUUID();
    await query(
      `INSERT INTO "Usuario" (id, nombres, dni, codigo, correo, rol, estado)
       VALUES ($1, 'Actor Auditoria', $2, $3, $4, 'estudiante', 'activo')`,
      [usuarioId, `dni-aud-${sufijo}`, `codigo-aud-${sufijo}`, `correo-aud-${sufijo}@seei.local`],
    );
    return usuarioId;
  }

  async function insertarEvento(
    query: Client['query'],
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<string> {
    const id = randomUUID();
    await query(
      `INSERT INTO "EventoAuditoria" (id, event_type, entity_type, payload)
       VALUES ($1, $2, 'AnioEscolar', $3::jsonb)`,
      [id, eventType, JSON.stringify(payload)],
    );
    return id;
  }

  // 1.3 [R1a] Todas las columnas listadas en la spec existen, occurred_at NOT NULL default now().
  it('[R1a] la tabla EventoAuditoria existe con el conjunto completo de columnas', async () => {
    const result = await client.query<{
      column_name: string;
      is_nullable: string;
      column_default: string | null;
    }>(
      `SELECT column_name, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'EventoAuditoria'`,
    );

    const columnas = new Map(result.rows.map((r) => [r.column_name, r]));
    for (const esperada of [
      'id',
      'actor_usuario_id',
      'event_type',
      'entity_type',
      'entity_id',
      'occurred_at',
      'ip_address',
      'user_agent',
      'payload',
    ]) {
      expect(columnas.has(esperada)).toBe(true);
    }

    const occurredAt = columnas.get('occurred_at');
    expect(occurredAt?.is_nullable).toBe('NO');
    expect(occurredAt?.column_default).toContain('CURRENT_TIMESTAMP');
  });

  // 1.4 [R4a] El insert directo vía seei_app respeta CHECK/REVOKE ya al arrancar (positivo).
  it('acepta un insert de EventoAuditoria con event_type válido vía seei_app', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'MATRICULA_CREADA', {
        proceso_id: randomUUID(),
      });
      const result = await client.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  // 2.2 [R2a][R3a][TM1] Ausente el trigger, seei_migrator (propietario) SÍ puede mutar — RED
  //     escrito antes del trigger; tras 2.3 este mismo test prueba el rechazo AU001.
  // 2.2/2.3 [R2a][TM1] UPDATE vía seei_migrator es rechazado por el trigger no_update (AU001).
  it('[R2a][TM1] rechaza un UPDATE de EventoAuditoria vía seei_migrator con AU001, fila intacta', async () => {
    await withTransaction(migratorClient, async () => {
      const id = await insertarEvento(migratorClient.query.bind(migratorClient), 'MATRICULA_CREADA', {});

      await withSavepoint(migratorClient, 's_no_update', () =>
        expectPgError(
          () =>
            migratorClient.query(`UPDATE "EventoAuditoria" SET event_type = 'OTRO' WHERE id = $1`, [id]),
          { code: 'AU001' },
        ),
      );

      const result = await migratorClient.query(
        `SELECT event_type FROM "EventoAuditoria" WHERE id = $1`,
        [id],
      );
      expect(result.rows[0].event_type).toBe('MATRICULA_CREADA');
    });
  });

  // 2.2/2.3 [R3a][TM1] DELETE vía seei_migrator es rechazado por el trigger no_delete (AU001).
  it('[R3a][TM1] rechaza un DELETE de EventoAuditoria vía seei_migrator con AU001, fila sigue existiendo', async () => {
    await withTransaction(migratorClient, async () => {
      const id = await insertarEvento(migratorClient.query.bind(migratorClient), 'MATRICULA_CREADA', {});

      await withSavepoint(migratorClient, 's_no_delete', () =>
        expectPgError(
          () => migratorClient.query(`DELETE FROM "EventoAuditoria" WHERE id = $1`, [id]),
          { code: 'AU001' },
        ),
      );

      const result = await migratorClient.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  // [TM1] TRUNCATE vía seei_migrator es rechazado por el trigger no_truncate (AU001).
  it('[TM1] rechaza un TRUNCATE de EventoAuditoria vía seei_migrator con AU001', async () => {
    await expectPgError(() => migratorClient.query(`TRUNCATE "EventoAuditoria"`), { code: 'AU001' });
  });

  // 2.4/2.5 [R4a][TM2] UPDATE/DELETE vía seei_app son rechazados por el REVOKE (42501), antes de
  //         que el trigger de sentencia siquiera corra (design.md D5).
  it('[R4a][TM2] rechaza un UPDATE de EventoAuditoria vía seei_app con 42501', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'MATRICULA_CREADA', {});

      await withSavepoint(client, 's_revoke_update', () =>
        expectPgError(
          () => client.query(`UPDATE "EventoAuditoria" SET event_type = 'OTRO' WHERE id = $1`, [id]),
          { code: '42501' },
        ),
      );
    });
  });

  it('[R4a][TM2] rechaza un DELETE de EventoAuditoria vía seei_app con 42501', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'MATRICULA_CREADA', {});

      await withSavepoint(client, 's_revoke_delete', () =>
        expectPgError(
          () => client.query(`DELETE FROM "EventoAuditoria" WHERE id = $1`, [id]),
          { code: '42501' },
        ),
      );
    });
  });

  it('[TM2] rechaza un TRUNCATE de EventoAuditoria vía seei_app con 42501', async () => {
    await expectPgError(() => client.query(`TRUNCATE "EventoAuditoria"`), { code: '42501' });
  });

  // 3.1/3.2 [R5a][TM3] Clave prohibida en la raíz del payload de VOTO es rechazada (AU002).
  it('[R5a][TM3] rechaza un payload de VOTO con candidato_id en la raíz', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_voto_raiz', () =>
        expectPgError(
          () => insertarEvento(client.query.bind(client), 'VOTO', { candidato_id: randomUUID() }),
          { code: 'AU002' },
        ),
      );
    });
  });

  // 3.1/3.2 [R5a][TM3] Clave prohibida anidada un nivel es rechazada (AU002).
  it('[R5a][TM3] rechaza un payload de VOTO con lista_id anidado', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_voto_anidado', () =>
        expectPgError(
          () =>
            insertarEvento(client.query.bind(client), 'VOTO', {
              detalle: { lista_id: randomUUID() },
            }),
          { code: 'AU002' },
        ),
      );
    });
  });

  // 3.1/3.2 [R5a][TM3] Clave prohibida dentro de un arreglo es rechazada (AU002).
  it('[R5a][TM3] rechaza un payload de VOTO con opcion_id dentro de un arreglo', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_voto_arreglo', () =>
        expectPgError(
          () =>
            insertarEvento(client.query.bind(client), 'VOTO', {
              intentos: [{ opcion_id: randomUUID() }],
            }),
          { code: 'AU002' },
        ),
      );
    });
  });

  // 3.1/3.2 [R5b][TM3] RECHAZO con clave prohibida es rechazado por la misma razón que VOTO.
  it('[R5b][TM3] rechaza un payload de RECHAZO con opcion_id en la raíz', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_rechazo_raiz', () =>
        expectPgError(
          () => insertarEvento(client.query.bind(client), 'RECHAZO', { opcion_id: randomUUID() }),
          { code: 'AU002' },
        ),
      );
    });
  });

  // 3.3 [R5c] Un payload de VOTO legítimo (sin claves prohibidas) es aceptado.
  it('[R5c] acepta un payload de VOTO sin claves prohibidas', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'VOTO', {
        proceso_id: randomUUID(),
        derecho_voto_id: randomUUID(),
        codigo_comprobante: 'comprobante-test',
      });
      const result = await client.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  // 3.4 [R8a] event_type que viola la convención ^[A-Z_]+$ es rechazado con 23514.
  it('[R8a] rechaza un event_type vacío con 23514', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_event_type_vacio', () =>
        expectPgError(() => insertarEvento(client.query.bind(client), '', {}), {
          code: '23514',
          constraint: 'eventoauditoria_event_type_convencion_chk',
        }),
      );
    });
  });

  it('[R8a] rechaza un event_type en minúsculas con 23514', async () => {
    await withTransaction(client, async () => {
      await withSavepoint(client, 's_event_type_minusculas', () =>
        expectPgError(() => insertarEvento(client.query.bind(client), 'evento_minusculas', {}), {
          code: '23514',
          constraint: 'eventoauditoria_event_type_convencion_chk',
        }),
      );
    });
  });

  // 3.4 [R8a] Un event_type nuevo que sí cumple la convención es aceptado sin lista cerrada.
  it('[R8a] acepta un event_type nuevo que cumple la convención', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'CANDIDATO_INSCRITO', {});
      const result = await client.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  // 4.2 [TM1] Catálogo: los tres triggers existen y están habilitados (tgenabled = 'O').
  it('[TM1] los tres triggers anti-mutación están presentes y habilitados', async () => {
    for (const nombre of [
      'eventoauditoria_no_update_trg',
      'eventoauditoria_no_delete_trg',
      'eventoauditoria_no_truncate_trg',
    ]) {
      const trigger = await getTriggerDef(client, nombre);
      expect(trigger).not.toBeNull();
      expect(trigger?.tgenabled).toBe('O');
    }
  });

  // 4.3 [TM2] Catálogo: relacl no otorga UPDATE/DELETE/TRUNCATE a ningún rol distinto del dueño.
  it('[TM2] relacl no otorga UPDATE/DELETE/TRUNCATE a ningún grantee distinto del propietario', async () => {
    const privilegios = await getTablePrivileges(client, 'EventoAuditoria');
    const prohibidos = privilegios.filter(
      (p) =>
        p.grantee !== p.owner &&
        ['UPDATE', 'DELETE', 'TRUNCATE'].includes(p.privilege_type),
    );
    expect(prohibidos).toEqual([]);
  });

  // [TM4] cierre-escrutinio-actas (#17, PR3; design.md D14, tarea 14.1): un INSERT directo de
  // PROCESO_CERRADO/ACTA_GENERADA con una clave de detalle que PARECE un identificador de voto
  // ('candidato_id') NO dispara AU002 — el trigger de claves de elección sólo cubre
  // VOTO/RECHAZO literalmente (ver [TM4] de abajo). La protección de estas dos claves es de
  // código (D14), no del motor.
  it('[TM4] INSERT directo de PROCESO_CERRADO con detalle.candidato_id NO dispara AU002', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'PROCESO_CERRADO', {
        detalle: { candidato_id: randomUUID() },
      });
      const result = await client.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  it('[TM4] INSERT directo de ACTA_GENERADA con detalle.candidato_id NO dispara AU002', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'ACTA_GENERADA', {
        detalle: { candidato_id: randomUUID() },
      });
      const result = await client.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  // reportes-y-exportaciones (#18, PR4; design.md D13, tarea 21.1): INSERT directo de
  // REPORTE_GENERADO cumple el CHECK `^[A-Z_]+$` y NO dispara AU002 — el trigger de claves de
  // elección sólo cubre VOTO/RECHAZO literalmente. Constancia de que la protección de esta clave
  // (jamás candidato_id/lista_id/opcion_id/blanco en el payload) es de código (D13), no del motor.
  it('[TM4] INSERT directo de REPORTE_GENERADO con detalle.candidato_id NO dispara AU002', async () => {
    await withTransaction(client, async () => {
      const id = await insertarEvento(client.query.bind(client), 'REPORTE_GENERADO', {
        detalle: { candidato_id: randomUUID() },
      });
      const result = await client.query(`SELECT id FROM "EventoAuditoria" WHERE id = $1`, [id]);
      expect(result.rows).toHaveLength(1);
    });
  });

  // [TM4] Ambas claves cumplen el CHECK de convención ^[A-Z_]+$ (ya ejercitado arriba de forma
  // implícita al aceptarse el INSERT: si violaran el CHECK, el insertarEvento() habría lanzado).

  // 4.4 [TM4] Catálogo: la cláusula WHEN del trigger de claves lista VOTO/RECHAZO literalmente.
  it('[TM4] la definición del trigger de claves de elección contiene la cláusula WHEN con VOTO/RECHAZO', async () => {
    const trigger = await getTriggerDef(client, 'eventoauditoria_claves_eleccion_trg');
    expect(trigger).not.toBeNull();
    expect(trigger?.definition).toContain('WHEN');
    expect(trigger?.definition).toContain('VOTO');
    expect(trigger?.definition).toContain('RECHAZO');
  });
});
