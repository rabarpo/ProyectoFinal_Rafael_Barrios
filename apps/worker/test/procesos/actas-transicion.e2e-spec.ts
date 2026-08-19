import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaActasRepo } from '../../src/actas/actas.repo';

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D11, tareas 22.1-22.4). Corre contra Postgres real
 * (`test:e2e`, `vitest.e2e.config.ts`), patrón `apps/backend/test/procesos/procesos-cerrar.e2e-
 * spec.ts`: `PrismaClient` propio para preparar filas y verificar el resultado, sin mocks.
 *
 * `PrismaActasRepo.finalizar()` es el objeto bajo prueba directamente (sin BullMQ, sin HTTP): el
 * worker no expone superficie HTTP y el processor puro ya está cubierto por
 * `src/processors/actas.processor.spec.ts` con dobles de prueba.
 */
describe('PrismaActasRepo.finalizar() — transición terminal cerrado → acta_emitida [D11]', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaActasRepo(prisma);

  let sufijo: number;
  let contador = 0;

  function nombreUnico(): string {
    contador += 1;
    return `Actas Transición E2E ${sufijo}-${contador}`;
  }

  async function crearProcesoCerrado(): Promise<string> {
    const proceso = await prisma.procesoElectoral.create({
      data: {
        nombre: nombreUnico(),
        tipo: 'municipio',
        estado: 'cerrado',
        fecha_apertura_prevista: new Date('2026-09-01T09:00:00.000Z'),
        fecha_cierre_prevista: new Date('2026-09-05T18:00:00.000Z'),
        apertura_real: new Date('2026-09-01T09:00:00.000Z'),
        cierre_real: new Date('2026-09-05T18:00:00.000Z'),
        publico_objetivo: 'estudiantes',
        alcance: 'institucion',
      },
    });
    return proceso.id;
  }

  async function crearActaBorrador(procesoId: string, tipo: 'apertura' | 'cierre' | 'escrutinio' | 'oficial') {
    const acta = await prisma.acta.create({
      data: {
        proceso_id: procesoId,
        tipo,
        estado: 'borrador',
        contenido: { version: 1, tipo },
      },
    });
    return acta.id;
  }

  async function crearProcesoConCuatroActas(): Promise<{ procesoId: string; actaIds: string[] }> {
    const procesoId = await crearProcesoCerrado();
    const tipos = ['apertura', 'cierre', 'escrutinio', 'oficial'] as const;
    const actaIds = await Promise.all(tipos.map((tipo) => crearActaBorrador(procesoId, tipo)));
    return { procesoId, actaIds };
  }

  function pdfDePrueba(): Buffer {
    return Buffer.from('%PDF-1.4 contenido de prueba');
  }

  beforeAll(() => {
    sufijo = Date.now();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // [22.1] Marcar 3 actas emitida ⇒ el proceso sigue cerrado.
  it('[22.1] marcar 3 de 4 actas emitida no transiciona el proceso', async () => {
    const { procesoId, actaIds } = await crearProcesoConCuatroActas();

    for (const actaId of actaIds.slice(0, 3)) {
      const resultado = await repo.finalizar(actaId, pdfDePrueba());
      expect(resultado).toBe('emitida');
    }

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
    expect(proceso.estado).toBe('cerrado');
  });

  // [22.2] La 4ª acta ⇒ pasa a acta_emitida y hay 4 eventos ACTA_GENERADA con actor_usuario_id IS NULL.
  it('[22.2] marcar la 4ª acta emitida transiciona el proceso a acta_emitida con 4 eventos ACTA_GENERADA', async () => {
    const { procesoId, actaIds } = await crearProcesoConCuatroActas();

    for (const actaId of actaIds) {
      const resultado = await repo.finalizar(actaId, pdfDePrueba());
      expect(resultado).toBe('emitida');
    }

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
    expect(proceso.estado).toBe('acta_emitida');

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { event_type: 'ACTA_GENERADA', entity_id: { in: actaIds } },
    });
    expect(eventos).toHaveLength(4);
    expect(eventos.every((evento) => evento.actor_usuario_id === null)).toBe(true);
  });

  // [22.3] Ejecutar finalizar dos veces sobre la misma acta ⇒ una sola transición y un solo evento.
  it('[22.3] finalizar dos veces sobre la misma acta es no-op la segunda vez', async () => {
    const { procesoId, actaIds } = await crearProcesoConCuatroActas();

    for (const actaId of actaIds) {
      await repo.finalizar(actaId, pdfDePrueba());
    }

    const ultimaActaId = actaIds[actaIds.length - 1];
    const segundaLlamada = await repo.finalizar(ultimaActaId, pdfDePrueba());
    expect(segundaLlamada).toBe('no-op');

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
    expect(proceso.estado).toBe('acta_emitida');

    const eventos = await prisma.eventoAuditoria.count({
      where: { event_type: 'ACTA_GENERADA', entity_id: ultimaActaId },
    });
    expect(eventos).toBe(1);
  });

  // [22.4] Carrera real: dos conexiones Postgres finalizando la 3ª y la 4ª en paralelo ⇒ el
  // proceso SÍ llega a acta_emitida. Debe fallar si se quita el SELECT ... FOR UPDATE de D11.
  it('[22.4] dos conexiones concurrentes finalizando la 3ª y la 4ª acta en paralelo transicionan el proceso', async () => {
    const { procesoId, actaIds } = await crearProcesoConCuatroActas();

    // Deja el proceso con 2 actas ya emitidas de forma secuencial (no forma parte de la carrera).
    await repo.finalizar(actaIds[0], pdfDePrueba());
    await repo.finalizar(actaIds[1], pdfDePrueba());

    // Dos conexiones Postgres INDEPENDIENTES (dos `PrismaClient` propios, no el `repo` compartido
    // de la suite) para garantizar transacciones realmente concurrentes, no serializadas por un
    // único pool compartido en el mismo proceso Node.
    const prismaA = new PrismaClient();
    const prismaB = new PrismaClient();
    const repoA = new PrismaActasRepo(prismaA);
    const repoB = new PrismaActasRepo(prismaB);

    try {
      const [resultadoA, resultadoB] = await Promise.all([
        repoA.finalizar(actaIds[2], pdfDePrueba()),
        repoB.finalizar(actaIds[3], pdfDePrueba()),
      ]);

      expect(resultadoA).toBe('emitida');
      expect(resultadoB).toBe('emitida');

      const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
      expect(proceso.estado).toBe('acta_emitida');

      const emitidas = await prisma.acta.count({ where: { proceso_id: procesoId, estado: 'emitida' } });
      expect(emitidas).toBe(4);
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  });
});
