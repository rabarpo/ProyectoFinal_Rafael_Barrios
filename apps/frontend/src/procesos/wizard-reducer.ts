import type { components } from '@seei/contracts/src/generated/api';

export type TipoProceso = components['schemas']['CrearProcesoDto']['tipo'];
export type PublicoObjetivo = components['schemas']['CrearProcesoDto']['publico_objetivo'];
export type AlcanceSegmentacion = components['schemas']['CrearProcesoDto']['alcance'];

/**
 * datos del paso 1 del asistente (design.md D7). `tipo` empieza sin elegir:
 * el paso 1 obliga a elegirlo antes de avanzar, y elegirlo invalida la
 * `alcance` del paso 2 (spec: electoral-process-wizard, "Selección de tipo
 * determina las opciones de segmentación disponibles").
 */
export interface DatosProceso {
  nombre: string;
  descripcion: string;
  tipo: TipoProceso | undefined;
  fecha_apertura_prevista: string;
  fecha_cierre_prevista: string;
}

/**
 * segmentación del paso 2. `nivel_id`/`grado_ids`/`aula_ids` son mutuamente
 * excluyentes según `alcance` — el reducer los limpia todos juntos cuando
 * `alcance` cambia, para que nunca quede un valor huérfano de una selección
 * anterior (design.md D7, tabla de decisiones "Estado").
 */
export interface Segmentacion {
  publico_objetivo: PublicoObjetivo | undefined;
  alcance: AlcanceSegmentacion | undefined;
  nivel_id: string | undefined;
  grado_ids: string[];
  aula_ids: string[];
}

/**
 * `EstadoAsistente` con discriminador `paso` (design.md D7, tabla de
 * decisiones "Estado"): un `useReducer` concentra las invariantes entre
 * pasos en un archivo puro y testeable sin DOM.
 */
export interface EstadoAsistente {
  paso: 1 | 2 | 3 | 4;
  datos: DatosProceso;
  segmentacion: Segmentacion;
  /**
   * Pre-marcado en `true` para proceso nuevo (spec: "El asistente pre-marca
   * ocultar_resultados"); `INICIALIZAR` lo pisa con el valor persistido al
   * reabrir un borrador (spec: "El snapshot persiste la selección
   * original").
   */
  ocultar_resultados: boolean;
}

/** Subconjunto de `ProcesoDetalleRespuestaDto` que necesita `INICIALIZAR` al reabrir un borrador. */
export interface ProcesoParaReabrir {
  nombre: string;
  descripcion?: string;
  tipo: TipoProceso;
  fecha_apertura_prevista: string;
  fecha_cierre_prevista: string;
  ocultar_resultados: boolean;
  publico_objetivo: PublicoObjetivo;
  alcance: AlcanceSegmentacion;
  nivel_id_snapshot?: string;
  grado_ids_snapshot: string[];
  aulas: string[];
}

export type AccionAsistente =
  | { tipo: 'SIGUIENTE' }
  | { tipo: 'ANTERIOR' }
  | { tipo: 'CAMBIAR_NOMBRE'; valor: string }
  | { tipo: 'CAMBIAR_DESCRIPCION'; valor: string }
  | { tipo: 'CAMBIAR_TIPO_PROCESO'; valor: TipoProceso }
  | { tipo: 'CAMBIAR_FECHA_APERTURA'; valor: string }
  | { tipo: 'CAMBIAR_FECHA_CIERRE'; valor: string }
  | { tipo: 'CAMBIAR_PUBLICO_OBJETIVO'; valor: PublicoObjetivo }
  | { tipo: 'CAMBIAR_ALCANCE'; valor: AlcanceSegmentacion }
  | { tipo: 'CAMBIAR_NIVEL'; valor: string }
  | { tipo: 'CAMBIAR_GRADOS'; valor: string[] }
  | { tipo: 'CAMBIAR_AULAS'; valor: string[] }
  | { tipo: 'CAMBIAR_OCULTAR_RESULTADOS'; valor: boolean }
  | { tipo: 'INICIALIZAR'; proceso: ProcesoParaReabrir };

/** Estado inicial para un proceso nuevo: `ocultar_resultados` pre-marcado (spec). */
export function estadoInicial(): EstadoAsistente {
  return {
    paso: 1,
    datos: {
      nombre: '',
      descripcion: '',
      tipo: undefined,
      fecha_apertura_prevista: '',
      fecha_cierre_prevista: '',
    },
    segmentacion: {
      publico_objetivo: undefined,
      alcance: undefined,
      nivel_id: undefined,
      grado_ids: [],
      aula_ids: [],
    },
    ocultar_resultados: true,
  };
}

function segmentacionLimpia(): Segmentacion {
  return {
    publico_objetivo: undefined,
    alcance: undefined,
    nivel_id: undefined,
    grado_ids: [],
    aula_ids: [],
  };
}

export function wizardReducer(estado: EstadoAsistente, accion: AccionAsistente): EstadoAsistente {
  switch (accion.tipo) {
    case 'SIGUIENTE':
      return { ...estado, paso: (Math.min(4, estado.paso + 1) as EstadoAsistente['paso']) };
    case 'ANTERIOR':
      return { ...estado, paso: (Math.max(1, estado.paso - 1) as EstadoAsistente['paso']) };
    case 'CAMBIAR_NOMBRE':
      return { ...estado, datos: { ...estado.datos, nombre: accion.valor } };
    case 'CAMBIAR_DESCRIPCION':
      return { ...estado, datos: { ...estado.datos, descripcion: accion.valor } };
    case 'CAMBIAR_TIPO_PROCESO':
      // Cambiar tipo invalida alcance (spec: "Selección de tipo determina las
      // opciones de segmentación disponibles") — limpia toda la segmentación,
      // no solo `alcance`, para no dejar una selección huérfana de un tipo
      // anterior.
      return {
        ...estado,
        datos: { ...estado.datos, tipo: accion.valor },
        segmentacion: segmentacionLimpia(),
      };
    case 'CAMBIAR_FECHA_APERTURA':
      return { ...estado, datos: { ...estado.datos, fecha_apertura_prevista: accion.valor } };
    case 'CAMBIAR_FECHA_CIERRE':
      return { ...estado, datos: { ...estado.datos, fecha_cierre_prevista: accion.valor } };
    case 'CAMBIAR_PUBLICO_OBJETIVO':
      return { ...estado, segmentacion: { ...estado.segmentacion, publico_objetivo: accion.valor } };
    case 'CAMBIAR_ALCANCE':
      // Cambiar alcance limpia la selección previa (spec): nivel/grados/aulas
      // son mutuamente excluyentes según el alcance elegido.
      return {
        ...estado,
        segmentacion: {
          ...estado.segmentacion,
          alcance: accion.valor,
          nivel_id: undefined,
          grado_ids: [],
          aula_ids: [],
        },
      };
    case 'CAMBIAR_NIVEL':
      return { ...estado, segmentacion: { ...estado.segmentacion, nivel_id: accion.valor } };
    case 'CAMBIAR_GRADOS':
      return { ...estado, segmentacion: { ...estado.segmentacion, grado_ids: accion.valor } };
    case 'CAMBIAR_AULAS':
      return { ...estado, segmentacion: { ...estado.segmentacion, aula_ids: accion.valor } };
    case 'CAMBIAR_OCULTAR_RESULTADOS':
      return { ...estado, ocultar_resultados: accion.valor };
    case 'INICIALIZAR': {
      const { proceso } = accion;
      return {
        paso: 1,
        datos: {
          nombre: proceso.nombre,
          descripcion: proceso.descripcion ?? '',
          tipo: proceso.tipo,
          fecha_apertura_prevista: proceso.fecha_apertura_prevista,
          fecha_cierre_prevista: proceso.fecha_cierre_prevista,
        },
        segmentacion: {
          publico_objetivo: proceso.publico_objetivo,
          alcance: proceso.alcance,
          nivel_id: proceso.nivel_id_snapshot,
          grado_ids: proceso.grado_ids_snapshot,
          aula_ids: proceso.aulas,
        },
        // Respeta el valor persistido al reabrir (spec), NO el pre-marcado de
        // proceso nuevo.
        ocultar_resultados: proceso.ocultar_resultados,
      };
    }
    default:
      return estado;
  }
}
