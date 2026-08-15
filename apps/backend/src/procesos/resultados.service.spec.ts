import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { serializar } from './resultados-cache';
import { ResultadosService } from './resultados.service';
import type { SesionUsuario } from '../auth/sesion-usuario';

// resultados-en-vivo (#16, PR1; design.md D2/D3/D4/D6/D7/D8, tareas 3.1-3.14). Idioma de
// `health.controller.spec.ts`: PrismaService y REDIS_CLIENT mockeados, sin Postgres ni Redis
// reales en esta fase.
describe('ResultadosService (D2/D3/D4/D6/D7/D8)', () => {
  const PROCESO_ID = '11111111-1111-1111-1111-111111111111';
  const SESION: SesionUsuario = { userId: 'usuario-1', rol: 'estudiante' } as SesionUsuario;

  let service: ResultadosService;
  let prisma: {
    derechoVoto: { count: jest.Mock };
    procesoElectoral: { findUnique: jest.Mock };
    voto: { count: jest.Mock; groupBy: jest.Mock };
    lista: { findMany: jest.Mock };
    candidato: { findMany: jest.Mock };
    opcionConsulta: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
    $transaction: jest.Mock;
  };
  let redis: { get: jest.Mock; setex: jest.Mock };

  function tx() {
    // La transacción interactiva recibe el mismo doble como `tx` (todos los métodos ya están
    // en `prisma`, mismo idioma de doble usado por `padron.service.spec.ts`).
    return prisma;
  }

  beforeEach(async () => {
    prisma = {
      derechoVoto: { count: jest.fn() },
      procesoElectoral: { findUnique: jest.fn() },
      voto: { count: jest.fn(), groupBy: jest.fn() },
      lista: { findMany: jest.fn() },
      candidato: { findMany: jest.fn() },
      opcionConsulta: { findMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ ahora: new Date('2026-08-15T14:32:07.123Z') }]),
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx())),
    };
    redis = { get: jest.fn(), setex: jest.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ResultadosService,
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = moduleRef.get(ResultadosService);
  });

  // 3.1 — threat: IDOR/enumeración; spec: Autorización por pertenencia
  it('sin DerechoVoto lanza ForbiddenException antes de leer ProcesoElectoral o la caché', async () => {
    prisma.derechoVoto.count.mockResolvedValue(0);

    await expect(service.obtener(PROCESO_ID, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.procesoElectoral.findUnique).not.toHaveBeenCalled();
    expect(redis.get).not.toHaveBeenCalled();
  });

  // 3.2 — proposal.md criterio de éxito: hit de caché ⇒ cero consultas de agregación
  it('hit de caché responde sin invocar ninguna consulta de agregación', async () => {
    prisma.derechoVoto.count.mockResolvedValue(1);
    const payloadCacheado = {
      estado_visibilidad: 'visible' as const,
      resultados_ocultos_por_configuracion: false,
      votos_emitidos: 3,
      padron_total: 10,
      hora_servidor: '2026-08-15T14:32:07.123Z',
      dimension: 'lista' as const,
      desglose: [{ id: 'x', etiqueta: 'Lista X', votos: 3, estado: 'activo' as const }],
      blancos: 0,
    };
    redis.get.mockResolvedValue(serializar(PROCESO_ID, payloadCacheado));

    const resultado = await service.obtener(PROCESO_ID, SESION);

    expect(resultado).toEqual(payloadCacheado);
    expect(prisma.procesoElectoral.findUnique).not.toHaveBeenCalled();
    expect(prisma.voto.count).not.toHaveBeenCalled();
    expect(prisma.voto.groupBy).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function mockProcesoOculto() {
    prisma.derechoVoto.count.mockResolvedValue(1);
    redis.get.mockResolvedValue(null);
    prisma.procesoElectoral.findUnique.mockResolvedValue({ tipo: 'municipio', ocultar_resultados: true });
    prisma.derechoVoto.count.mockImplementation((args: { where: { usuario_id?: string } }) =>
      args.where.usuario_id ? Promise.resolve(1) : Promise.resolve(10),
    );
    prisma.voto.count.mockResolvedValue(3);
  }

  // 3.3
  it('miss invoca la transacción con isolationLevel RepeatableRead y luego setex con TTL 8', async () => {
    mockProcesoOculto();

    await service.obtener(PROCESO_ID, SESION);

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
    expect(redis.setex).toHaveBeenCalledWith(`resultados:${PROCESO_ID}`, 8, expect.any(String));
  });

  // 3.4 — threat: fuga de resultados en modo oculto
  it('modo oculto responde exactamente los 5 campos, sin desglose/blancos/dimension', async () => {
    mockProcesoOculto();

    const resultado = await service.obtener(PROCESO_ID, SESION);

    expect(Object.keys(resultado).sort()).toEqual(
      ['estado_visibilidad', 'hora_servidor', 'padron_total', 'resultados_ocultos_por_configuracion', 'votos_emitidos'].sort(),
    );
    expect(resultado.estado_visibilidad).toBe('oculto');
    expect(resultado.resultados_ocultos_por_configuracion).toBe(true);
  });

  function mockProcesoVisibleMunicipio() {
    prisma.derechoVoto.count.mockImplementation((args: { where: { usuario_id?: string } }) =>
      args.where.usuario_id ? Promise.resolve(1) : Promise.resolve(10),
    );
    redis.get.mockResolvedValue(null);
    prisma.procesoElectoral.findUnique.mockResolvedValue({ tipo: 'municipio', ocultar_resultados: false });
    prisma.voto.count.mockImplementation((args: { where: { blanco?: boolean } }) =>
      args.where.blanco ? Promise.resolve(1) : Promise.resolve(7),
    );
    prisma.voto.groupBy.mockResolvedValue([
      { lista_id: 'lista-a', _count: { _all: 4 } },
      { lista_id: 'lista-b', _count: { _all: 2 } },
    ]);
    prisma.lista.findMany.mockResolvedValue([
      { id: 'lista-a', nombre: 'Lista A', estado: 'activo' },
      { id: 'lista-b', nombre: 'Lista B', estado: 'baja' },
      { id: 'lista-c', nombre: 'Lista C', estado: 'activo' },
    ]);
  }

  // 3.5
  it('modo visible: suma de desglose + blancos === votos_emitidos', async () => {
    mockProcesoVisibleMunicipio();

    const resultado = await service.obtener(PROCESO_ID, SESION);

    const sumaDesglose = (resultado.desglose ?? []).reduce((acc, fila) => acc + fila.votos, 0);
    expect(sumaDesglose + (resultado.blancos ?? 0)).toBe(resultado.votos_emitidos);
    expect(resultado.votos_emitidos).toBe(7);
    expect(resultado.blancos).toBe(1);
  });

  // 3.6 — opciones con 0 votos presentes
  it('un ítem del catálogo sin filas en groupBy aparece con 0 votos', async () => {
    mockProcesoVisibleMunicipio();

    const resultado = await service.obtener(PROCESO_ID, SESION);

    const listaC = resultado.desglose?.find((fila) => fila.id === 'lista-c');
    expect(listaC).toBeDefined();
    expect(listaC?.votos).toBe(0);
  });

  // 3.7 — catálogo sin filtrar estado: 'activo'
  it('un ítem en estado baja está presente en el desglose con su estado', async () => {
    mockProcesoVisibleMunicipio();

    const resultado = await service.obtener(PROCESO_ID, SESION);

    const listaB = resultado.desglose?.find((fila) => fila.id === 'lista-b');
    expect(listaB).toBeDefined();
    expect(listaB?.estado).toBe('baja');
  });

  // 3.8 — orden votos desc, etiqueta asc
  it('el desglose está ordenado por votos desc y etiqueta asc como desempate', async () => {
    mockProcesoVisibleMunicipio();

    const resultado = await service.obtener(PROCESO_ID, SESION);

    expect(resultado.desglose?.map((fila) => fila.id)).toEqual(['lista-a', 'lista-b', 'lista-c']);
  });

  // 3.9 — una dimension por cada tipo
  it.each([
    ['municipio', 'lista'],
    ['representante_aula', 'candidato'],
    ['padres', 'candidato'],
    ['consulta', 'opcion'],
  ])('tipo %s produce dimension %s', async (tipo, dimensionEsperada) => {
    prisma.derechoVoto.count.mockImplementation((args: { where: { usuario_id?: string } }) =>
      args.where.usuario_id ? Promise.resolve(1) : Promise.resolve(0),
    );
    redis.get.mockResolvedValue(null);
    prisma.procesoElectoral.findUnique.mockResolvedValue({ tipo, ocultar_resultados: false });
    prisma.voto.count.mockResolvedValue(0);
    prisma.voto.groupBy.mockResolvedValue([]);
    prisma.lista.findMany.mockResolvedValue([]);
    prisma.candidato.findMany.mockResolvedValue([]);
    prisma.opcionConsulta.findMany.mockResolvedValue([]);

    const resultado = await service.obtener(PROCESO_ID, SESION);

    expect(resultado.dimension).toBe(dimensionEsperada);
  });

  // 3.10 — sin campo nulos
  it('no existe campo "nulos" en ningún modo', async () => {
    mockProcesoVisibleMunicipio();
    const visible = await service.obtener(PROCESO_ID, SESION);
    expect((visible as unknown as Record<string, unknown>).nulos).toBeUndefined();

    mockProcesoOculto();
    const oculto = await service.obtener(PROCESO_ID, SESION);
    expect((oculto as unknown as Record<string, unknown>).nulos).toBeUndefined();
  });

  // 3.11 — comité y estudiante reciben el mismo flag
  it('estado_visibilidad === "oculto" es equivalente a resultados_ocultos_por_configuracion === true', async () => {
    mockProcesoOculto();
    const resultado = await service.obtener(PROCESO_ID, SESION);
    expect(resultado.estado_visibilidad === 'oculto').toBe(resultado.resultados_ocultos_por_configuracion);
  });

  // 3.12 — threat: caída/degradación de Redis
  it('redis.get que rechaza responde 200 calculado igual, sin propagar el error', async () => {
    mockProcesoOculto();
    redis.get.mockRejectedValue(new Error('ECONNRESET'));

    const resultado = await service.obtener(PROCESO_ID, SESION);

    expect(resultado.estado_visibilidad).toBe('oculto');
  });

  // 3.13
  it('redis.setex que rechaza responde 200 igual, sin propagar el error', async () => {
    mockProcesoOculto();
    redis.setex.mockRejectedValue(new Error('OOM'));

    const resultado = await service.obtener(PROCESO_ID, SESION);

    expect(resultado.estado_visibilidad).toBe('oculto');
  });

  // 3.14 — el catch de D8 es estrecho: un error de Prisma sigue burbujeando
  it('un error de Prisma en la agregación no se enmascara como cache-miss', async () => {
    prisma.derechoVoto.count.mockResolvedValue(1);
    redis.get.mockResolvedValue(null);
    prisma.$transaction.mockRejectedValue(new Error('conexión perdida'));

    await expect(service.obtener(PROCESO_ID, SESION)).rejects.toThrow('conexión perdida');
  });
});
