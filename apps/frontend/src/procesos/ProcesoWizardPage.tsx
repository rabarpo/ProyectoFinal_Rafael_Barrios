import { useReducer } from 'react';
import { estadoInicial, wizardReducer } from './wizard-reducer';
import { PasoDatos } from './pasos/PasoDatos';
import { PasoPublico } from './pasos/PasoPublico';

/**
 * Contenedor del asistente (design.md D7): único componente con efectos
 * propios de este feature (el `useReducer`). Navegación local `paso: 1..4`,
 * sin router (design.md D7, "Navegación").
 *
 * PR8: solo pasos 1-2 (Datos, Público y segmentación), sin submit todavía —
 * los pasos 3-4 (padrón en vivo, revisión) y el envío llegan en PR9.
 */
export function ProcesoWizardPage() {
  const [estado, dispatch] = useReducer(wizardReducer, undefined, estadoInicial);

  const paso1Completo = estado.datos.nombre.trim() !== '' && estado.datos.tipo !== undefined;
  const paso2Completo =
    estado.segmentacion.publico_objetivo !== undefined && estado.segmentacion.alcance !== undefined;

  const pasoActualCompleto = estado.paso === 1 ? paso1Completo : paso2Completo;

  return (
    <div>
      {estado.paso === 1 && (
        <PasoDatos
          datos={estado.datos}
          onCambiarNombre={(valor) => dispatch({ tipo: 'CAMBIAR_NOMBRE', valor })}
          onCambiarDescripcion={(valor) => dispatch({ tipo: 'CAMBIAR_DESCRIPCION', valor })}
          onCambiarTipo={(valor) => dispatch({ tipo: 'CAMBIAR_TIPO_PROCESO', valor })}
          onCambiarFechaApertura={(valor) => dispatch({ tipo: 'CAMBIAR_FECHA_APERTURA', valor })}
          onCambiarFechaCierre={(valor) => dispatch({ tipo: 'CAMBIAR_FECHA_CIERRE', valor })}
        />
      )}

      {estado.paso === 2 && (
        <PasoPublico
          segmentacion={estado.segmentacion}
          tipoProceso={estado.datos.tipo}
          onCambiarPublicoObjetivo={(valor) => dispatch({ tipo: 'CAMBIAR_PUBLICO_OBJETIVO', valor })}
          onCambiarAlcance={(valor) => dispatch({ tipo: 'CAMBIAR_ALCANCE', valor })}
          onCambiarNivel={(valor) => dispatch({ tipo: 'CAMBIAR_NIVEL', valor })}
          onCambiarGrados={(valor) => dispatch({ tipo: 'CAMBIAR_GRADOS', valor })}
          onCambiarAulas={(valor) => dispatch({ tipo: 'CAMBIAR_AULAS', valor })}
        />
      )}

      <nav>
        {estado.paso > 1 && (
          <button type="button" onClick={() => dispatch({ tipo: 'ANTERIOR' })}>
            Anterior
          </button>
        )}
        {estado.paso < 2 && (
          <button
            type="button"
            disabled={!pasoActualCompleto}
            onClick={() => dispatch({ tipo: 'SIGUIENTE' })}
          >
            Siguiente
          </button>
        )}
      </nav>
    </div>
  );
}
