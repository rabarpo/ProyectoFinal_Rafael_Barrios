import { armarActas, NOTA_NULOS } from './actas-contenido';
import type { ArmarActasParams } from './actas-contenido';
import type { Escrutinio } from './escrutinio';

/**
 * cierre-escrutinio-actas (#17, PR3; design.md D6/D7/D8, tareas 10.1-10.8). Puro, sin base —
 * doble manual de `Escrutinio` (mismo shape que produce `calcularEscrutinio()`).
 */

const PROCESO = {
  id: 'proceso-1',
  nombre: 'Elección de representantes',
  tipo: 'representante_aula',
  apertura_real: '2026-08-18T09:00:00.000Z',
  cierre_real: '2026-08-18T18:00:00.000Z',
  ocultar_resultados: false,
};

const INSTITUCION = { nombre: 'Colegio Ejemplo', director: 'María Directora' };
const PADRON = { derechos_estudiante: 8, derechos_padre: 0, aulas: 1 };
const FIRMANTES = [{ nombre: '  Ana  ', cargo: ' Presidenta ' }];

function baseParams(overrides: Partial<ArmarActasParams> = {}): ArmarActasParams {
  const escrutinio: Escrutinio = {
    ahora: new Date('2026-08-18T18:00:01.000Z'),
    padron_total: 10,
    votos_emitidos: 8,
    blancos: 1,
    dimension: 'candidato',
    desglose: [
      { id: 'c1', etiqueta: 'Ana', votos: 4, estado: 'activo', baja_en: null },
      { id: 'c2', etiqueta: 'Beto', votos: 3, estado: 'activo', baja_en: null },
    ],
    ...(overrides.escrutinio ?? {}),
  };

  return {
    proceso: PROCESO,
    institucion: INSTITUCION,
    firmantes: FIRMANTES,
    generadoEn: '2026-08-18T18:00:02.000Z',
    padron: PADRON,
    escrutinio,
    ...overrides,
  };
}

describe('armarActas — cierre-escrutinio-actas D6/D7/D8', () => {
  // 10.1 Empate con 2 y con 3 máximos.
  it('[10.1] empate:true con 2 IDs empatados', () => {
    const params = baseParams({
      escrutinio: {
        ahora: new Date(),
        padron_total: 10,
        votos_emitidos: 8,
        blancos: 0,
        dimension: 'candidato',
        desglose: [
          { id: 'c1', etiqueta: 'Ana', votos: 4, estado: 'activo', baja_en: null },
          { id: 'c2', etiqueta: 'Beto', votos: 4, estado: 'activo', baja_en: null },
        ],
      },
    });
    const { escrutinio } = armarActas(params);
    expect(escrutinio.escrutinio.empate).toEqual({ empate: true, votos_maximos: 4, empatados: ['c1', 'c2'] });
  });

  it('[10.1] empate:true con 3 IDs empatados', () => {
    const params = baseParams({
      escrutinio: {
        ahora: new Date(),
        padron_total: 10,
        votos_emitidos: 9,
        blancos: 0,
        dimension: 'candidato',
        desglose: [
          { id: 'c1', etiqueta: 'Ana', votos: 3, estado: 'activo', baja_en: null },
          { id: 'c2', etiqueta: 'Beto', votos: 3, estado: 'activo', baja_en: null },
          { id: 'c3', etiqueta: 'Cami', votos: 3, estado: 'activo', baja_en: null },
        ],
      },
    });
    const { escrutinio } = armarActas(params);
    expect(escrutinio.escrutinio.empate.empate).toBe(true);
    expect(escrutinio.escrutinio.empate.empatados.sort()).toEqual(['c1', 'c2', 'c3']);
  });

  // 10.2 max === 0 no es empate; sin_votos:true.
  it('[10.2] max===0 => empate:false, sin_votos:true', () => {
    const params = baseParams({
      escrutinio: {
        ahora: new Date(),
        padron_total: 10,
        votos_emitidos: 0,
        blancos: 0,
        dimension: 'candidato',
        desglose: [
          { id: 'c1', etiqueta: 'Ana', votos: 0, estado: 'activo', baja_en: null },
          { id: 'c2', etiqueta: 'Beto', votos: 0, estado: 'activo', baja_en: null },
        ],
      },
    });
    const { escrutinio } = armarActas(params);
    expect(escrutinio.escrutinio.empate.empate).toBe(false);
    expect(escrutinio.escrutinio.sin_votos).toBe(true);
  });

  // 10.3 cuadra verdadero/falso.
  it('[10.3] cuadra:true en el caso feliz (padron = votos_por_opcion + blancos + abstenciones)', () => {
    const { escrutinio } = armarActas(baseParams());
    // padron_total=10, votos_por_opcion=7 (4+3), blancos=1, abstenciones=10-8=2 => 7+1+0+2=10
    expect(escrutinio.escrutinio.cuadre.cuadra).toBe(true);
    expect(escrutinio.escrutinio.cuadre.nulos).toBe(0);
  });

  it('[10.3] cuadra:false con un desglose manipulado que no cuadra', () => {
    const params = baseParams({
      escrutinio: {
        ahora: new Date(),
        padron_total: 10,
        votos_emitidos: 8,
        blancos: 1,
        dimension: 'candidato',
        // suma desglose = 5, pero votos_emitidos=8 y blancos=1 => votos_por_opcion+blancos+abst != padron
        desglose: [{ id: 'c1', etiqueta: 'Ana', votos: 5, estado: 'activo', baja_en: null }],
      },
    });
    const { escrutinio } = armarActas(params);
    expect(escrutinio.escrutinio.cuadre.cuadra).toBe(false);
  });

  // 10.4 padron_total === 0 => porcentaje 0, sin NaN/excepción.
  it('[10.4] padron_total===0 => porcentaje_participacion 0, sin NaN', () => {
    const params = baseParams({
      escrutinio: {
        ahora: new Date(),
        padron_total: 0,
        votos_emitidos: 0,
        blancos: 0,
        dimension: 'candidato',
        desglose: [],
      },
    });
    expect(() => armarActas(params)).not.toThrow();
    const { cierre, escrutinio } = armarActas(params);
    expect(cierre.participacion.porcentaje_participacion).toBe(0);
    expect(Number.isNaN(cierre.participacion.porcentaje_participacion)).toBe(false);
    expect(escrutinio.escrutinio.sin_votos).toBe(true);
  });

  // 10.5 nulos siempre 0 con nota fija.
  it('[10.5] nulos===0 y la nota fija está presente en las 4 raíces', () => {
    const actas = armarActas(baseParams());
    expect(actas.apertura.notas).toContain(NOTA_NULOS);
    expect(actas.cierre.notas).toContain(NOTA_NULOS);
    expect(actas.escrutinio.notas).toContain(NOTA_NULOS);
    expect(actas.oficial.notas).toContain(NOTA_NULOS);
    expect(actas.escrutinio.escrutinio.cuadre.nulos).toBe(0);
  });

  // 10.6 raíz común compartida; oficial embebe las tres secciones sin recalcular.
  it('[10.6] las 4 actas comparten la raíz común; oficial embebe apertura+participacion+escrutinio', () => {
    const actas = armarActas(baseParams());
    for (const acta of [actas.apertura, actas.cierre, actas.escrutinio, actas.oficial]) {
      expect(acta.version).toBe(1);
      expect(acta.proceso).toEqual(PROCESO);
      expect(acta.institucion).toEqual(INSTITUCION);
    }
    expect(actas.oficial.padron).toEqual(actas.apertura.padron);
    expect(actas.oficial.participacion).toEqual(actas.cierre.participacion);
    expect(actas.oficial.escrutinio).toEqual(actas.escrutinio.escrutinio);
  });

  // 10.7 firmantes llegan trim()eados.
  it('[10.7] firmantes llegan trim()eados al snapshot', () => {
    const actas = armarActas(baseParams());
    expect(actas.apertura.firmantes).toEqual([{ nombre: 'Ana', cargo: 'Presidenta' }]);
  });

  it('desglose expone porcentaje por fila, guardado con guarda de división por cero', () => {
    const { escrutinio } = armarActas(baseParams());
    const fila = escrutinio.escrutinio.desglose.find((f) => f.id === 'c1')!;
    expect(fila.porcentaje).toBeCloseTo(50, 5); // 4/8 = 50%
  });
});
