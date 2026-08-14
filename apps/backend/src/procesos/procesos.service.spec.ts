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

/**
 * administracion-procesos-electorales, PR7 (design.md "Contratos HTTP"/D3/D5/D6, tareas
 * 19.1-21.5). Unit tests con `PrismaService`/`ConfiguracionLecturaService`/`AuditoriaService`
 * mockeados — mismo criterio que la sección PR6 de este archivo. Cobertura de integración/e2e real
 * equivalente (contra Postgres vivo) queda en
 * `test/procesos/procesos-listar-editar-eliminar.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR6 previos de este change): sin daemon Docker en
 * este entorno (`docker ps` no encuentra el daemon), esa suite e2e no pudo correrse hasta GREEN en
 * esta sesión. Queda escrita y type-checkeada. Estas unit tests SÍ corren en verde y cubren
 * 19.2-19.4/20.2-20.6/21.1-21.3 (19.1/20.1/21.4 son wiring de rutas y `RolesGuard`, ya cubiertos
 * por sus propios tests y por los 401/403 replicados en el e2e de este PR).
 */

const PROCESO_EXISTENTE_BASE = {
  id: 'proceso-1',
  nombre: 'Elección de representantes',
  descripcion: null,
  tipo: 'representante_aula' as const,
  estado: 'borrador' as const,
  fecha_apertura_prevista: new Date('2026-09-01T09:00:00.000Z'),
  fecha_cierre_prevista: new Date('2026-09-05T18:00:00.000Z'),
  apertura_real: null,
  cierre_real: null,
  ocultar_resultados: false,
  creado_en: new Date('2026-08-01T00:00:00.000Z'),
  publico_objetivo: 'estudiantes' as const,
  alcance: 'aulas' as const,
  nivel_id_snapshot: null,
  grado_ids_snapshot: [] as string[],
};

function construirPrismaPr7(overrides: {
  aulaFindMany?: jest.Mock;
  gradoFindMany?: jest.Mock;
  nivelFindUnique?: jest.Mock;
  matriculaGroupBy?: jest.Mock;
  procesoElectoralFindMany?: jest.Mock;
  procesoElectoralFindUnique?: jest.Mock;
  procesoElectoralUpdate?: jest.Mock;
  procesoElectoralDelete?: jest.Mock;
  procesoAulaDeleteMany?: jest.Mock;
  procesoAulaCreateMany?: jest.Mock;
  procesoAulaCount?: jest.Mock;
}) {
  const procesoElectoralUpdate =
    overrides.procesoElectoralUpdate ??
    jest.fn().mockImplementation(({ where, data }) =>
      Promise.resolve({ ...PROCESO_EXISTENTE_BASE, id: where.id, ...data }),
    );
  const procesoElectoralDelete = overrides.procesoElectoralDelete ?? jest.fn().mockResolvedValue(undefined);
  const procesoAulaDeleteMany = overrides.procesoAulaDeleteMany ?? jest.fn().mockResolvedValue({ count: 0 });
  const procesoAulaCreateMany = overrides.procesoAulaCreateMany ?? jest.fn().mockResolvedValue({ count: 0 });

  const prisma = {
    aula: { findMany: overrides.aulaFindMany ?? jest.fn().mockResolvedValue([]) },
    grado: { findMany: overrides.gradoFindMany ?? jest.fn().mockResolvedValue([]) },
    nivel: { findUnique: overrides.nivelFindUnique ?? jest.fn().mockResolvedValue(null) },
    matricula: { groupBy: overrides.matriculaGroupBy ?? jest.fn().mockResolvedValue([]) },
    procesoElectoral: {
      findMany: overrides.procesoElectoralFindMany ?? jest.fn().mockResolvedValue([]),
      findUnique: overrides.procesoElectoralFindUnique ?? jest.fn().mockResolvedValue(PROCESO_EXISTENTE_BASE),
      update: procesoElectoralUpdate,
      delete: procesoElectoralDelete,
    },
    procesoAula: {
      deleteMany: procesoAulaDeleteMany,
      createMany: procesoAulaCreateMany,
      count: overrides.procesoAulaCount ?? jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        procesoElectoral: { update: procesoElectoralUpdate, delete: procesoElectoralDelete },
        procesoAula: { deleteMany: procesoAulaDeleteMany, createMany: procesoAulaCreateMany },
      }),
    ),
  };

  return prisma;
}

function construirServicioPr7(prisma: ReturnType<typeof construirPrismaPr7>, anioEscolarActivoId: string | null) {
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

const SEGMENTACION_PATCH = {
  publico_objetivo: 'estudiantes' as const,
  alcance: 'aulas' as const,
  aula_ids: ['au3'],
};

// 19.2/19.3: GET /procesos filtra por estado; valor desconocido -> 400 CAMPO_INVALIDO.
describe('ProcesosService.listar() — filtro por estado/tipo (D5, tareas 19.2-19.3)', () => {
  it('[19.2] filtra por estado=borrador, pasa el where a Prisma', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = construirPrismaPr7({ procesoElectoralFindMany: findMany });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    await servicio.listar({ estado: 'borrador' });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ estado: 'borrador' }) }),
    );
  });

  it('[19.3] estado fuera del enum -> 400 CAMPO_INVALIDO, sin consultar Prisma', async () => {
    const findMany = jest.fn();
    const prisma = construirPrismaPr7({ procesoElectoralFindMany: findMany });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.listar({ estado: 'no-existe' })).rejects.toBeInstanceOf(BadRequestException);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('[19.3] tipo fuera del enum -> 400 CAMPO_INVALIDO', async () => {
    const prisma = construirPrismaPr7({});
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.listar({ tipo: 'no-existe' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'tipo' },
    });
  });
});

// 19.4: GET /procesos/:id incluye publico_objetivo, snapshot y ProcesoAula[].
describe('ProcesosService.detalle() — snapshot y ProcesoAula[] (spec, tarea 19.4)', () => {
  it('[19.4] incluye publico_objetivo, snapshot y aulas (ProcesoAula[])', async () => {
    const findUnique = jest.fn().mockResolvedValue({
      ...PROCESO_EXISTENTE_BASE,
      alcance: 'nivel',
      nivel_id_snapshot: 'nivel-1',
      procesoAulas: [{ aula_id: 'au1' }, { aula_id: 'au2' }],
    });
    const prisma = construirPrismaPr7({ procesoElectoralFindUnique: findUnique });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    const detalle = await servicio.detalle('proceso-1');

    expect(detalle.publico_objetivo).toBe('estudiantes');
    expect(detalle.nivel_id_snapshot).toBe('nivel-1');
    expect(detalle.aulas.sort()).toEqual(['au1', 'au2']);
  });

  it('proceso inexistente -> 404', async () => {
    const prisma = construirPrismaPr7({ procesoElectoralFindUnique: jest.fn().mockResolvedValue(null) });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.detalle('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// 20.2/20.6: PATCH regenera ProcesoAula[] según la nueva segmentación y audita exactamente una vez.
describe('ProcesosService.editar() — regeneración de ProcesoAula[] (D3, tareas 20.2/20.6)', () => {
  it('[20.2][20.6] deleteMany + createMany dentro de la misma $transaction, un solo PROCESO_EDITADO', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE });
    const prisma = construirPrismaPr7({
      procesoElectoralFindUnique: findUnique,
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au3', anio_escolar_id: 'anio-1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValue([{ aula_id: 'au3', _count: { _all: 1 } }]),
    });
    const { servicio, auditoria } = construirServicioPr7(prisma, 'anio-1');

    const respuesta = await servicio.editar('proceso-1', SEGMENTACION_PATCH, 'actor-1');

    expect(prisma.procesoAula.deleteMany).toHaveBeenCalledWith({ where: { proceso_id: 'proceso-1' } });
    expect(prisma.procesoAula.createMany).toHaveBeenCalledWith({
      data: [{ proceso_id: 'proceso-1', aula_id: 'au3' }],
    });
    expect(respuesta.aulas).toEqual(['au3']);
    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'PROCESO_EDITADO',
      'actor-1',
      'ProcesoElectoral',
      'proceso-1',
      expect.objectContaining({ aulas_despues: 1 }),
    );
  });
});

// 20.3: PATCH con tipo/estado en el body no los cambia (no están en ActualizarProcesoDto).
describe('ProcesosService.editar() — tipo/estado no editables (D3, tarea 20.3)', () => {
  it('[20.3] campos extra (tipo/estado) del body no se persisten', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE });
    const update = jest.fn().mockImplementation(({ where, data }) =>
      Promise.resolve({ ...PROCESO_EXISTENTE_BASE, id: where.id, ...data }),
    );
    const prisma = construirPrismaPr7({
      procesoElectoralFindUnique: findUnique,
      procesoElectoralUpdate: update,
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au3', anio_escolar_id: 'anio-1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValue([{ aula_id: 'au3', _count: { _all: 1 } }]),
    });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    // `tipo`/`estado` viajan en el body vía `as never` porque `ActualizarProcesoDto` no los declara
    // — la propiedad exacta de la spec es que ni siquiera compilan como argumento tipado normal.
    const dtoConCamposProhibidos = { ...SEGMENTACION_PATCH, tipo: 'municipio', estado: 'abierto' } as never;

    await servicio.editar('proceso-1', dtoConCamposProhibidos, 'actor-1');

    const dataEnviada = update.mock.calls[0][0].data;
    expect(dataEnviada.tipo).toBeUndefined();
    expect(dataEnviada.estado).toBeUndefined();
  });
});

// 20.4: PATCH sobre estado != borrador -> 409 PROCESO_NO_EDITABLE, sin cambios.
describe('ProcesosService.editar() — rechazo fuera de borrador (spec, tarea 20.4)', () => {
  it('[20.4] estado=abierto -> 409 PROCESO_NO_EDITABLE, ni update ni auditoría', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE, estado: 'abierto' });
    const prisma = construirPrismaPr7({ procesoElectoralFindUnique: findUnique });
    const { servicio, auditoria } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.editar('proceso-1', SEGMENTACION_PATCH, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'PROCESO_NO_EDITABLE', estado: 'abierto' },
    });
    expect(prisma.procesoElectoral.update).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  it('proceso inexistente -> 404', async () => {
    const prisma = construirPrismaPr7({ procesoElectoralFindUnique: jest.fn().mockResolvedValue(null) });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.editar('no-existe', SEGMENTACION_PATCH, 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// 20.5: reedición repetida sin límite de reintentos.
describe('ProcesosService.editar() — reedición repetida sin límite (spec, tarea 20.5)', () => {
  it('[20.5] tres ediciones sucesivas del mismo proceso se procesan todas', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE });
    const prisma = construirPrismaPr7({
      procesoElectoralFindUnique: findUnique,
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au3', anio_escolar_id: 'anio-1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValue([{ aula_id: 'au3', _count: { _all: 1 } }]),
    });
    const { servicio, auditoria } = construirServicioPr7(prisma, 'anio-1');

    await servicio.editar('proceso-1', SEGMENTACION_PATCH, 'actor-1');
    await servicio.editar('proceso-1', SEGMENTACION_PATCH, 'actor-1');
    await servicio.editar('proceso-1', SEGMENTACION_PATCH, 'actor-1');

    expect(prisma.procesoElectoral.update).toHaveBeenCalledTimes(3);
    expect(auditoria.log).toHaveBeenCalledTimes(3);
  });
});

// 21.1/21.3: DELETE elimina el proceso (cascada a ProcesoAula) y audita exactamente una vez.
describe('ProcesosService.eliminar() — eliminación en cascada y auditoría (spec, tareas 21.1/21.3)', () => {
  it('[21.1][21.3] delete() del proceso + una sola fila PROCESO_ELIMINADO', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE });
    const prisma = construirPrismaPr7({
      procesoElectoralFindUnique: findUnique,
      procesoAulaCount: jest.fn().mockResolvedValue(2),
    });
    const { servicio, auditoria } = construirServicioPr7(prisma, 'anio-1');

    await servicio.eliminar('proceso-1', 'actor-1');

    expect(prisma.procesoElectoral.delete).toHaveBeenCalledWith({ where: { id: 'proceso-1' } });
    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'PROCESO_ELIMINADO',
      'actor-1',
      'ProcesoElectoral',
      'proceso-1',
      expect.objectContaining({ aulas: 2 }),
    );
  });

  it('proceso inexistente -> 404', async () => {
    const prisma = construirPrismaPr7({ procesoElectoralFindUnique: jest.fn().mockResolvedValue(null) });
    const { servicio } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.eliminar('no-existe', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// 21.2: DELETE sobre estado != borrador -> 409 PROCESO_NO_EDITABLE, la fila permanece.
describe('ProcesosService.eliminar() — rechazo fuera de borrador (spec, tarea 21.2)', () => {
  it('[21.2] estado=cerrado -> 409 PROCESO_NO_EDITABLE, sin delete() ni auditoría', async () => {
    const findUnique = jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE, estado: 'cerrado' });
    const prisma = construirPrismaPr7({ procesoElectoralFindUnique: findUnique });
    const { servicio, auditoria } = construirServicioPr7(prisma, 'anio-1');

    await expect(servicio.eliminar('proceso-1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'PROCESO_NO_EDITABLE', estado: 'cerrado' },
    });
    expect(prisma.procesoElectoral.delete).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });
});

/**
 * apertura-proceso-congelamiento-padron (#13, PR2; design.md D3-D5/D9/D10, tareas 6.1-6.6/7.2).
 * `abrir()` — guarda de concurrencia cruda (`$queryRaw` `UPDATE ... RETURNING`, primera sentencia
 * cruda de un servicio en el repo, precedente `HealthController` (`SELECT 1`)) + relectura
 * idempotente/409 dentro de la misma transacción (D4: la escritura va primero, las lecturas
 * después, al revés de `crear()`/`editar()`). El mock de `tx.$queryRaw` es `jest.fn()` (D3, patrón
 * de `HealthController.spec.ts`). PR2 NO materializa `DerechoVoto` (PR3): los conteos del DTO de
 * respuesta se leen con `count()` real sobre una tabla aún vacía en este PR, por diseño (D10) — dan
 * siempre 0 hasta que PR3 agregue `createMany`.
 */

const PROCESO_ABIERTO_BASE = {
  ...PROCESO_EXISTENTE_BASE,
  estado: 'abierto' as const,
  apertura_real: new Date('2026-08-13T12:00:00.000Z'),
};

function construirPrismaAbrir(overrides: {
  queryRaw?: jest.Mock;
  procesoElectoralFindUnique?: jest.Mock;
  procesoAulaCount?: jest.Mock;
  derechoVotoCount?: jest.Mock;
}) {
  const queryRaw = overrides.queryRaw ?? jest.fn().mockResolvedValue([]);
  const procesoElectoralFindUnique = overrides.procesoElectoralFindUnique ?? jest.fn().mockResolvedValue(null);
  const procesoAulaCount = overrides.procesoAulaCount ?? jest.fn().mockResolvedValue(0);
  const derechoVotoCount = overrides.derechoVotoCount ?? jest.fn().mockResolvedValue(0);

  const tx = {
    $queryRaw: queryRaw,
    procesoElectoral: { findUnique: procesoElectoralFindUnique },
    procesoAula: { count: procesoAulaCount },
    derechoVoto: { count: derechoVotoCount },
  };

  const prisma = {
    $transaction: jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };

  return {
    prisma,
    tx,
    queryRaw,
    procesoElectoralFindUnique,
    procesoAulaCount,
    derechoVotoCount,
  };
}

function construirServicioAbrir(prisma: unknown, anioEscolarActivoId: string | null) {
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

describe('ProcesosService.abrir() — confirmación explícita (D9, tarea 6.1)', () => {
  it('[6.1] confirmar ausente -> 400 CAMPO_INVALIDO, sin abrir transacción', async () => {
    const { prisma } = construirPrismaAbrir({});
    const { servicio } = construirServicioAbrir(prisma, 'anio-1');

    await expect(servicio.abrir('proceso-1', {} as never, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'confirmar', motivo: 'requerido' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[6.1] confirmar=false -> 400 CAMPO_INVALIDO, sin abrir transacción', async () => {
    const { prisma } = construirPrismaAbrir({});
    const { servicio } = construirServicioAbrir(prisma, 'anio-1');

    await expect(servicio.abrir('proceso-1', { confirmar: false }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'confirmar', motivo: 'requerido' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ProcesosService.abrir() — año escolar activo (tarea 6.2)', () => {
  it('[6.2] sin año escolar activo -> 409 SIN_ANIO_ESCOLAR_ACTIVO, antes de abrir la transacción', async () => {
    const { prisma } = construirPrismaAbrir({});
    const { servicio } = construirServicioAbrir(prisma, null);

    await expect(servicio.abrir('proceso-1', { confirmar: true }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'SIN_ANIO_ESCOLAR_ACTIVO' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ProcesosService.abrir() — guarda con 0 filas, proceso inexistente (tarea 6.3)', () => {
  it('[6.3] guarda 0 filas + findUnique null -> 404 NotFoundException', async () => {
    const { prisma } = construirPrismaAbrir({
      queryRaw: jest.fn().mockResolvedValue([]),
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(null),
    });
    const { servicio } = construirServicioAbrir(prisma, 'anio-1');

    await expect(servicio.abrir('no-existe', { confirmar: true }, 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ProcesosService.abrir() — guarda con 0 filas, ya abierto (idempotencia, tarea 6.4)', () => {
  it('[6.4] guarda 0 filas + estado releído "abierto" -> 200 idempotente, conteos por count()', async () => {
    const { prisma, procesoAulaCount, derechoVotoCount } = construirPrismaAbrir({
      queryRaw: jest.fn().mockResolvedValue([]),
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(PROCESO_ABIERTO_BASE),
      procesoAulaCount: jest.fn().mockResolvedValue(2),
      derechoVotoCount: jest.fn().mockResolvedValue(0),
    });
    const { servicio, auditoria } = construirServicioAbrir(prisma, 'anio-1');

    const respuesta = await servicio.abrir('proceso-1', { confirmar: true }, 'actor-1');

    expect(respuesta.estado).toBe('abierto');
    expect(respuesta.id).toBe('proceso-1');
    expect(respuesta.aulas).toBe(2);
    expect(respuesta.derechos_totales).toBe(0);
    expect(procesoAulaCount).toHaveBeenCalledWith({ where: { proceso_id: 'proceso-1' } });
    expect(derechoVotoCount).toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });
});

describe('ProcesosService.abrir() — guarda con 0 filas, estado no abrible (tarea 6.5)', () => {
  it.each(['cerrado', 'acta_emitida'] as const)('[6.5] estado releído %s -> 409 PROCESO_NO_ABRIBLE', async (estado) => {
    const { prisma } = construirPrismaAbrir({
      queryRaw: jest.fn().mockResolvedValue([]),
      procesoElectoralFindUnique: jest.fn().mockResolvedValue({ ...PROCESO_EXISTENTE_BASE, estado }),
    });
    const { servicio } = construirServicioAbrir(prisma, 'anio-1');

    await expect(servicio.abrir('proceso-1', { confirmar: true }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'PROCESO_NO_ABRIBLE', estado },
    });
  });
});

describe('ProcesosService.abrir() — guarda exitosa desde borrador (D3/D4, tarea 6.6)', () => {
  it('[6.6] guarda con 1 fila -> UPDATE...RETURNING parametrizado, respuesta 200 con apertura_real sellada', async () => {
    const filaGuarda = {
      id: 'proceso-1',
      apertura_real: new Date('2026-08-13T12:00:00.000Z'),
      ocultar_resultados: true,
      publico_objetivo: 'estudiantes' as const,
      tipo: 'representante_aula' as const,
    };
    const { prisma, queryRaw, procesoElectoralFindUnique } = construirPrismaAbrir({
      queryRaw: jest.fn().mockResolvedValue([filaGuarda]),
    });
    const { servicio, auditoria } = construirServicioAbrir(prisma, 'anio-1');

    const respuesta = await servicio.abrir('proceso-1', { confirmar: true }, 'actor-1');

    expect(respuesta.estado).toBe('abierto');
    expect(respuesta.apertura_real).toBe('2026-08-13T12:00:00.000Z');
    expect(respuesta.ocultar_resultados).toBe(true);
    // La guarda es la ÚNICA fuente de la transición: no hay un findUnique previo (D4 — la escritura
    // va primero, nunca leer-y-luego-escribir).
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(procesoElectoralFindUnique).not.toHaveBeenCalled();
    // PR2 todavía no materializa ni audita (PR3, D6-D8/D11): el conteo de respuestaApertura() lee
    // una tabla vacía por diseño (D10).
    expect(auditoria.log).not.toHaveBeenCalled();
  });
});
