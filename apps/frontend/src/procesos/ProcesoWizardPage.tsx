import { useReducer, useState } from 'react';
import { estadoInicial, wizardReducer } from './wizard-reducer';
import { usePadronEnVivo } from './usePadronEnVivo';
import { crear } from './procesos-api';
import type { CrearProcesoDto } from './procesos-api';
import { navegar } from '../app/useRuta';
import { PasoDatos } from './pasos/PasoDatos';
import { PasoPublico } from './pasos/PasoPublico';
import { PasoPadron } from './pasos/PasoPadron';
import { PasoRevision } from './pasos/PasoRevision';
import { PasoIndicador } from './PasoIndicador';

/**
 * Contenedor del asistente (design.md D7): único componente con efectos
 * propios de este feature (el `useReducer`, el submit final y —vía el hook—
 * el conteo en vivo de `usePadronEnVivo`). Navegación local `paso: 1..4`,
 * sin router (design.md D7, "Navegación").
 *
 * Los cuatro pasos son `1 Datos → 2 Público y segmentación → 3 Padrón en
 * vivo → 4 Revisión` (design.md D7, desvío de `Design.md 1f` documentado
 * ahí: "cargos y candidatos" es #12 y no existe todavía).
 */
export function ProcesoWizardPage() {
  const [estado, dispatch] = useReducer(wizardReducer, undefined, estadoInicial);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | undefined>(undefined);
  const [creadoId, setCreadoId] = useState<string | undefined>(undefined);

  const estadoPadron = usePadronEnVivo(estado.segmentacion);

  const paso1Completo = estado.datos.nombre.trim() !== '' && estado.datos.tipo !== undefined;
  const paso2Completo =
    estado.segmentacion.publico_objetivo !== undefined && estado.segmentacion.alcance !== undefined;

  const pasoActualCompleto =
    estado.paso === 1 ? paso1Completo : estado.paso === 2 ? paso2Completo : true;

  async function confirmar() {
    setEnviando(true);
    setErrorEnvio(undefined);

    const dto: CrearProcesoDto = {
      nombre: estado.datos.nombre,
      descripcion: estado.datos.descripcion || undefined,
      tipo: estado.datos.tipo!,
      fecha_apertura_prevista: estado.datos.fecha_apertura_prevista,
      fecha_cierre_prevista: estado.datos.fecha_cierre_prevista,
      publico_objetivo: estado.segmentacion.publico_objetivo!,
      alcance: estado.segmentacion.alcance!,
      nivel_id: estado.segmentacion.nivel_id,
      grado_ids: estado.segmentacion.grado_ids,
      aula_ids: estado.segmentacion.aula_ids,
      ocultar_resultados: estado.ocultar_resultados,
    };

    try {
      const { data, response } = await crear(dto);
      if (response.ok && data) {
        setCreadoId(data.id);
      } else {
        setErrorEnvio('No se pudo crear el proceso');
      }
    } catch {
      setErrorEnvio('No se pudo contactar con el servidor');
    } finally {
      setEnviando(false);
    }
  }

  if (creadoId) {
    return (
      <div className="mx-auto w-full max-w-page px-5 md:px-12">
        <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
          <p className="text-body-md text-on-surface">Proceso creado como borrador.</p>
          {/* [design.md D12] Punto de entrada al módulo de candidatos desde el
              asistente: sin este enlace solo el índice (`ProcesosIndexPage`)
              permitiría llegar a este proceso. */}
          <button
            type="button"
            className="mt-4 rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
            onClick={() => navegar({ nombre: 'candidatos', procesoId: creadoId })}
          >
            Gestionar candidatos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <div className="mb-6">
        <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
          Nuevo proceso electoral
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Completá los cuatro pasos para crear el proceso como borrador.
        </p>
      </div>

      <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation md:p-8">
        <div className="mb-8">
          {/* [design.md D5] Texto plano, no heading — el stepper es solo visual. */}
          <p className="sr-only">Paso {estado.paso} de 4</p>
          <PasoIndicador pasoActual={estado.paso} />
        </div>

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
            onCambiarPublicoObjetivo={(valor) =>
              dispatch({ tipo: 'CAMBIAR_PUBLICO_OBJETIVO', valor })
            }
            onCambiarAlcance={(valor) => dispatch({ tipo: 'CAMBIAR_ALCANCE', valor })}
            onCambiarNivel={(valor) => dispatch({ tipo: 'CAMBIAR_NIVEL', valor })}
            onCambiarGrados={(valor) => dispatch({ tipo: 'CAMBIAR_GRADOS', valor })}
            onCambiarAulas={(valor) => dispatch({ tipo: 'CAMBIAR_AULAS', valor })}
          />
        )}

        {estado.paso === 3 && <PasoPadron estadoPadron={estadoPadron} />}

        {estado.paso === 4 && (
          <PasoRevision
            datos={estado.datos}
            segmentacion={estado.segmentacion}
            estadoPadron={estadoPadron}
            ocultarResultados={estado.ocultar_resultados}
            onCambiarOcultarResultados={(valor) =>
              dispatch({ tipo: 'CAMBIAR_OCULTAR_RESULTADOS', valor })
            }
            onConfirmar={confirmar}
            enviando={enviando}
            errorEnvio={errorEnvio}
          />
        )}

        <nav className="mt-8 flex justify-between border-t border-border-gray pt-6">
          {estado.paso > 1 && (
            <button
              type="button"
              className="rounded-control px-4 py-3 text-label-md text-primary hover:bg-surface-container"
              onClick={() => dispatch({ tipo: 'ANTERIOR' })}
            >
              Anterior
            </button>
          )}
          {estado.paso < 4 && (
            <button
              type="button"
              className="ml-auto rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
              disabled={!pasoActualCompleto}
              onClick={() => dispatch({ tipo: 'SIGUIENTE' })}
            >
              Siguiente
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
