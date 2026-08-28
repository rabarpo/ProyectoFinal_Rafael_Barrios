import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaOutboxCorreoRepo } from '../../src/outbox/outbox-correo.repo';
import { PrismaNotificacionesRepo } from '../../src/notificaciones/notificaciones.repo';

/**
 * notificaciones (backlog #19), PR8 (design.md D3/D7, tarea 23.1, corrige C5). Corre contra
 * Postgres real (`test:e2e`). Prueba de no-regresión DELIBERADA: sin el filtro `origen` que PR7
 * agregó a `PrismaOutboxCorreoRepo.pendientes()`, esta prueba DEBE fallar — 500 jobs de
 * `notificacion` saturarían el `LIMIT` de la cola `correo` y ninguno de los 500 saldría por
 * `PrismaNotificacionesRepo.pendientes()`.
 */
describe('Aislamiento de colas correo/notificaciones [D3/D7, corrige C5]', () => {
  const prisma = new PrismaClient();
  const outboxRepo = new PrismaOutboxCorreoRepo(prisma);
  const notificacionesRepo = new PrismaNotificacionesRepo(prisma);

  let sufijo: number;

  async function crearUsuario(): Promise<string> {
    const usuario = await prisma.usuario.create({
      data: {
        codigo: `e2e-aislamiento-${sufijo}`,
        dni: `dni-${sufijo}`,
        correo: `aislamiento-${sufijo}@e2e.local`,
        nombres: `Usuario E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: 'x',
      },
    });
    return usuario.id;
  }

  beforeAll(() => {
    sufijo = Date.now();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // [23.1] 500 JobCorreo(origen='notificacion') pendientes + 1 (origen='comprobante') ⇒
  // despacharLoteOutbox devuelve solo el de comprobante y despacharLoteNotificaciones ninguno de
  // comprobante. Limpieza previa deliberada: esta base de test es compartida entre corridas y
  // `pendientes()` lee la tabla completa — sin `deleteMany()` inicial, filas `pendiente` que
  // sobrevivan de una corrida anterior (p. ej. una interrumpida a mitad de assert) contaminarían
  // el conteo exacto que esta prueba necesita.
  it('[23.1] la cola correo nunca ve un job de notificacion, ni viceversa', async () => {
    // `Notificacion.job_correo_id` referencia `JobCorreo` (onDelete: Restrict, PR1) — debe
    // limpiarse primero o el `deleteMany()` de abajo viola la FK.
    await prisma.notificacion.deleteMany({});
    await prisma.jobCorreo.deleteMany({});
    const usuarioId = await crearUsuario();

    const filasNotificacion = Array.from({ length: 500 }, (_, i) => ({
      usuario_id: usuarioId,
      asunto: 'asunto',
      cuerpo: `cuerpo-notificacion-${i}`,
      origen: 'notificacion' as const,
    }));
    await prisma.jobCorreo.createMany({ data: filasNotificacion });

    const comprobante = await prisma.jobCorreo.create({
      data: {
        usuario_id: usuarioId,
        asunto: 'asunto',
        cuerpo: 'cuerpo-comprobante',
        origen: 'comprobante',
      },
    });

    const idsCorreo = await outboxRepo.pendientes(600);
    expect(idsCorreo).toEqual([comprobante.id]);

    const idsNotificaciones = await notificacionesRepo.pendientes(600);
    expect(idsNotificaciones).toHaveLength(500);
    expect(idsNotificaciones).not.toContain(comprobante.id);
  });
});
