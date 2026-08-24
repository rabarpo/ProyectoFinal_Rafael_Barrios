import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { DimensionReporte, FormatoReporte } from '@prisma/client';
import { PrismaReportesRepo } from '../../src/reportes/reportes.repo';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D12/D13, tareas 17.1-17.6). Corre contra Postgres
 * real (`test:e2e`), mismo patrón que `test/procesos/actas-transicion.e2e-spec.ts`:
 * `PrismaReportesRepo.finalizar()` es el objeto bajo prueba directamente (sin BullMQ, sin HTTP).
 */
describe('PrismaReportesRepo.finalizar() — transición terminal borrador → emitida [D12/D13]', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaReportesRepo(prisma);

  let sufijo: number;
  let contador = 0;

  function nombreUnico(): string {
    contador += 1;
    return `Reportes Transición E2E ${sufijo}-${contador}`;
  }

  async function crearUsuario(): Promise<string> {
    contador += 1;
    const s = `${sufijo}-${contador}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo: `e2e-reportes-repo-${s}`,
        dni: `dni-${s}`,
        correo: `reportes-repo-${s}@e2e.local`,
        nombres: `Solicitante E2E ${s}`,
        rol: 'director',
        estado: 'activo',
        password_hash: 'x',
      },
    });
    return usuario.id;
  }

  async function crearProceso(): Promise<string> {
    const proceso = await prisma.procesoElectoral.create({
      data: {
        nombre: nombreUnico(),
        tipo: 'municipio',
        estado: 'abierto',
        fecha_apertura_prevista: new Date('2026-09-01T09:00:00.000Z'),
        fecha_cierre_prevista: new Date('2026-09-05T18:00:00.000Z'),
        publico_objetivo: 'estudiantes',
        alcance: 'institucion',
      },
    });
    return proceso.id;
  }

  async function crearReporteBorrador(
    procesoId: string,
    solicitadoPor: string,
    overrides: { dimension?: DimensionReporte; formato?: FormatoReporte } = {},
  ): Promise<string> {
    const reporte = await prisma.reporte.create({
      data: {
        proceso_id: procesoId,
        dimension: overrides.dimension ?? 'votantes',
        formato: overrides.formato ?? 'csv',
        solicitado_por: solicitadoPor,
        contenido: { version: 1 },
      },
    });
    return reporte.id;
  }

  function archivoDePrueba(): Buffer {
    return Buffer.from('contenido de prueba');
  }

  beforeAll(() => {
    sufijo = Date.now();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // [17.1] finalizar ⇒ emitida + un REPORTE_GENERADO con actor_usuario_id = solicitado_por
  // (nunca NULL), leído de la fila — el "job.data" real ni siquiera existe en esta prueba,
  // demostrando que el actor no viene de ningún payload de cola.
  it('[17.1] finalizar transiciona a emitida con REPORTE_GENERADO y actor_usuario_id = solicitado_por', async () => {
    const usuarioId = await crearUsuario();
    const procesoId = await crearProceso();
    const reporteId = await crearReporteBorrador(procesoId, usuarioId);

    const resultado = await repo.finalizar(reporteId, archivoDePrueba(), 'text/csv', 'reporte.csv', false, 0);
    expect(resultado).toBe('emitida');

    const fila = await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } });
    expect(fila.estado).toBe('emitida');
    expect(fila.archivo).not.toBeNull();
    expect(fila.emitido_en).not.toBeNull();

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { event_type: 'REPORTE_GENERADO', entity_id: reporteId },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].actor_usuario_id).toBe(usuarioId);
  });

  // [17.2] Ejecutar finalizar dos veces sobre la misma fila ⇒ una sola transición y un solo evento.
  it('[17.2] finalizar dos veces sobre la misma fila es no-op la segunda vez', async () => {
    const usuarioId = await crearUsuario();
    const procesoId = await crearProceso();
    const reporteId = await crearReporteBorrador(procesoId, usuarioId);

    await repo.finalizar(reporteId, archivoDePrueba(), 'text/csv', 'reporte.csv', false, 0);
    const segunda = await repo.finalizar(reporteId, archivoDePrueba(), 'text/csv', 'reporte.csv', false, 0);
    expect(segunda).toBe('no-op');

    const eventos = await prisma.eventoAuditoria.count({
      where: { event_type: 'REPORTE_GENERADO', entity_id: reporteId },
    });
    expect(eventos).toBe(1);
  });

  // [17.3] marcarFallido sobre una fila ya emitida ⇒ no la pisa.
  it('[17.3] marcarFallido sobre una fila emitida no la pisa', async () => {
    const usuarioId = await crearUsuario();
    const procesoId = await crearProceso();
    const reporteId = await crearReporteBorrador(procesoId, usuarioId);

    await repo.finalizar(reporteId, archivoDePrueba(), 'text/csv', 'reporte.csv', false, 0);
    await repo.marcarFallido(reporteId);

    const fila = await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } });
    expect(fila.estado).toBe('emitida');
  });

  // [17.4] Fila que transiciona a fallido ⇒ cero eventos REPORTE_GENERADO.
  it('[17.4] marcarFallido transiciona a fallido sin escribir REPORTE_GENERADO', async () => {
    const usuarioId = await crearUsuario();
    const procesoId = await crearProceso();
    const reporteId = await crearReporteBorrador(procesoId, usuarioId);

    await repo.marcarFallido(reporteId);

    const fila = await prisma.reporte.findUniqueOrThrow({ where: { id: reporteId } });
    expect(fila.estado).toBe('fallido');

    const eventos = await prisma.eventoAuditoria.count({
      where: { event_type: 'REPORTE_GENERADO', entity_id: reporteId },
    });
    expect(eventos).toBe(0);
  });

  // [17.5] El payload no contiene candidato_id/lista_id/opcion_id/blanco/nombres, sólo
  // cardinalidades cerradas.
  it('[17.5] el payload de REPORTE_GENERADO sólo contiene cardinalidades cerradas', async () => {
    const usuarioId = await crearUsuario();
    const procesoId = await crearProceso();
    const reporteId = await crearReporteBorrador(procesoId, usuarioId, { dimension: 'resultados', formato: 'pdf' });

    await repo.finalizar(reporteId, archivoDePrueba(), 'application/pdf', 'reporte.pdf', true, 0);

    const evento = await prisma.eventoAuditoria.findFirstOrThrow({
      where: { event_type: 'REPORTE_GENERADO', entity_id: reporteId },
    });
    const payload = evento.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['bytes', 'dimension', 'filas', 'formato', 'gate_aplicado', 'proceso_id'].sort(),
    );
    expect(payload).not.toHaveProperty('candidato_id');
    expect(payload).not.toHaveProperty('lista_id');
    expect(payload).not.toHaveProperty('opcion_id');
    expect(payload).not.toHaveProperty('blanco');
    expect(payload).not.toHaveProperty('nombres');
    expect(payload.gate_aplicado).toBe(true);
    expect(payload.proceso_id).toBe(procesoId);
  });

  // [17.6] `filas` del payload es la cardinalidad real recibida por finalizar(), nunca un valor
  // fijo — corrección post-verify de un gap real: `#18` D13 exige la cardinalidad del reporte
  // generado, y `finalizar()` la hardcodeaba en 0 sin importar cuántas filas trajera el modelo.
  it('[17.6] el payload de REPORTE_GENERADO lleva la cardinalidad real de filas, no un valor fijo', async () => {
    const usuarioId = await crearUsuario();
    const procesoId = await crearProceso();
    const reporteId = await crearReporteBorrador(procesoId, usuarioId, { dimension: 'votantes', formato: 'csv' });

    const filasReales = 7;
    await repo.finalizar(reporteId, archivoDePrueba(), 'text/csv', 'reporte.csv', false, filasReales);

    const evento = await prisma.eventoAuditoria.findFirstOrThrow({
      where: { event_type: 'REPORTE_GENERADO', entity_id: reporteId },
    });
    const payload = evento.payload as Record<string, unknown>;
    expect(payload.filas).toBe(filasReales);
  });
});
