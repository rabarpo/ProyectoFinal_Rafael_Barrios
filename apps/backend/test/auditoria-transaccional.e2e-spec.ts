import { PrismaClient, type Prisma } from '@prisma/client';
import { AuditoriaService } from '../src/auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../src/auditoria/audit-event-types';

/**
 * append-only-audit-engine (design.md D6/D8, tareas 6.1-6.5). Prueba que la atomicidad NO viene
 * de `AuditoriaService`: viene de que la escritura de negocio y `log()` corren en el mismo
 * callback de `$transaction`, sobre la misma conexión (`tx`). Fixture de negocio: `AnioEscolar`
 * (única tabla sin FK salientes, design.md "Fixture de negocio") — su relación con
 * `event_type`/`entity_type` es de fixture, no una afirmación de dominio.
 */
describe('AuditoriaService.log — atomicidad transaccional [R6a][R6b][R7a][R1b]', () => {
  const prisma = new PrismaClient();
  const auditoria = new AuditoriaService();

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function contarFilas(
    nombre: string,
    entityId: string,
  ): Promise<{ anios: number; auditoria: number }> {
    const [anios, eventos] = await Promise.all([
      prisma.anioEscolar.count({ where: { nombre } }),
      prisma.eventoAuditoria.count({ where: { entity_type: 'AnioEscolar', entity_id: entityId } }),
    ]);
    return { anios, auditoria: eventos };
  }

  it('un rollback de negocio no deja fila de negocio ni de auditoría [R6a]', async () => {
    const nombre = `Auditoria-Rollback-${Date.now()}`;
    let anioId = '';

    await expect(
      prisma.$transaction(async (tx) => {
        const anio = await tx.anioEscolar.create({ data: { nombre } });
        anioId = anio.id;
        await auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.VOTO,
          null,
          'AnioEscolar',
          anio.id,
          { proceso_id: 'p-1' } as Prisma.InputJsonValue,
        );
        throw new Error('rollback forzado tras ambas escrituras');
      }),
    ).rejects.toThrow('rollback forzado tras ambas escrituras');

    const filas = await contarFilas(nombre, anioId);
    expect(filas.anios).toBe(0);
    expect(filas.auditoria).toBe(0);
  });

  it('una transacción confirmada deja exactamente una fila de negocio y una de auditoría con entity_id correlacionado [R6b]', async () => {
    const nombre = `Auditoria-Commit-${Date.now()}`;

    const anioId = await prisma.$transaction(async (tx) => {
      const anio = await tx.anioEscolar.create({ data: { nombre } });
      await auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.VOTO,
        null,
        'AnioEscolar',
        anio.id,
        { proceso_id: 'p-1', derecho_voto_id: 'd-1', comprobante: 'c-1' } as Prisma.InputJsonValue,
      );
      return anio.id;
    });

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { entity_type: 'AnioEscolar', entity_id: anioId },
    });

    expect(await prisma.anioEscolar.count({ where: { nombre } })).toBe(1);
    expect(eventos).toHaveLength(1);
    expect(eventos[0].entity_id).toBe(anioId);
  });

  it('un payload de VOTO con clave prohibida hace rollback también de la escritura de negocio [R7a]', async () => {
    const nombre = `Auditoria-Rechazo-${Date.now()}`;
    let anioId = '';

    await expect(
      prisma.$transaction(async (tx) => {
        const anio = await tx.anioEscolar.create({ data: { nombre } });
        anioId = anio.id;
        await auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.VOTO,
          null,
          'AnioEscolar',
          anio.id,
          { candidato_id: 'c-1' } as Prisma.InputJsonValue,
        );
      }),
    ).rejects.toThrow();

    const filas = await contarFilas(nombre, anioId);
    expect(filas.anios).toBe(0);
    expect(filas.auditoria).toBe(0);
  });

  it('occurred_at ignora cualquier valor del cliente: log() no expone el parámetro y el server registra su propia hora [R1b]', async () => {
    const nombre = `Auditoria-OccurredAt-${Date.now()}`;
    const antesDeInsertar = new Date();

    const anioId = await prisma.$transaction(async (tx) => {
      const anio = await tx.anioEscolar.create({ data: { nombre } });
      await auditoria.log(tx, AUDIT_EVENT_TYPES.RECHAZO, null, 'AnioEscolar', anio.id, {
        proceso_id: 'p-2',
      } as Prisma.InputJsonValue);
      return anio.id;
    });

    const evento = await prisma.eventoAuditoria.findFirstOrThrow({
      where: { entity_type: 'AnioEscolar', entity_id: anioId },
    });

    expect(evento.occurred_at.getTime()).toBeGreaterThanOrEqual(antesDeInsertar.getTime());
  });
});
