import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { PanelJornadaService } from './panel-jornada.service';

// dashboard-panel-jornada (Backlog #20, PR1; design.md D3/D4/D6/D7/D8/D11, tareas 3.1-3.11).
// PrismaService/Redis mockeados, idioma de `resultados.service.spec.ts`. `calcularEscrutinio` se
// mockea como spy que preserva el comportamiento real (`jest.requireActual`) para poder verificar
// que el modo oculto NUNCA lo invoca (D6, threat: Fuga de desglose en modo oculto).
jest.mock('../procesos/escrutinio', () => {
  const actual = jest.requireActual('../procesos/escrutinio');
  return { ...actual, calcularEscrutinio: jest.fn(actual.calcularEscrutinio) };
});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { calcularEscrutinio } = require('../procesos/escrutinio');

describe('PanelJornadaService (D3/D4/D6/D7/D8/D11)', () => {
  const PROCESO_ID = '11111111-1111-1111-1111-111111111111';
  const AHORA = new Date('2026-08-22T10:30:00.000Z');

  let service: PanelJornadaService;
  let prisma: {
    usuario: { count: jest.Mock };
    apoderado: { count: jest.Mock };
    procesoElectoral: { findUnique: jest.Mock };
    derechoVoto: { count: jest.Mock; groupBy: jest.Mock };
    voto: { count: jest.Mock; groupBy: jest.Mock };
    jobCorreo: { count: jest.Mock };
    procesoAula: { findMany: jest.Mock };
    aula: { findMany: jest.Mock };
    lista: { findMany: jest.Mock };
    candidato: { findMany: jest.Mock };
    opcionConsulta: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let redis: { get: jest.Mock; setex: jest.Mock };

  function tx() {
    return prisma;
  }

  // El double de `$queryRaw` distingue por el TEXTO de la consulta (tagged template): la fila
  // horaria (`date_trunc`) vs. el resto (`now()`). Robusto sin depender del orden exacto de
  // invocación entre `calcularParticipacion` y el conteo horario.
  let filasHorarias: { hora: Date; votos: number }[];

  beforeEach(async () => {
    jest.clearAllMocks();
    filasHorarias = [];

    prisma = {
      usuario: { count: jest.fn() },
      apoderado: { count: jest.fn() },
      procesoElectoral: { findUnique: jest.fn() },
      derechoVoto: { count: jest.fn(), groupBy: jest.fn().mockResolvedValue([]) },
      voto: { count: jest.fn(), groupBy: jest.fn() },
      jobCorreo: { count: jest.fn() },
      procesoAula: { findMany: jest.fn().mockResolvedValue([]) },
      aula: { findMany: jest.fn().mockResolvedValue([]) },
      lista: { findMany: jest.fn().mockResolvedValue([]) },
      candidato: { findMany: jest.fn().mockResolvedValue([]) },
      opcionConsulta: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
        const texto = Array.isArray(strings) ? strings.join('') : String(strings);
        if (texto.includes('date_trunc')) {
          return Promise.resolve(filasHorarias);
        }
        return Promise.resolve([{ ahora: AHORA }]);
      }),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx())),
    };
    redis = { get: jest.fn().mockResolvedValue(null), setex: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PanelJornadaService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(PanelJornadaService);
  });

  // 3.1 — spec: Conteo de estudiantes y vínculos apoderado-estudiante
  it('[3.1] institucion() cuenta usuario rol estudiante estado=activo + filas Apoderado crudas sin dedup', async () => {
    prisma.usuario.count.mockResolvedValue(42);
    prisma.apoderado.count.mockResolvedValue(7);

    const resultado = await service.institucion();

    expect(prisma.usuario.count).toHaveBeenCalledWith({ where: { rol: 'estudiante', estado: 'activo' } });
    expect(prisma.apoderado.count).toHaveBeenCalledWith();
    expect(resultado.estudiantes).toBe(42);
    expect(resultado.vinculos_apoderado).toBe(7);
  });

  // 3.2 — D11
  it('[3.2] resumen() con proceso inexistente lanza NotFoundException', async () => {
    prisma.procesoElectoral.findUnique.mockResolvedValue(null);

    await expect(service.resumen(PROCESO_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  // 3.3 — D11
  it('[3.3] resumen() con estado=borrador lanza ConflictException ESTADO_INVALIDO', async () => {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'borrador',
      tipo: 'municipio',
      ocultar_resultados: true,
      apertura_real: null,
      cierre_real: null,
    });

    let error: unknown;
    try {
      await service.resumen(PROCESO_ID);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ codigo: 'ESTADO_INVALIDO' });
  });

  function mockProcesoOcultoResumen() {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'abierto',
      tipo: 'municipio',
      ocultar_resultados: true,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: null,
    });
    prisma.derechoVoto.count.mockResolvedValue(10);
    prisma.voto.count.mockResolvedValue(3);
    prisma.jobCorreo.count.mockResolvedValue(1);
  }

  // 3.4 — threat: Fuga de desglose en modo oculto [D6, cerrado sin excepción]
  it('[3.4] resumen() con ocultar_resultados=true nunca invoca calcularEscrutinio', async () => {
    mockProcesoOcultoResumen();

    const resultado = await service.resumen(PROCESO_ID);

    expect(calcularEscrutinio).not.toHaveBeenCalled();
    expect(resultado.estado_visibilidad).toBe('oculto');
    expect(resultado.correos_fallidos).toBe(1);
  });

  function mockProcesoVisibleResumen() {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'abierto',
      tipo: 'municipio',
      ocultar_resultados: false,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: null,
    });
    prisma.derechoVoto.count.mockResolvedValue(10);
    prisma.voto.count.mockImplementation((args: { where: { blanco?: boolean } }) =>
      args.where.blanco ? Promise.resolve(1) : Promise.resolve(7),
    );
    prisma.jobCorreo.count.mockResolvedValue(2);
    prisma.voto.groupBy.mockResolvedValue([{ lista_id: 'lista-a', _count: { _all: 4 } }]);
    prisma.lista.findMany.mockResolvedValue([
      { id: 'lista-a', nombre: 'Lista A', estado: 'activo', baja_en: null },
    ]);
  }

  // 3.5
  it('[3.5] resumen() con ocultar_resultados=false invoca calcularEscrutinio y mapea sin spread (baja_en nunca sale)', async () => {
    mockProcesoVisibleResumen();

    const resultado = await service.resumen(PROCESO_ID);

    expect(calcularEscrutinio).toHaveBeenCalled();
    expect(resultado.desglose?.[0]).toEqual({ id: 'lista-a', etiqueta: 'Lista A', votos: 4, estado: 'activo' });
    expect((resultado.desglose?.[0] as unknown as Record<string, unknown>).baja_en).toBeUndefined();
    expect(resultado.correos_fallidos).toBe(2);
  });

  // 3.6 — D6, sin excepción para ninguno de los 3 roles autorizados (servicio sin parámetro de
  // rol: la equivalencia entre roles se garantiza estructuralmente, verificada además a nivel e2e)
  it('[3.6] estado_visibilidad === "oculto" es exactamente equivalente a ocultar_resultados === true', async () => {
    mockProcesoOcultoResumen();
    const oculto = await service.resumen(PROCESO_ID);
    expect(oculto.estado_visibilidad).toBe('oculto');

    jest.clearAllMocks();
    prisma.procesoAula.findMany.mockResolvedValue([]);
    redis.get.mockResolvedValue(null);
    prisma.$queryRaw.mockImplementation((strings: TemplateStringsArray) => {
      const texto = Array.isArray(strings) ? strings.join('') : String(strings);
      if (texto.includes('date_trunc')) return Promise.resolve(filasHorarias);
      return Promise.resolve([{ ahora: AHORA }]);
    });
    mockProcesoVisibleResumen();
    const visible = await service.resumen(PROCESO_ID);
    expect(visible.estado_visibilidad).toBe('visible');
  });

  // 3.7 — spec: Votos por hora
  it('[3.7] votosPorHora() rellena franjas vacías desde apertura_real hasta min(now, cierre_real)', async () => {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'abierto',
      tipo: 'municipio',
      ocultar_resultados: true,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: null,
    });
    filasHorarias = [{ hora: new Date('2026-08-22T09:00:00.000Z'), votos: 3 }];

    const resultado = await service.votosPorHora(PROCESO_ID);

    expect(resultado.franjas.map((f) => f.hora_inicio)).toEqual([
      '2026-08-22T08:00:00.000Z',
      '2026-08-22T09:00:00.000Z',
      '2026-08-22T10:00:00.000Z',
    ]);
    expect(resultado.franjas.find((f) => f.hora_inicio === '2026-08-22T08:00:00.000Z')?.votos).toBe(0);
    expect(resultado.franjas.find((f) => f.hora_inicio === '2026-08-22T09:00:00.000Z')?.votos).toBe(3);
    expect(resultado.franjas.find((f) => f.hora_inicio === '2026-08-22T10:00:00.000Z')?.votos).toBe(0);
  });

  it('[3.7b] votosPorHora() respeta cierre_real cuando es anterior a "ahora"', async () => {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'cerrado',
      tipo: 'municipio',
      ocultar_resultados: true,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: new Date('2026-08-22T09:00:00.000Z'),
    });
    filasHorarias = [];

    const resultado = await service.votosPorHora(PROCESO_ID);

    expect(resultado.franjas.map((f) => f.hora_inicio)).toEqual([
      '2026-08-22T08:00:00.000Z',
      '2026-08-22T09:00:00.000Z',
    ]);
  });

  function mockAvanceAulasBase() {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'abierto',
      tipo: 'municipio',
      ocultar_resultados: true,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: null,
    });
    prisma.derechoVoto.count.mockResolvedValue(100);
    prisma.voto.count.mockResolvedValue(50);
  }

  // 3.8 — spec: Avance por aula, límite exacto
  it('[3.8] avanceAulas(): aula en el límite exacto (porcentaje === global - umbral) es rezagada', async () => {
    mockAvanceAulasBase();
    prisma.procesoAula.findMany.mockResolvedValue([{ aula_id: 'aula-1' }]);
    prisma.derechoVoto.groupBy.mockImplementation((args: { where: { votos?: unknown } }) =>
      args.where.votos
        ? Promise.resolve([{ aula_snapshot: 'aula-1', _count: { _all: 7 } }])
        : Promise.resolve([{ aula_snapshot: 'aula-1', _count: { _all: 20 } }]),
    );
    prisma.aula.findMany.mockResolvedValue([
      { id: 'aula-1', turno: 'manana', grado: { nombre: 'Grado 1' }, seccion: { nombre: 'A' } },
    ]);

    const resultado = await service.avanceAulas(PROCESO_ID);
    const aula = resultado.aulas[0];

    expect(resultado.participacion_global_pp).toBe(50);
    expect(resultado.umbral_rezago_pp).toBe(15);
    expect(aula.porcentaje).toBe(35);
    expect(aula.rezagada).toBe(true);
  });

  it('[3.8b] avanceAulas(): aula un punto por encima del límite no es rezagada', async () => {
    mockAvanceAulasBase();
    prisma.procesoAula.findMany.mockResolvedValue([{ aula_id: 'aula-2' }]);
    prisma.derechoVoto.groupBy.mockImplementation((args: { where: { votos?: unknown } }) =>
      args.where.votos
        ? Promise.resolve([{ aula_snapshot: 'aula-2', _count: { _all: 8 } }])
        : Promise.resolve([{ aula_snapshot: 'aula-2', _count: { _all: 20 } }]),
    );
    prisma.aula.findMany.mockResolvedValue([
      { id: 'aula-2', turno: 'tarde', grado: { nombre: 'Grado 2' }, seccion: { nombre: 'B' } },
    ]);

    const resultado = await service.avanceAulas(PROCESO_ID);

    expect(resultado.aulas[0].porcentaje).toBe(40);
    expect(resultado.aulas[0].rezagada).toBe(false);
  });

  // 3.9 — threat: división por cero
  it('[3.9] aula con padron=0 nunca es rezagada', async () => {
    mockAvanceAulasBase();
    prisma.procesoAula.findMany.mockResolvedValue([{ aula_id: 'aula-vacia' }]);
    prisma.derechoVoto.groupBy.mockResolvedValue([]);
    prisma.aula.findMany.mockResolvedValue([
      { id: 'aula-vacia', turno: 'manana', grado: { nombre: 'Grado 3' }, seccion: { nombre: 'C' } },
    ]);

    const resultado = await service.avanceAulas(PROCESO_ID);

    expect(resultado.aulas[0].padron).toBe(0);
    expect(resultado.aulas[0].votos).toBe(0);
    expect(resultado.aulas[0].porcentaje).toBe(0);
    expect(resultado.aulas[0].rezagada).toBe(false);
  });

  // 3.10 — threat: inferencia en aulas pequeñas
  it('[3.10] avanceAulas() nunca emite desglose por candidato a nivel de aula, sólo participación', async () => {
    mockAvanceAulasBase();
    prisma.procesoAula.findMany.mockResolvedValue([{ aula_id: 'aula-1' }]);
    prisma.derechoVoto.groupBy.mockImplementation((args: { where: { votos?: unknown } }) =>
      args.where.votos
        ? Promise.resolve([{ aula_snapshot: 'aula-1', _count: { _all: 5 } }])
        : Promise.resolve([{ aula_snapshot: 'aula-1', _count: { _all: 10 } }]),
    );
    prisma.aula.findMany.mockResolvedValue([
      { id: 'aula-1', turno: 'manana', grado: { nombre: 'Grado 1' }, seccion: { nombre: 'A' } },
    ]);

    const resultado = await service.avanceAulas(PROCESO_ID);

    expect(Object.keys(resultado.aulas[0]).sort()).toEqual(
      ['aula_id', 'etiqueta', 'padron', 'porcentaje', 'rezagada', 'votos'].sort(),
    );
  });

  // 3.11 — D8, threat: Fuga de desglose por la puerta de proyección
  it('[3.11] proyeccion() nunca invoca calcularEscrutinio y el payload no tiene desglose/blancos/dimension', async () => {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'abierto',
      tipo: 'municipio',
      ocultar_resultados: true,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: null,
    });
    prisma.derechoVoto.count.mockResolvedValue(20);
    prisma.voto.count.mockResolvedValue(9);
    filasHorarias = [];
    prisma.procesoAula.findMany.mockResolvedValue([]);
    prisma.derechoVoto.groupBy.mockResolvedValue([]);

    const resultado = await service.proyeccion(PROCESO_ID);

    expect(calcularEscrutinio).not.toHaveBeenCalled();
    expect(Object.keys(resultado).sort()).toEqual(
      ['aulas', 'franjas', 'hora_servidor', 'padron_total', 'votos_emitidos'].sort(),
    );
    expect(resultado.padron_total).toBe(20);
    expect(resultado.votos_emitidos).toBe(9);
  });

  it('[3.11b] proyeccion() con ocultar_resultados=false igual nunca invoca calcularEscrutinio', async () => {
    prisma.procesoElectoral.findUnique.mockResolvedValue({
      estado: 'abierto',
      tipo: 'municipio',
      ocultar_resultados: false,
      apertura_real: new Date('2026-08-22T08:00:00.000Z'),
      cierre_real: null,
    });
    prisma.derechoVoto.count.mockResolvedValue(20);
    prisma.voto.count.mockResolvedValue(9);
    filasHorarias = [];
    prisma.procesoAula.findMany.mockResolvedValue([]);
    prisma.derechoVoto.groupBy.mockResolvedValue([]);

    const resultado = await service.proyeccion(PROCESO_ID);

    expect(calcularEscrutinio).not.toHaveBeenCalled();
    expect((resultado as unknown as Record<string, unknown>).desglose).toBeUndefined();
    expect((resultado as unknown as Record<string, unknown>).blancos).toBeUndefined();
    expect((resultado as unknown as Record<string, unknown>).dimension).toBeUndefined();
  });
});
