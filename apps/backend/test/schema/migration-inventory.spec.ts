import type { Client } from 'pg';
import { createPgClient } from './helpers/pg-client';

/**
 * Grupo 4 — Cierre (base-schema-and-migrations, tareas 4.8-4.9; spec "Migraciones agrupadas
 * apiladas tras la baseline vacía", escenario [R8]).
 *
 * `prisma migrate deploy` ya corrió (en CI, inmediatamente antes de `test:schema`; en local,
 * como precondición de este batch) desde la migración baseline vacía de `system-scaffolding`
 * (#1) a través de las cuatro migraciones agrupadas de este change, en orden y sin error — si
 * cualquier paso hubiera fallado, ni CI ni este arnés habrían llegado a ejecutar esta suite. Este
 * test verifica la postcondición observable: el inventario de tablas resultante contiene
 * exactamente las de los cuatro grupos de este change (más `_prisma_migrations`), sin ninguna
 * tabla fuera de alcance.
 */
describe('migraciones agrupadas — inventario de alcance [R8]', () => {
  let client: Client;

  const tablasEsperadas = [
    // Grupo 1 — identidad y árbol académico
    'Usuario',
    'Apoderado',
    'AnioEscolar',
    'Nivel',
    'Grado',
    'Seccion',
    'Aula',
    'Matricula',
    // Grupo 2 — estructura del proceso electoral
    'ProcesoElectoral',
    'Lista',
    'Candidato',
    'OpcionConsulta',
    'ProcesoAula',
    // Grupo 3 — núcleo de votación
    'DerechoVoto',
    'Voto',
    // Grupo 4 — tablas de soporte
    'JobCorreo',
    'Notificacion',
    'Configuracion',
    'Acta',
    // Grupo 5 — motor de auditoría append-only (append-only-audit-engine, PR1)
    'EventoAuditoria',
  ].sort();

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  it('contiene exactamente las tablas de dominio de las cuatro migraciones, sin tablas fuera de alcance', async () => {
    const result = await client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         AND table_name <> '_prisma_migrations'
       ORDER BY table_name`,
    );

    const tablasReales = result.rows.map((r) => r.table_name).sort();
    expect(tablasReales).toEqual(tablasEsperadas);
  });
});
