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
        {
          id: 'lista-1',
          nombre: 'Lista A',
          simbolo: null,
          lema: null,
          propuesta: null,
          plan_trabajo_mime: null,
          candidatos: [],
        },
        {
          id: 'lista-2',
          nombre: 'Lista B',
          simbolo: null,
          lema: null,
          propuesta: null,
          plan_trabajo_mime: null,
          candidatos: [],
        },
      ]),
    });
    const servicio = construirServicio(prisma);

    const papeleta = await servicio.obtener('dv-1', { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 });

    expect(papeleta.proceso).toEqual({
      id: 'proceso-1',
      nombre: 'Alcaldía escolar 2026',
      descripcion: 'Elección del municipio escolar',
      fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
      tipo: 'municipio',
    });
    expect(papeleta.en_calidad_de).toBe('estudiante');
    expect(papeleta.opciones).toEqual([
      { id: 'lista-1', etiqueta: 'Lista A', plan_trabajo_presente: false },
      { id: 'lista-2', etiqueta: 'Lista B', plan_trabajo_presente: false },
    ]);
    expect(papeleta.ya_voto).toBe(false);
    expect(papeleta.comprobante).toBeNull();
    expect(prisma.lista.findMany).toHaveBeenCalledWith({
      where: { proceso_id: 'proceso-1', estado: 'activo' },
      orderBy: { numero: 'asc' },
      select: {
        id: true,
        nombre: true,
        simbolo: true,
        lema: true,
        propuesta: true,
        plan_trabajo_mime: true,
        candidatos: {
          where: { estado: 'activo' },
          orderBy: [{ nombres: 'asc' }, { id: 'asc' }],
          take: 1,
          select: { id: true, nombres: true, cargo: true, foto_mime: true },
        },
      },
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

// rediseno-boleta-votacion, PR1 (design.md D1/D2, tareas 2.1-2.7). obtenerOpciones() público,
// mapeo por tipo sin N+1: una sola query con `select`/`orderBy`/`include` por rama.
describe('PapeletaService.obtenerOpciones() — mapeo por tipo sin N+1 (design.md D2, tareas 2.2-2.7)', () => {
  it('[2.2] desempate estable entre dos candidatos activos con nombres distintos -> el primer nombres asc gana', async () => {
    const prisma = construirPrisma({
      listaFindMany: jest.fn().mockResolvedValue([
        {
          id: 'lista-1',
          nombre: 'Lista A',
          simbolo: 'A',
          lema: 'Lema A',
          propuesta: 'Propuesta A',
          plan_trabajo_mime: 'application/pdf',
          candidatos: [{ id: 'cand-ana', nombres: 'Ana', cargo: 'Presidente', foto_mime: 'image/png' }],
        },
      ]),
    });
    const servicio = construirServicio(prisma);

    const opciones = await servicio.obtenerOpciones('proceso-1', 'municipio');

    expect(opciones).toEqual([
      {
        id: 'lista-1',
        etiqueta: 'Lista A',
        simbolo: 'A',
        lema: 'Lema A',
        propuesta: 'Propuesta A',
        plan_trabajo_presente: true,
        candidato_id: 'cand-ana',
        candidato_nombres: 'Ana',
        cargo: 'Presidente',
        foto_presente: true,
      },
    ]);
    // El desempate real (`nombres asc, id asc`) lo garantiza el `orderBy` enviado a Prisma —
    // Prisma ya devuelve "Ana" primero (`take: 1`), este test verifica que el mapper use ese
    // primer elemento tal cual, sin reordenar en memoria.
    expect(prisma.lista.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          candidatos: expect.objectContaining({
            orderBy: [{ nombres: 'asc' }, { id: 'asc' }],
            take: 1,
          }),
        }),
      }),
    );
  });

  it('[2.3] lista sin candidatos activos -> opción sin candidato_id/candidato_nombres/cargo/foto_presente, sin error', async () => {
    const prisma = construirPrisma({
      listaFindMany: jest.fn().mockResolvedValue([
        {
          id: 'lista-1',
          nombre: 'Lista A',
          simbolo: null,
          lema: null,
          propuesta: null,
          plan_trabajo_mime: null,
          candidatos: [],
        },
      ]),
    });
    const servicio = construirServicio(prisma);

    const opciones = await servicio.obtenerOpciones('proceso-1', 'municipio');

    expect(opciones).toEqual([{ id: 'lista-1', etiqueta: 'Lista A', plan_trabajo_presente: false }]);
    expect(opciones[0]).not.toHaveProperty('candidato_id');
    expect(opciones[0]).not.toHaveProperty('candidato_nombres');
    expect(opciones[0]).not.toHaveProperty('cargo');
    expect(opciones[0]).not.toHaveProperty('foto_presente');
  });

  it('[2.4] representante_aula/padres -> candidato.findMany con orderBy nombres asc; opción emite candidato_id === id', async () => {
    const prisma = construirPrisma({
      candidatoFindMany: jest.fn().mockResolvedValue([
        { id: 'cand-1', nombres: 'Beltrán', cargo: 'Representante', foto_mime: 'image/png' },
      ]),
    });
    const servicio = construirServicio(prisma);

    const opciones = await servicio.obtenerOpciones('proceso-1', 'representante_aula');

    expect(prisma.candidato.findMany).toHaveBeenCalledWith({
      where: { proceso_id: 'proceso-1', estado: 'activo' },
      orderBy: { nombres: 'asc' },
      select: { id: true, nombres: true, cargo: true, foto_mime: true },
    });
    expect(opciones).toEqual([
      {
        id: 'cand-1',
        etiqueta: 'Beltrán',
        candidato_id: 'cand-1',
        candidato_nombres: 'Beltrán',
        cargo: 'Representante',
        foto_presente: true,
      },
    ]);
    // Invariante D6 de design.md: el id de selección es siempre `opcion.id`, aquí igual a
    // `candidato_id` — nunca se debe usar `candidato_id` como id de selección en el frontend.
    expect(opciones[0].id).toBe(opciones[0].candidato_id);
  });

  it('[2.5] consulta -> opcionConsulta.findMany con orderBy etiqueta asc; emite descripcion cuando no es null, sin campos de candidato/lista', async () => {
    const prisma = construirPrisma({
      opcionConsultaFindMany: jest.fn().mockResolvedValue([
        { id: 'op-1', etiqueta: 'Sí', descripcion: 'Aprobar la propuesta' },
        { id: 'op-2', etiqueta: 'No', descripcion: null },
      ]),
    });
    const servicio = construirServicio(prisma);

    const opciones = await servicio.obtenerOpciones('proceso-1', 'consulta');

    expect(prisma.opcionConsulta.findMany).toHaveBeenCalledWith({
      where: { proceso_id: 'proceso-1' },
      orderBy: { etiqueta: 'asc' },
      select: { id: true, etiqueta: true, descripcion: true },
    });
    expect(opciones).toEqual([
      { id: 'op-1', etiqueta: 'Sí', descripcion: 'Aprobar la propuesta' },
      { id: 'op-2', etiqueta: 'No' },
    ]);
    expect(opciones[1]).not.toHaveProperty('descripcion');
    expect(opciones[0]).not.toHaveProperty('candidato_id');
    expect(opciones[0]).not.toHaveProperty('simbolo');
  });

  it('[2.6] el select de las 3 ramas nunca incluye foto/plan_trabajo (columnas Bytes)', async () => {
    const prisma = construirPrisma({});
    const servicio = construirServicio(prisma);

    await servicio.obtenerOpciones('proceso-1', 'municipio');
    await servicio.obtenerOpciones('proceso-1', 'representante_aula');
    await servicio.obtenerOpciones('proceso-1', 'consulta');

    const listaCall = prisma.lista.findMany.mock.calls[0][0];
    expect(listaCall.select).not.toHaveProperty('plan_trabajo');
    expect(listaCall.select.candidatos.select).not.toHaveProperty('foto');
    expect(listaCall.select.plan_trabajo_mime).toBe(true);
    expect(listaCall.select.candidatos.select.foto_mime).toBe(true);

    const candidatoCall = prisma.candidato.findMany.mock.calls[0][0];
    expect(candidatoCall.select).not.toHaveProperty('foto');
    expect(candidatoCall.select.foto_mime).toBe(true);
  });

  it('[2.7] cargo se omite del payload cuando es null (regla homogénea del mapper, sin rama especial por tipo)', async () => {
    const prisma = construirPrisma({
      candidatoFindMany: jest.fn().mockResolvedValue([
        { id: 'cand-1', nombres: 'Carlos', cargo: null, foto_mime: null },
      ]),
    });
    const servicio = construirServicio(prisma);

    const opciones = await servicio.obtenerOpciones('proceso-1', 'padres');

    expect(opciones).toEqual([
      {
        id: 'cand-1',
        etiqueta: 'Carlos',
        candidato_id: 'cand-1',
        candidato_nombres: 'Carlos',
        foto_presente: false,
      },
    ]);
    expect(opciones[0]).not.toHaveProperty('cargo');
  });
});
