import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * configuracion-general, PR1 (design.md D1/D8, tareas 1.1/1.4). Corre contra Postgres real, mismo
 * criterio que `test/migrate-baseline.e2e-spec.ts`: `test:e2e` ya aplicó `prisma migrate deploy`
 * (incluida la migración aditiva de este PR) y `db:seed` antes de esta suite.
 *
 * DESVIACIÓN declarada (mismo criterio que PR2 de `administracion-academica`, tarea 7.1, y el
 * resto de suites e2e de este repo): en el entorno de ejecución de este `sdd-apply` no hay daemon
 * Docker disponible (`docker ps` falla con "failed to connect to the docker API"), así que esta
 * suite NO pudo correrse hasta GREEN en esta sesión. Queda escrita y type-checkeada
 * (`pnpm typecheck` en verde) contra el contrato real de la migración/seed, lista para CI o un
 * entorno con `docker-compose.test.yml` levantado.
 */
describe('Migración + seed de Configuracion institucional — [PR1, tareas 1.1/1.4][PR3, tarea 3.0]', () => {
  const prisma = new PrismaClient();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // 1.1: la fila semilla `clave='institucional'` sobrevive la migración aditiva con las columnas
  // nuevas en su valor nulo/default (spec, Scenario "La fila semilla `clave='institucional'`
  // sobrevive la migración").
  it('[1.1] la fila clave=institucional sobrevive con id estable y columnas nuevas en null/default', async () => {
    const filas = await prisma.configuracion.findMany({ where: { clave: 'institucional' } });

    expect(filas).toHaveLength(1);
    const [fila] = filas;
    expect(fila.clave).toBe('institucional');
    // `db:seed` (ya ajustado en 1.5) siembra `nombre`/`zona_horaria` con valores institucionales
    // razonables; `director`/`color_primario`/`color_secundario` quedan en su default nulo.
    expect(fila.director).toBeNull();
    expect(fila.color_primario).toBeNull();
    expect(fila.color_secundario).toBeNull();
    expect(fila.dominios_google).toEqual([]);
  });

  // 3.0 (PR3, migración propia 20260809020000_configuracion_institucional_logo): las 3 columnas
  // de logo diferidas de PR1 (design.md D5, DESVIACIÓN documentada en tasks.md tarea 1.2) también
  // sobreviven la migración en su valor nulo — mismo patrón que 1.1.
  it('[3.0] la fila clave=institucional sobrevive con logo/logo_mime/logo_actualizado_en en null', async () => {
    const fila = await prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });

    expect(fila.logo).toBeNull();
    expect(fila.logo_mime).toBeNull();
    expect(fila.logo_actualizado_en).toBeNull();
  });

  // 1.4: re-ejecutar `seed.ts` sobre una DB ya migrada y sembrada no duplica la fila ni sobrescribe
  // columnas existentes con valores reales (spec, Scenario "Re-ejecutar el seed no duplica ni
  // rompe la fila").
  it('[1.4] re-ejecutar el seed no duplica la fila ni sobrescribe smtp_host/puerto/remitente reales', async () => {
    const antes = await prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });

    // Simula un entorno con valores SMTP reales ya configurados (p. ej. vía `PUT /configuracion`
    // de PR2, o una migración manual previa) — el seed NUNCA debe pisar esto.
    await prisma.configuracion.update({
      where: { id: antes.id },
      data: {
        smtp_host: 'smtp.real-institucional.local',
        smtp_puerto: 465,
        smtp_remitente: 'no-responder@real-institucional.local',
      },
    });

    execFileSync('pnpm', ['db:seed'], {
      cwd: path.resolve(__dirname, '../..'),
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    const filas = await prisma.configuracion.findMany({ where: { clave: 'institucional' } });
    expect(filas).toHaveLength(1);

    const [despues] = filas;
    expect(despues.id).toBe(antes.id);
    expect(despues.smtp_host).toBe('smtp.real-institucional.local');
    expect(despues.smtp_puerto).toBe(465);
    expect(despues.smtp_remitente).toBe('no-responder@real-institucional.local');
  });
});
