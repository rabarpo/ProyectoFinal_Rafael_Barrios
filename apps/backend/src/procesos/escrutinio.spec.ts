import { calcularEscrutinio, calcularParticipacion, catalogoDe } from './escrutinio';

// cierre-escrutinio-actas (#17, PR2; design.md D5, tareas 5.1-5.6). Doble de
// `Prisma.TransactionClient`, sin Postgres — mismo idioma de doble que `resultados.service.spec.ts`.
describe('escrutinio.ts (D5)', () => {
  const PROCESO_ID = '22222222-2222-2222-2222-222222222222';
  const AHORA = new Date('2026-08-18T14:32:07.123Z');

  let tx: {
    derechoVoto: { count: jest.Mock };
    voto: { count: jest.Mock; groupBy: jest.Mock };
    lista: { findMany: jest.Mock };
    candidato: { findMany: jest.Mock };
    opcionConsulta: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  beforeEach(() => {
    tx = {
      derechoVoto: { count: jest.fn() },
      voto: { count: jest.fn(), groupBy: jest.fn() },
      lista: { findMany: jest.fn() },
      candidato: { findMany: jest.fn() },
      opcionConsulta: { findMany: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([{ ahora: AHORA }]),
    };
  });

  // 5.1
  it.each([
    ['municipio', 'lista'],
    ['representante_aula', 'candidato'],
    ['padres', 'candidato'],
    ['consulta', 'opcion'],
  ])('catalogoDe(%s) produce dimension %s', (tipo, dimensionEsperada) => {
    expect(catalogoDe(tipo).dimension).toBe(dimensionEsperada);
  });

  function mockCatalogoConBaja() {
    tx.derechoVoto.count.mockResolvedValue(10);
    tx.voto.count.mockImplementation((args: { where: { blanco?: boolean } }) =>
      args.where.blanco ? Promise.resolve(1) : Promise.resolve(7),
    );
    tx.voto.groupBy.mockResolvedValue([
      { lista_id: 'lista-a', _count: { _all: 4 } },
      { lista_id: 'lista-b', _count: { _all: 2 } },
    ]);
    tx.lista.findMany.mockResolvedValue([
      { id: 'lista-a', nombre: 'Lista A', estado: 'activo', baja_en: null },
      { id: 'lista-b', nombre: 'Lista B', estado: 'baja', baja_en: new Date('2026-08-01T10:00:00.000Z') },
      { id: 'lista-c', nombre: 'Lista C', estado: 'activo', baja_en: null },
    ]);
  }

  // 5.2 — opciones con 0 votos presentes
  it('un ítem del catálogo sin filas en groupBy aparece con 0 votos', async () => {
    mockCatalogoConBaja();

    const escrutinio = await calcularEscrutinio(tx as never, PROCESO_ID, 'municipio');

    const listaC = escrutinio.desglose.find((fila) => fila.id === 'lista-c');
    expect(listaC).toBeDefined();
    expect(listaC?.votos).toBe(0);
  });

  // 5.3 — candidato/lista en baja presente con estado y baja_en
  it('un ítem en estado baja está presente con su estado y baja_en', async () => {
    mockCatalogoConBaja();

    const escrutinio = await calcularEscrutinio(tx as never, PROCESO_ID, 'municipio');

    const listaB = escrutinio.desglose.find((fila) => fila.id === 'lista-b');
    expect(listaB).toBeDefined();
    expect(listaB?.estado).toBe('baja');
    expect(listaB?.baja_en).toBe('2026-08-01T10:00:00.000Z');
  });

  // 5.4 — orden votos desc, etiqueta asc
  it('el desglose está ordenado por votos desc y etiqueta asc como desempate', async () => {
    mockCatalogoConBaja();

    const escrutinio = await calcularEscrutinio(tx as never, PROCESO_ID, 'municipio');

    expect(escrutinio.desglose.map((fila) => fila.id)).toEqual(['lista-a', 'lista-b', 'lista-c']);
  });

  // 5.5 — Σ desglose.votos + blancos === votos_emitidos
  it('la suma del desglose más blancos coincide con votos_emitidos', async () => {
    mockCatalogoConBaja();

    const escrutinio = await calcularEscrutinio(tx as never, PROCESO_ID, 'municipio');

    const sumaDesglose = escrutinio.desglose.reduce((acc, fila) => acc + fila.votos, 0);
    expect(sumaDesglose + escrutinio.blancos).toBe(escrutinio.votos_emitidos);
    expect(escrutinio.votos_emitidos).toBe(7);
    expect(escrutinio.blancos).toBe(1);
  });

  // 5.6 — calcularParticipacion NO ejecuta groupBy ni el findMany del catálogo (D5: el modo oculto
  // de #16 no debe calcular el desglose)
  it('calcularParticipacion no ejecuta groupBy ni findMany del catálogo', async () => {
    tx.derechoVoto.count.mockResolvedValue(10);
    tx.voto.count.mockResolvedValue(7);

    const participacion = await calcularParticipacion(tx as never, PROCESO_ID);

    expect(participacion).toEqual({ ahora: AHORA, padron_total: 10, votos_emitidos: 7 });
    expect(tx.voto.groupBy).not.toHaveBeenCalled();
    expect(tx.lista.findMany).not.toHaveBeenCalled();
    expect(tx.candidato.findMany).not.toHaveBeenCalled();
    expect(tx.opcionConsulta.findMany).not.toHaveBeenCalled();
  });

  // 5.1b — opcion nunca tiene baja_en/estado distinto de 'activo'
  it('dimension opcion: filas siempre activo con baja_en null', async () => {
    tx.derechoVoto.count.mockResolvedValue(5);
    tx.voto.count.mockImplementation((args: { where: { blanco?: boolean } }) =>
      args.where.blanco ? Promise.resolve(0) : Promise.resolve(5),
    );
    tx.voto.groupBy.mockResolvedValue([{ opcion_id: 'opcion-a', _count: { _all: 5 } }]);
    tx.opcionConsulta.findMany.mockResolvedValue([{ id: 'opcion-a', etiqueta: 'Sí' }]);

    const escrutinio = await calcularEscrutinio(tx as never, PROCESO_ID, 'consulta');

    expect(escrutinio.desglose).toEqual([
      { id: 'opcion-a', etiqueta: 'Sí', votos: 5, estado: 'activo', baja_en: null },
    ]);
  });
});
