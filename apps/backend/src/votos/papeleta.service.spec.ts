import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PapeletaService } from './papeleta.service';

/**
 * vote-casting, PR1 (design.md D13, tareas 3.1-3.3). Unit tests con `PrismaService` mockeado —
 * mismo criterio que `procesos.service.spec.ts`. `GET /votos/papeleta/:id` NO es la validación
 * (esa vive en `VotosService.emitir()`, PR2): es sólo UX, así que nunca emite `RECHAZO`.
 */

const PROCESO_MUNICIPIO = {
  id: 'proceso-1',
  nombre: 'Alcaldía escolar 2026',
  descripcion: 'Elección del municipio escolar',
  fecha_cierre_prevista: new Date('2026-09-05T18:00:00.000Z'),
  tipo: 'municipio',
};

function construirPrisma(overrides: {
  derechoVotoFindUnique?: jest.Mock;
  votoFindUnique?: jest.Mock;
  listaFindMany?: jest.Mock;
  candidatoFindMany?: jest.Mock;
  opcionConsultaFindMany?: jest.Mock;
}) {
  return {
    derechoVoto: { findUnique: overrides.derechoVotoFindUnique ?? jest.fn().mockResolvedValue(null) },
    voto: { findUnique: overrides.votoFindUnique ?? jest.fn().mockResolvedValue(null) },
    lista: { findMany: overrides.listaFindMany ?? jest.fn().mockResolvedValue([]) },
    candidato: { findMany: overrides.candidatoFindMany ?? jest.fn().mockResolvedValue([]) },
    opcionConsulta: { findMany: overrides.opcionConsultaFindMany ?? jest.fn().mockResolvedValue([]) },
  };
}

function construirServicio(prisma: ReturnType<typeof construirPrisma>) {
  return new PapeletaService(prisma as unknown as PrismaService);
}

// 3.1: derecho propio -> proceso, banda de calidad, opciones activas del tipo, comprobante si votó.
describe('PapeletaService.obtener() — derecho propio (D13, tarea 3.1)', () => {
  it('[3.1] devuelve proceso, banda de calidad y opciones activas del tipo, sin comprobante si no votó', async () => {
    const prisma = construirPrisma({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({
        id: 'dv-1',
        proceso_id: 'proceso-1',
        usuario_id: 'usuario-1',
        en_calidad_de: 'estudiante',
        proceso: PROCESO_MUNICIPIO,
      }),
      votoFindUnique: jest.fn().mockResolvedValue(null),
      listaFindMany: jest.fn().mockResolvedValue([
        { id: 'lista-1', nombre: 'Lista A' },
        { id: 'lista-2', nombre: 'Lista B' },
      ]),
    });
    const servicio = construirServicio(prisma);

    const papeleta = await servicio.obtener('dv-1', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 });

    expect(papeleta.proceso).toEqual({
      id: 'proceso-1',
      nombre: 'Alcaldía escolar 2026',
      descripcion: 'Elección del municipio escolar',
      fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
    });
    expect(papeleta.en_calidad_de).toBe('estudiante');
    expect(papeleta.opciones).toEqual([
      { id: 'lista-1', etiqueta: 'Lista A' },
      { id: 'lista-2', etiqueta: 'Lista B' },
    ]);
    expect(papeleta.ya_voto).toBe(false);
    expect(papeleta.comprobante).toBeNull();
    expect(prisma.lista.findMany).toHaveBeenCalledWith({
      where: { proceso_id: 'proceso-1', estado: 'activo' },
    });
  });

  it('[3.1 triangulación] ya votó -> ya_voto=true y devuelve el comprobante existente', async () => {
    const prisma = construirPrisma({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({
        id: 'dv-1',
        proceso_id: 'proceso-1',
        usuario_id: 'usuario-1',
        en_calidad_de: 'padre',
        proceso: PROCESO_MUNICIPIO,
      }),
      votoFindUnique: jest.fn().mockResolvedValue({
        codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
        hora_servidor: new Date('2026-09-02T10:00:00.000Z'),
      }),
    });
    const servicio = construirServicio(prisma);

    const papeleta = await servicio.obtener('dv-1', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 });

    expect(papeleta.ya_voto).toBe(true);
    expect(papeleta.comprobante).toEqual({
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: '2026-09-02T10:00:00.000Z',
    });
  });
});

// 3.2: derecho ajeno o inexistente -> 403 sin cuerpo discriminante (D9, misma causa 1 del rechazo).
describe('PapeletaService.obtener() — derecho ajeno o inexistente (D9, tarea 3.2)', () => {
  it('[3.2] derecho inexistente -> 403 sin cuerpo discriminante', async () => {
    const prisma = construirPrisma({ derechoVotoFindUnique: jest.fn().mockResolvedValue(null) });
    const servicio = construirServicio(prisma);

    await expect(
      servicio.obtener('dv-inexistente', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    try {
      await servicio.obtener('dv-inexistente', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 });
    } catch (error) {
      expect((error as ForbiddenException).getResponse()).toEqual({ statusCode: 403, message: 'Forbidden' });
    }
  });

  it('[3.2 triangulación] derecho ajeno -> 403 idéntico, sin discriminar del caso inexistente', async () => {
    const prisma = construirPrisma({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({
        id: 'dv-1',
        proceso_id: 'proceso-1',
        usuario_id: 'otro-usuario',
        en_calidad_de: 'estudiante',
        proceso: PROCESO_MUNICIPIO,
      }),
    });
    const servicio = construirServicio(prisma);

    await expect(
      servicio.obtener('dv-1', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// 3.3: la lectura NO emite evento RECHAZO bajo ningún caso — no es validación.
describe('PapeletaService.obtener() — nunca emite RECHAZO (D13, tarea 3.3)', () => {
  it('[3.3] derecho ajeno no invoca ningún método de auditoría (el servicio no la recibe siquiera)', async () => {
    const prisma = construirPrisma({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({
        id: 'dv-1',
        proceso_id: 'proceso-1',
        usuario_id: 'otro-usuario',
        en_calidad_de: 'estudiante',
        proceso: PROCESO_MUNICIPIO,
      }),
    });
    const servicio = construirServicio(prisma);

    await expect(
      servicio.obtener('dv-1', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // PapeletaService.constructor solo toma PrismaService (ver arriba) — sin AuditoriaService
    // inyectado no hay forma de que este camino escriba un evento RECHAZO, ni siquiera por error.
    expect(servicio).not.toHaveProperty('auditoria');
  });
});
