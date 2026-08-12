import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';
import type { PrismaService } from '../prisma/prisma.service';
import { derechosPorAula, PadronService, resolverAulas, validarSegmentacion } from './padron.service';

/**
 * administracion-procesos-electorales, PR5 (design.md D2/D2b/D3, tareas 13.1-13.7). Unit tests con
 * `PrismaService`/`ConfiguracionLecturaService` mockeados — mismo criterio que
 * `aulas.service.spec.ts`. Cobertura de integración/e2e real equivalente (contra Postgres vivo)
 * queda en `test/procesos/padron.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR5 previos de este change): `docker ps` no tiene
 * daemon Docker disponible en este entorno, así que la suite e2e no pudo correrse hasta GREEN en
 * esta sesión. Estas unit tests SÍ corren en verde y cubren 13.1-13.7 (los casos de integración
 * real de 13.3/13.4/13.5/13.6 se replican aquí contra un `PrismaService` mockeado en vez de
 * Postgres vivo).
 */

function construirPrisma(overrides: {
  aulaFindMany?: jest.Mock;
  gradoFindMany?: jest.Mock;
  nivelFindUnique?: jest.Mock;
  matriculaGroupBy?: jest.Mock;
  usuarioCount?: jest.Mock;
}) {
  const aula = { findMany: overrides.aulaFindMany ?? jest.fn().mockResolvedValue([]) };
  const grado = { findMany: overrides.gradoFindMany ?? jest.fn().mockResolvedValue([]) };
  const nivel = { findUnique: overrides.nivelFindUnique ?? jest.fn().mockResolvedValue(null) };
  const matricula = { groupBy: overrides.matriculaGroupBy ?? jest.fn().mockResolvedValue([]) };
  const usuario = { count: overrides.usuarioCount ?? jest.fn().mockResolvedValue(0) };

  const prisma = {
    aula,
    grado,
    nivel,
    matricula,
    usuario,
    $transaction: jest.fn((operaciones: Promise<unknown>[]) => Promise.all(operaciones)),
  };

  return prisma;
}

function construirServicio(prisma: ReturnType<typeof construirPrisma>, anioEscolarActivoId: string | null) {
  const configuracionLectura = {
    anioEscolarActivoId: jest.fn().mockResolvedValue(anioEscolarActivoId),
  };
  const servicio = new PadronService(
    prisma as unknown as PrismaService,
    configuracionLectura as unknown as ConfiguracionLecturaService,
  );
  return { servicio, configuracionLectura };
}

describe('validarSegmentacion() (D5, tarea 12.2)', () => {
  it('rechaza publico_objetivo fuera de {estudiantes,padres,comunidad} con CAMPO_INVALIDO', () => {
    expect(() =>
      validarSegmentacion({ publico_objetivo: 'docentes' as never, alcance: 'institucion' }),
    ).toThrow(BadRequestException);
  });

  it('rechaza alcance fuera de {institucion,nivel,grados,aulas} con CAMPO_INVALIDO', () => {
    expect(() =>
      validarSegmentacion({ publico_objetivo: 'estudiantes', alcance: 'seccion' as never }),
    ).toThrow(BadRequestException);
  });

  it('alcance=nivel sin nivel_id -> 400 CAMPO_INVALIDO', () => {
    expect(() => validarSegmentacion({ publico_objetivo: 'estudiantes', alcance: 'nivel' })).toThrow(
      BadRequestException,
    );
  });

  it('alcance=grados sin grado_ids -> 400 CAMPO_INVALIDO', () => {
    expect(() => validarSegmentacion({ publico_objetivo: 'estudiantes', alcance: 'grados' })).toThrow(
      BadRequestException,
    );
  });

  it('alcance=aulas sin aula_ids -> 400 CAMPO_INVALIDO', () => {
    expect(() => validarSegmentacion({ publico_objetivo: 'estudiantes', alcance: 'aulas' })).toThrow(
      BadRequestException,
    );
  });

  it('institucion no requiere ningún campo adicional', () => {
    expect(() =>
      validarSegmentacion({ publico_objetivo: 'estudiantes', alcance: 'institucion' }),
    ).not.toThrow();
  });
});

// 13.1: resolución de aulas por alcance (4 ramas); institucion prohibido para representante_aula.
describe('resolverAulas() (D3, tarea 13.1)', () => {
  const ANIO_ID = 'anio-1';

  it('[13.1] alcance=aulas devuelve los ids provistos si todos pertenecen al año activo', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([
        { id: 'au1', anio_escolar_id: ANIO_ID },
        { id: 'au2', anio_escolar_id: ANIO_ID },
      ]),
    });

    const resultado = await resolverAulas(
      prisma as unknown as PrismaService,
      ANIO_ID,
      { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: ['au1', 'au2'] },
    );

    expect(resultado).toEqual(['au1', 'au2']);
  });

  it('[13.1] alcance=grados resuelve todas las aulas de los grados en el año activo', async () => {
    const prisma = construirPrisma({
      gradoFindMany: jest.fn().mockResolvedValue([{ id: 'g1' }]),
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }, { id: 'au2' }]),
    });

    const resultado = await resolverAulas(prisma as unknown as PrismaService, ANIO_ID, {
      publico_objetivo: 'estudiantes',
      alcance: 'grados',
      grado_ids: ['g1'],
    });

    expect(resultado).toEqual(['au1', 'au2']);
    expect(prisma.aula.findMany).toHaveBeenCalledWith({
      where: { grado_id: { in: ['g1'] }, anio_escolar_id: ANIO_ID },
      select: { id: true },
    });
  });

  it('[13.1] alcance=nivel resuelve todas las aulas de los grados del nivel en el año activo', async () => {
    const prisma = construirPrisma({
      nivelFindUnique: jest.fn().mockResolvedValue({ id: 'n1' }),
      gradoFindMany: jest.fn().mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]),
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }]),
    });

    const resultado = await resolverAulas(prisma as unknown as PrismaService, ANIO_ID, {
      publico_objetivo: 'estudiantes',
      alcance: 'nivel',
      nivel_id: 'n1',
    });

    expect(resultado).toEqual(['au1']);
    expect(prisma.grado.findMany).toHaveBeenCalledWith({ where: { nivel_id: 'n1' }, select: { id: true } });
  });

  it('[13.1] alcance=institucion resuelve todas las aulas del año activo', async () => {
    const prisma = construirPrisma({ aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }, { id: 'au2' }]) });

    const resultado = await resolverAulas(prisma as unknown as PrismaService, ANIO_ID, {
      publico_objetivo: 'estudiantes',
      alcance: 'institucion',
    });

    expect(resultado).toEqual(['au1', 'au2']);
    expect(prisma.aula.findMany).toHaveBeenCalledWith({
      where: { anio_escolar_id: ANIO_ID },
      select: { id: true },
    });
  });

  it('[13.1] institucion + tipo=representante_aula -> 409 SEGMENTACION_INVALIDA', async () => {
    const prisma = construirPrisma({});

    await expect(
      resolverAulas(
        prisma as unknown as PrismaService,
        ANIO_ID,
        { publico_objetivo: 'estudiantes', alcance: 'institucion' },
        'representante_aula',
      ),
    ).rejects.toMatchObject({
      response: { codigo: 'SEGMENTACION_INVALIDA', tipo: 'representante_aula', alcance: 'institucion' },
    });
    expect(prisma.aula.findMany).not.toHaveBeenCalled();
  });
});

// 13.2: derivación de derechos por publico_objetivo, incluida la suma doble de comunidad.
describe('derechosPorAula() (D2, tarea 13.2)', () => {
  it('[13.2] estudiantes -> derechos = estudiantes', () => {
    expect(derechosPorAula('estudiantes', 10, 4)).toBe(10);
  });

  it('[13.2] padres -> derechos = con_apoderado (padres)', () => {
    expect(derechosPorAula('padres', 10, 4)).toBe(4);
  });

  it('[13.2][spec: doble derecho] comunidad -> derechos = estudiantes + con_apoderado', () => {
    expect(derechosPorAula('comunidad', 10, 4)).toBe(14);
  });
});

// 13.3: sin AnioEscolar activo -> 409 SIN_ANIO_ESCOLAR_ACTIVO.
describe('PadronService.calcular() — año escolar activo (D2b, tarea 13.3)', () => {
  it('[13.3] sin año escolar activo responde 409 SIN_ANIO_ESCOLAR_ACTIVO', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, null);

    await expect(
      servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'institucion' }),
    ).rejects.toMatchObject({ response: { codigo: 'SIN_ANIO_ESCOLAR_ACTIVO' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[13.3][adversarial] error lanzado es ConflictException, no una excepción genérica', async () => {
    const prisma = construirPrisma({});
    const { servicio } = construirServicio(prisma, null);

    await expect(
      servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'institucion' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// 13.4: exclusión de aulas sin matrícula activa del cálculo.
describe('PadronService.calcular() — exclusión de aulas sin matrícula activa (D3, tarea 13.4)', () => {
  it('[13.4] aula sin filas en el groupBy de estudiantes queda en aulas_excluidas, no en aulas', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }, { id: 'au2' }]),
      matriculaGroupBy: jest
        .fn()
        .mockResolvedValueOnce([{ aula_id: 'au1', _count: { _all: 5 } }])
        .mockResolvedValueOnce([{ aula_id: 'au1', _count: { _all: 2 } }]),
      usuarioCount: jest.fn().mockResolvedValue(5),
    });
    const { servicio } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'institucion' });

    expect(respuesta.aulas.map((a) => a.aula_id)).toEqual(['au1']);
    expect(respuesta.aulas_excluidas).toEqual(['au2']);
  });
});

// 13.5: estudiante con dos matrículas activas -> aviso MATRICULA_DUPLICADA, cuentas_distintas < estudiantes.
describe('PadronService.calcular() — MATRICULA_DUPLICADA (tarea 13.5)', () => {
  it('[13.5][adversarial] estudiantes > cuentas_distintas produce aviso MATRICULA_DUPLICADA', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }, { id: 'au2' }]),
      matriculaGroupBy: jest
        .fn()
        .mockResolvedValueOnce([
          { aula_id: 'au1', _count: { _all: 3 } },
          { aula_id: 'au2', _count: { _all: 3 } },
        ])
        .mockResolvedValueOnce([]),
      usuarioCount: jest.fn().mockResolvedValue(5), // un estudiante matriculado en au1 y au2 a la vez
    });
    const { servicio } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'institucion' });

    expect(respuesta.estudiantes).toBe(6);
    expect(respuesta.cuentas_distintas).toBe(5);
    expect(respuesta.estudiantes).toBeGreaterThan(respuesta.cuentas_distintas);
    expect(respuesta.aviso).toBe('MATRICULA_DUPLICADA');
  });

  it('[13.5] sin duplicados no aparece aviso', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValueOnce([{ aula_id: 'au1', _count: { _all: 3 } }]).mockResolvedValueOnce([]),
      usuarioCount: jest.fn().mockResolvedValue(3),
    });
    const { servicio } = construirServicio(prisma, 'anio-1');

    const respuesta = await servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'institucion' });

    expect(respuesta.aviso).toBeUndefined();
  });
});

// 13.6: aula_ids de otro año escolar -> 409 REFERENCIA_INEXISTENTE, nunca contadas.
describe('PadronService.calcular() / resolverAulas() — aula_ids de otro año (tarea 13.6)', () => {
  it('[13.6] aula_id de otro año escolar responde 409 REFERENCIA_INEXISTENTE sin contar nada', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1', anio_escolar_id: 'otro-anio' }]),
    });
    const { servicio } = construirServicio(prisma, 'anio-1');

    await expect(
      servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: ['au1'] }),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Aula', valor: 'au1' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[13.6] aula_id inexistente responde 409 REFERENCIA_INEXISTENTE', async () => {
    const prisma = construirPrisma({ aulaFindMany: jest.fn().mockResolvedValue([]) });
    const { servicio } = construirServicio(prisma, 'anio-1');

    await expect(
      servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: ['au-x'] }),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Aula', valor: 'au-x' },
    });
  });
});

// 13.7: POST /procesos/padron no crea ninguna fila de DerechoVoto.
describe('PadronService.calcular() — no materializa DerechoVoto (spec, tarea 13.7)', () => {
  it('[13.7][adversarial] calcular() nunca toca prisma.derechoVoto (mock sin ese delegate no revienta)', async () => {
    const prisma = construirPrisma({
      aulaFindMany: jest.fn().mockResolvedValue([{ id: 'au1' }]),
      matriculaGroupBy: jest.fn().mockResolvedValueOnce([{ aula_id: 'au1', _count: { _all: 1 } }]).mockResolvedValueOnce([]),
      usuarioCount: jest.fn().mockResolvedValue(1),
    });
    // A propósito: `prisma` no declara `derechoVoto`. Si `calcular()` intentara tocarlo,
    // esta prueba fallaría con un TypeError en vez de pasar en verde.
    const { servicio } = construirServicio(prisma, 'anio-1');

    await expect(
      servicio.calcular({ publico_objetivo: 'estudiantes', alcance: 'institucion' }),
    ).resolves.toBeDefined();
  });
});
