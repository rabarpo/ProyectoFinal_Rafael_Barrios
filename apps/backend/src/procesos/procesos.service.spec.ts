import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ProcesosService } from './procesos.service';

/**
 * administracion-procesos-electorales, PR6 (design.md D3/D6, tareas 16.2/17.1-17.8). Unit tests
 * con `PrismaService`/`ConfiguracionLecturaService`/`AuditoriaService` mockeados — mismo criterio
 * que `padron.service.spec.ts` (PR5). Cobertura de integración/e2e real equivalente (contra
 * Postgres vivo) queda en `test/procesos/procesos-crear.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR5 previos de este change): sin daemon Docker en
 * este entorno, la suite e2e no pudo correrse hasta GREEN en esta sesión. Estas unit tests SÍ
 * corren en verde y cubren 17.1-17.5/17.7 (17.6, rechazo de rol antes del handler, es una
 * propiedad de `RolesGuard`, ya cubierta por sus propios tests y por los casos 403 replicados en
 * el e2e de este PR — no hay nada que ejercitar en `ProcesosService` para ese caso).
 */

const BASE_DTO = {
  nombre: 'Elección de representantes',
  tipo: 'representante_aula' as const,
  fecha_apertura_prevista: '2026-09-01T09:00:00.000Z',
  fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
  publico_objetivo: 'estudiantes' as const,
  alcance: 'aulas' as const,
  aula_ids: ['au1', 'au2'],
};

function construirPrisma(overrides: {
  aulaFindMany?: jest.Mock;
  gradoFindMany?: jest.Mock;
  nivelFindUnique?: jest.Mock;
  matriculaGroupBy?: jest.Mock;
  procesoElectoralCreate?: jest.Mock;
  procesoAulaCreateMany?: jest.Mock;
  transactionImpl?: jest.Mock;
}) {
  const procesoElectoralCreate =
    overrides.procesoElectoralCreate ??
    jest.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: 'proceso-1',
        estado: 'borrador',
        ...data,
      }),
    );
  const procesoAulaCreateMany = overrides.procesoAulaCreateMany ?? jest.fn().mockResolvedValue({ count: 0 });

  const prisma = {
    aula: { findMany: overrides.aulaFindMany ?? jest.fn().mockResolvedValue([]) },
    grado: { findMany: overrides.gradoFindMany ?? jest.fn().mockResolvedValue([]) },
    nivel: { findUnique: overrides.nivelFindUnique ?? jest.fn().mockResolvedValue(null) },
    matricula: { groupBy: overrides.matriculaGroupBy ?? jest.fn().mockResolvedValue([]) },
    procesoElectoral: { create: procesoElectoralCreate },
    procesoAula: { createMany: procesoAulaCreateMany },
    $transaction:
      overrides.transactionImpl ??
      jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          procesoElectoral: { create: procesoElectoralCreate },
          procesoAula: { createMany: procesoAulaCreateMany },
        }),
      ),
  };

  return prisma;
}

function construirServicio(prisma: ReturnType<typeof construirPrisma>, anioEscolarActivoId: string | null) {
  const configuracionLectura = {
    anioEscolarActivoId: jest.fn().mockResolvedValue(anioEscolarActivoId),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };
  const servicio = new ProcesosService(
    prisma as unknown as PrismaService,
    configuracionLectura as unknown as ConfiguracionLecturaService,
    auditoria as unknown as AuditoriaService,
  );
  return { servicio, configuracionLectura, auditoria };
}

// 16.2: validación de tipo/nombre/fechas — CAMPO_INVALIDO 400.
describe('ProcesosService.crear() — validación de datos (D5, tarea 16.2)', () => {
  it('nombre ausente -> 400 CAMPO_INVALIDO', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, 'anio-1');
    await expect(
      servicio.crear({ ...BASE_DTO, nombre: '' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('tipo fuera del enum -> 400 CAMPO_INVALIDO', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, 'anio-1');
    await expect(
      servicio.crear({ ...BASE_DTO, tipo: 'docentes' as never }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fecha_apertura_prevista malformada -> 400 CAMPO_INVALIDO', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, 'anio-1');
    await expect(
      servicio.crear({ ...BASE_DTO, fecha_apertura_prevista: 'no-es-fecha' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('fecha_cierre_prevista <= fecha_apertura_prevista -> 400 CAMPO_INVALIDO motivo rango', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, 'anio-1');
    await expect(
      servicio.crear(
        { ...BASE_DTO, fecha_apertura_prevista: '2026-09-05T18:00:00.000Z', fecha_cierre_prevista: '2026-09-01T09:00:00.000Z' },
        'actor-1',
      ),
    ).rejects.toMatchObject({ response: { codigo: 'CAMPO_INVALIDO', campo: 'fecha_cierre_prevista', motivo: 'rango' } });
  });

  it('sin AnioEscolar activo -> 409 SIN_ANIO_ESCOLAR_ACTIVO', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, null);
    await expect(servicio.crear(BASE_DTO, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'SIN_ANIO_ESCOLAR_ACTIVO' },
    });
  });
});

// 17.1: representante_aula crea 1 ProcesoElectoral + N ProcesoAula en una $transaction.
describe('ProcesosService.crear() — lote de representante_aula (D3, tarea 17.1)', () => {
  it('[17.1] crea 1 ProcesoElectoral y N ProcesoAula en la misma $transaction', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([
        { id: 'au1', anio_escolar_id: 'anio-1' },
        { id: 'au2', anio_escolar_id: 'anio-1' },
      ]),
      matriculaGroupBy: jest.fn().mockResolvedValue([
        { aula_id: 'au1', _count: { _all: 3 } },
        { aula_id: 'au2', _count: { _all: 2 } },
      ]),
    });
    const { servicio, auditoria } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.crear(BASE_DTO, 'actor-1');

    expect(prisma.procesoElectoral.create).toHaveBeenCalledTimes(1);
    expect(prisma.procesoAula.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.procesoAula.createMany).toHaveBeenCalledWith({
      data: [
        { proceso_id: 'proceso-1', aula_id: 'au1' },
        { proceso_id: 'proceso-1', aula_id: 'au2' },
      ],
    });
    expect(respuesta.aulas).toEqual(['au1', 'au2']);
    expect(auditoria.log).toHaveBeenCalledTimes(1);
  });
});

// 17.2: aula sin matrícula activa queda excluida del lote, el resto sí se crea.
describe('ProcesosService.crear() — exclusión de aulas sin matrícula (D3, tarea 17.2)', () => {
  it('[17.2] aula sin matrícula activa no genera ProcesoAula; el resto sí', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([
        { id: 'au1', anio_escolar_id: 'anio-1' },
        { id: 'au2', anio_escolar_id: 'anio-1' },
      ]),
      matriculaGroupBy: jest.fn().mockResolvedValue([{ aula_id: 'au1', _count: { _all: 3 } }]),
    });
    const { servicio } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.crear(BASE_DTO, 'actor-1');

    expect(respuesta.aulas).toEqual(['au1']);
    expect(respuesta.aulas_excluidas).toEqual(['au2']);
    expect(prisma.procesoAula.createMany).toHaveBeenCalledWith({
      data: [{ proceso_id: 'proceso-1', aula_id: 'au1' }],
    });
  });

  it('0 aulas elegibles -> 409 SEGMENTACION_SIN_ELEGIBLES, sin proceso creado', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1', anio_escolar_id: 'anio-1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValue([]),
    });
    const { servicio } = construirServicio(prisma, 'anio-1');

    await expect(
      servicio.crear({ ...BASE_DTO, aula_ids: ['au1'] }, 'actor-1'),
    ).rejects.toMatchObject({ response: { codigo: 'SEGMENTACION_SIN_ELEGIBLES', aulas_evaluadas: 1 } });
    expect(prisma.procesoElectoral.create).not.toHaveBeenCalled();
  });
});

// 17.3: aula sin Candidato crea ProcesoAula igual, sin error de validación de candidatos.
describe('ProcesosService.crear() — sin validar Candidato (spec, tarea 17.3)', () => {
  it('[17.3] no consulta ni valida Candidato en ningún punto del flujo', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1', anio_escolar_id: 'anio-1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValue([{ aula_id: 'au1', _count: { _all: 1 } }]),
    });
    // A propósito: el mock de `prisma` no declara `candidato`. Si `crear()` intentara tocarlo,
    // esta prueba fallaría con un TypeError en vez de pasar en verde.
    const { servicio } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.crear({ ...BASE_DTO, aula_ids: ['au1'] }, 'actor-1');

    expect(respuesta.aulas).toEqual(['au1']);
  });
});

// 17.4: representante_aula + alcance=institucion -> 409 SEGMENTACION_INVALIDA.
describe('ProcesosService.crear() — tipo↔alcance (D3, tarea 17.4)', () => {
  it('[17.4] representante_aula + institucion -> 409 SEGMENTACION_INVALIDA, sin proceso creado', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, 'anio-1');

    await expect(
      servicio.crear({ ...BASE_DTO, alcance: 'institucion', aula_ids: undefined }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'SEGMENTACION_INVALIDA', tipo: 'representante_aula', alcance: 'institucion' },
    });
    expect(prisma.procesoElectoral.create).not.toHaveBeenCalled();
  });
});

// 17.5: exactamente una fila PROCESO_CREADO por creación, incluido el lote.
describe('ProcesosService.crear() — auditoría (D6, tarea 17.5)', () => {
  it('[17.5] AuditoriaService.log() se llama exactamente una vez, con PROCESO_CREADO y aulas=N', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([
        { id: 'au1', anio_escolar_id: 'anio-1' },
        { id: 'au2', anio_escolar_id: 'anio-1' },
      ]),
      matriculaGroupBy: jest.fn().mockResolvedValue([
        { aula_id: 'au1', _count: { _all: 3 } },
        { aula_id: 'au2', _count: { _all: 2 } },
      ]),
    });
    const { servicio, auditoria } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.crear(BASE_DTO, 'actor-1');

    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'PROCESO_CREADO',
      'actor-1',
      'ProcesoElectoral',
      respuesta.id,
      expect.objectContaining({ aulas: 2 }),
    );
  });
});

// 17.7: rollback forzado a mitad del lote -> sin proceso, sin ProcesoAula, sin evento de auditoría.
describe('ProcesosService.crear() — rollback (D6, tarea 17.7, adversarial)', () => {
  it('[17.7][adversarial] procesoAula.createMany falla -> crear() rechaza y NO audita', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([
        { id: 'au1', anio_escolar_id: 'anio-1' },
        { id: 'au2', anio_escolar_id: 'anio-1' },
      ]),
      matriculaGroupBy: jest.fn().mockResolvedValue([
        { aula_id: 'au1', _count: { _all: 3 } },
        { aula_id: 'au2', _count: { _all: 2 } },
      ]),
      procesoAulaCreateMany: jest.fn().mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      ),
    });
    const { servicio, auditoria } = construirServicio(prisma, 'anio-1');

    await expect(servicio.crear(BASE_DTO, 'actor-1')).rejects.toThrow('Unique constraint failed');

    // El código nunca llega a `auditoria.log()` después de que `createMany` falla dentro del mismo
    // callback de `$transaction`: en Postgres real, ese mismo fallo revierte también el `create`
    // del proceso que ya corrió antes en la misma transacción (spec: "sin proceso, sin ProcesoAula,
    // sin evento de auditoría").
    expect(auditoria.log).not.toHaveBeenCalled();
  });
});
