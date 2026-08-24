import { construirModelo } from './dimensiones';

/**
 * reportes-y-exportaciones (#18, PR2; design.md D6, tareas 5.1-5.7). Doble de
 * `Prisma.TransactionClient`, sin Postgres — mismo idioma de doble que `escrutinio.spec.ts` /
 * `resultados.service.spec.ts`.
 */
describe('dimensiones.ts (D6)', () => {
  const PROCESO_ID = '33333333-3333-3333-3333-333333333333';
  const AHORA = new Date('2026-08-23T10:00:00.000Z');

  let tx: {
    derechoVoto: { count: jest.Mock };
    voto: { count: jest.Mock; groupBy: jest.Mock };
    lista: { findMany: jest.Mock };
    candidato: { findMany: jest.Mock };
    opcionConsulta: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };

  function joinSql(callIndex = 0): string {
    const call = tx.$queryRaw.mock.calls[callIndex];
    const strings = call[0] as TemplateStringsArray;
    return strings.join(' ');
  }

  beforeEach(() => {
    tx = {
      derechoVoto: { count: jest.fn().mockResolvedValue(0) },
      voto: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
      lista: { findMany: jest.fn().mockResolvedValue([]) },
      candidato: { findMany: jest.fn().mockResolvedValue([]) },
      opcionConsulta: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) =>
        strings.join('').includes('now()') ? Promise.resolve([{ ahora: AHORA }]) : Promise.resolve([]),
      ),
    };
  });

  // 5.1 — secciones[0] esperada por dimensión
  it('[5.1] participacion: secciones[0] es "resumen"', async () => {
    tx.derechoVoto.count.mockResolvedValue(10);
    tx.voto.count.mockResolvedValue(7);

    const modelo = await construirModelo('participacion', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'pdf',
      gate: true,
    });

    expect(modelo.secciones[0].clave).toBe('resumen');
  });

  it('[5.1] votantes: secciones[0] es "votantes"', async () => {
    const modelo = await construirModelo('votantes', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    expect(modelo.secciones[0].clave).toBe('votantes');
  });

  it('[5.1] abstenciones: secciones[0] es "abstenciones"', async () => {
    const modelo = await construirModelo('abstenciones', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    expect(modelo.secciones[0].clave).toBe('abstenciones');
  });

  it('[5.1] resultados: secciones[0] es "desglose" cuando gate=false', async () => {
    tx.voto.groupBy.mockResolvedValue([{ candidato_id: 'c1', _count: { _all: 4 } }]);
    tx.candidato.findMany.mockResolvedValue([
      { id: 'c1', nombres: 'Ana', estado: 'activo', baja_en: null },
    ]);

    const modelo = await construirModelo('resultados', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'pdf',
      gate: false,
    });

    expect(modelo.secciones[0].clave).toBe('desglose');
  });

  it('[5.1] candidatos: secciones[0] es "candidatos"', async () => {
    const modelo = await construirModelo('candidatos', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'excel',
      gate: false,
    });

    expect(modelo.secciones[0].clave).toBe('candidatos');
  });

  it('[5.1] consultas: secciones[0] es "opciones"', async () => {
    const modelo = await construirModelo('consultas', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'consulta',
      formato: 'excel',
      gate: false,
    });

    expect(modelo.secciones[0].clave).toBe('opciones');
  });

  // 5.2 — invariante de #16: con gate=true nunca se llama calcularEscrutinio (groupBy)
  it.each(['participacion', 'resultados'])('[5.2] %s con gate=true no invoca voto.groupBy', async (dimension) => {
    tx.derechoVoto.count.mockResolvedValue(10);
    tx.voto.count.mockResolvedValue(7);

    await construirModelo(dimension, tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'pdf',
      gate: true,
    });

    expect(tx.voto.groupBy).not.toHaveBeenCalled();
    expect(tx.candidato.findMany).not.toHaveBeenCalled();
    expect(tx.lista.findMany).not.toHaveBeenCalled();
  });

  // 5.3 — votantes: SELECT cerrado, nunca columnas prohibidas
  it('[5.3] votantes no proyecta lista_id/opcion_id/candidato_id/blanco/codigo_comprobante', async () => {
    await construirModelo('votantes', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    const sql = joinSql(0);
    expect(sql).not.toMatch(/lista_id|opcion_id|candidato_id|blanco|codigo_comprobante/);
  });

  // 5.4 — abstenciones: mismo criterio
  it('[5.4] abstenciones no proyecta lista_id/opcion_id/candidato_id/blanco/codigo_comprobante', async () => {
    await construirModelo('abstenciones', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    const sql = joinSql(0);
    expect(sql).not.toMatch(/lista_id|opcion_id|candidato_id|blanco|codigo_comprobante/);
  });

  // 5.5 — ninguna de las dos dimensiones nominales proyecta dni
  it.each(['votantes', 'abstenciones'])('[5.5] %s no proyecta u.dni', async (dimension) => {
    await construirModelo(dimension, tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    const sql = joinSql(0);
    expect(sql).not.toMatch(/\bdni\b/);
  });

  // 5.6 — candidatos sobre un proceso "consulta" devuelve 0 filas sin lanzar
  it('[5.6] candidatos sin resultados no lanza y produce 0 filas', async () => {
    tx.candidato.findMany.mockResolvedValue([]);

    const modelo = await construirModelo('candidatos', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'consulta',
      formato: 'excel',
      gate: false,
    });

    expect(modelo.secciones[0].filas).toEqual([]);
  });

  // Bugfix descubierto en el e2e de PR3 (test/reportes/reportes-solicitud.e2e-spec.ts): Postgres
  // rechaza `proceso_id = ${procesoId}` sin cast (`operator does not exist: uuid = text`, código
  // 42883) porque `$queryRaw` interpola el parámetro sin tipo. Regresión: las tres consultas
  // nominales/de agregación deben castear explícitamente a `::uuid`, mismo criterio que
  // `panel-jornada.service.ts`.
  it('[bugfix] seccionPorAula (participacion) castea proceso_id a ::uuid', async () => {
    tx.derechoVoto.count.mockResolvedValue(0);
    tx.voto.count.mockResolvedValue(0);

    await construirModelo('participacion', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'pdf',
      gate: true,
    });

    const llamadaPorAula = tx.$queryRaw.mock.calls.find((call) => {
      const strings = call[0] as TemplateStringsArray;
      return strings.join(' ').includes('DerechoVoto');
    });
    expect(llamadaPorAula).toBeDefined();
    // el placeholder ${procesoId}::uuid deja la palabra "uuid" en el fragmento SQL siguiente
    const indiceFragmento = (llamadaPorAula![0] as TemplateStringsArray).findIndex((s) => s.includes('proceso_id ='));
    expect((llamadaPorAula![0] as TemplateStringsArray)[indiceFragmento + 1]).toMatch(/^::uuid/);
  });

  it('[bugfix] seccionVotantes castea proceso_id a ::uuid', async () => {
    await construirModelo('votantes', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    const call = tx.$queryRaw.mock.calls[0];
    const strings = call[0] as TemplateStringsArray;
    const indice = strings.findIndex((s) => s.includes('proceso_id ='));
    expect(strings[indice + 1]).toMatch(/^::uuid/);
  });

  it('[bugfix] seccionAbstenciones castea proceso_id a ::uuid', async () => {
    await construirModelo('abstenciones', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'csv',
      gate: false,
    });

    const call = tx.$queryRaw.mock.calls[0];
    const strings = call[0] as TemplateStringsArray;
    const indice = strings.findIndex((s) => s.includes('proceso_id ='));
    expect(strings[indice + 1]).toMatch(/^::uuid/);
  });

  // 5.7 — padrón 0 => porcentaje 0, sin NaN
  it('[5.7] padrón 0 produce porcentaje 0 sin NaN', async () => {
    tx.derechoVoto.count.mockResolvedValue(0);
    tx.voto.count.mockResolvedValue(0);

    const modelo = await construirModelo('resultados', tx as never, {
      procesoId: PROCESO_ID,
      tipo: 'representante_aula',
      formato: 'pdf',
      gate: true,
    });

    const resumen = modelo.secciones.find((s) => s.clave === 'resumen');
    expect(resumen?.filas[0]).toEqual([0, 0, 0, 0]);
  });
});
