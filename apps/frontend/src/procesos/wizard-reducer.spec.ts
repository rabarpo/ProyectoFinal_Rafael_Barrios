import { describe, expect, it } from 'vitest';
import { estadoInicial, wizardReducer, type ProcesoParaReabrir } from './wizard-reducer';

// [spec: electoral-process-wizard, "Selección de tipo determina las opciones
// de segmentación disponibles"] y design.md D7 ("cambiar tipo invalida
// alcance; cambiar alcance invalida la selección"). Vitest sin DOM (design.md
// D7, "Unit (frontend)").
describe('wizard-reducer', () => {
  it('cambiar tipo invalida alcance', () => {
    let estado = estadoInicial();
    estado = wizardReducer(estado, { tipo: 'CAMBIAR_ALCANCE', valor: 'institucion' });
    expect(estado.segmentacion.alcance).toBe('institucion');

    estado = wizardReducer(estado, { tipo: 'CAMBIAR_TIPO_PROCESO', valor: 'representante_aula' });

    expect(estado.datos.tipo).toBe('representante_aula');
    expect(estado.segmentacion.alcance).toBeUndefined();
  });

  it('cambiar alcance limpia la selección previa', () => {
    let estado = estadoInicial();
    estado = wizardReducer(estado, { tipo: 'CAMBIAR_ALCANCE', valor: 'aulas' });
    estado = wizardReducer(estado, { tipo: 'CAMBIAR_AULAS', valor: ['aula-1', 'aula-2'] });
    expect(estado.segmentacion.aula_ids).toEqual(['aula-1', 'aula-2']);

    estado = wizardReducer(estado, { tipo: 'CAMBIAR_ALCANCE', valor: 'grados' });

    expect(estado.segmentacion.alcance).toBe('grados');
    expect(estado.segmentacion.aula_ids).toEqual([]);
    expect(estado.segmentacion.grado_ids).toEqual([]);
    expect(estado.segmentacion.nivel_id).toBeUndefined();
  });

  it('ocultar_resultados arranca en true para proceso nuevo', () => {
    expect(estadoInicial().ocultar_resultados).toBe(true);
  });

  it('INICIALIZAR respeta el valor de ocultar_resultados persistido al reabrir', () => {
    const procesoPersistido: ProcesoParaReabrir = {
      nombre: 'Elección de municipio escolar',
      descripcion: undefined,
      tipo: 'municipio',
      fecha_apertura_prevista: '2026-09-01T00:00:00.000Z',
      fecha_cierre_prevista: '2026-09-02T00:00:00.000Z',
      ocultar_resultados: false,
      publico_objetivo: 'estudiantes',
      alcance: 'institucion',
      nivel_id_snapshot: undefined,
      grado_ids_snapshot: [],
      aulas: [],
    };

    const estado = wizardReducer(estadoInicial(), { tipo: 'INICIALIZAR', proceso: procesoPersistido });

    expect(estado.ocultar_resultados).toBe(false);
    expect(estado.datos.nombre).toBe('Elección de municipio escolar');
    expect(estado.segmentacion.alcance).toBe('institucion');
  });

  it('INICIALIZAR también respeta ocultar_resultados = true persistido', () => {
    const procesoPersistido: ProcesoParaReabrir = {
      nombre: 'Consulta',
      tipo: 'consulta',
      fecha_apertura_prevista: '2026-09-01T00:00:00.000Z',
      fecha_cierre_prevista: '2026-09-02T00:00:00.000Z',
      ocultar_resultados: true,
      publico_objetivo: 'comunidad',
      alcance: 'nivel',
      nivel_id_snapshot: 'nivel-1',
      grado_ids_snapshot: [],
      aulas: [],
    };

    const estado = wizardReducer(estadoInicial(), { tipo: 'INICIALIZAR', proceso: procesoPersistido });

    expect(estado.ocultar_resultados).toBe(true);
    expect(estado.segmentacion.nivel_id).toBe('nivel-1');
  });

  it('SIGUIENTE y ANTERIOR mueven el paso sin perder el resto del estado', () => {
    let estado = estadoInicial();
    estado = wizardReducer(estado, { tipo: 'CAMBIAR_NOMBRE', valor: 'Elección de comité' });
    estado = wizardReducer(estado, { tipo: 'SIGUIENTE' });

    expect(estado.paso).toBe(2);
    expect(estado.datos.nombre).toBe('Elección de comité');

    estado = wizardReducer(estado, { tipo: 'ANTERIOR' });
    expect(estado.paso).toBe(1);
    expect(estado.datos.nombre).toBe('Elección de comité');
  });
});
