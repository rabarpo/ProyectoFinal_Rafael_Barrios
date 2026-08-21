import { useCallback, useEffect, useState } from 'react';
import {
  cambiarEstadoCandidato,
  cambiarEstadoLista,
  crearLista,
  crearOpcion,
  eliminarCandidato,
  eliminarLista,
  eliminarOpcion,
  listarCandidatos,
  listarListas,
  listarOpciones,
  subirPlanTrabajo,
} from './candidatos-api';
import type { CandidatoRespuestaDto, ListaRespuestaDto, OpcionRespuestaDto } from './candidatos-api';
import { detalle as obtenerProceso } from '../procesos/procesos-api';
import type { ProcesoDetalleRespuestaDto } from '../procesos/procesos-api';
import { navegar } from '../app/useRuta';
import { TablaCandidatos } from './piezas/TablaCandidatos';
import { PanelOpcionesConsulta } from './piezas/PanelOpcionesConsulta';
import { FormularioLista } from './piezas/FormularioLista';
import type { DatosListaFormulario } from './piezas/FormularioLista';

interface GestionCandidatosPageProps {
  procesoId: string;
}

const MENSAJE_DEPENDIENTES = 'No se puede eliminar: tiene votos u otros registros asociados.';

/**
 * Contenedor con TODOS los efectos (design.md D13, tasks.md 23.3): consume
 * `candidatos-api.listarCandidatos()`/`listarListas()`/`listarOpciones()` y
 * monta `TablaCandidatos` + `PanelOpcionesConsulta` + `FormularioLista`
 * (este último sin consumidor desde PR7, D13 lo asigna a esta pantalla). El
 * borrado guardado (D7) puede responder `409 ENTIDAD_CON_DEPENDIENTES`: se
 * muestra como error legible, nunca se deja propagar como excepción no
 * manejada (instrucción explícita del batch).
 *
 * Secciones condicionadas por `proceso.tipo` (hallazgo de revisión manual):
 * `papeleta.service.ts` vota por Lista sólo en 'municipio', por Candidato
 * directo en 'representante_aula'/'padres' (sin lista asociada), y por
 * OpcionConsulta sólo en 'consulta' — nunca ambos a la vez. Mostrar las tres
 * secciones siempre, sin importar el tipo, sugería una asociación entre
 * Opciones y Candidato que no existe en ningún caso.
 */
export function GestionCandidatosPage({ procesoId }: GestionCandidatosPageProps) {
  const [proceso, setProceso] = useState<ProcesoDetalleRespuestaDto | undefined>(undefined);
  const [candidatos, setCandidatos] = useState<CandidatoRespuestaDto[]>([]);
  const [listas, setListas] = useState<ListaRespuestaDto[]>([]);
  const [opciones, setOpciones] = useState<OpcionRespuestaDto[]>([]);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);
  const [mostrarNuevaLista, setMostrarNuevaLista] = useState(false);
  const [enviandoLista, setEnviandoLista] = useState(false);

  // D13 (hallazgo de revisión manual): la papeleta (`papeleta.service.ts`) sólo usa
  // Candidato/Lista para 'municipio'/'representante_aula'/'padres', y sólo OpcionConsulta para
  // 'consulta' — nunca ambos. Sin este gate, "Opciones de consulta" aparecía siempre, aunque
  // esas opciones jamás se asocian a un candidato ni se votan fuera de un proceso 'consulta'.
  const esConsulta = proceso?.tipo === 'consulta';

  useEffect(() => {
    let activo = true;
    obtenerProceso(procesoId)
      .then(({ data }) => {
        if (activo) setProceso(data);
      })
      .catch(() => {
        // Mismo criterio que el resto del contenedor: un fallo de red acá no debe tirar abajo
        // la pantalla — sin `proceso.tipo` resuelto, las tres secciones quedan ocultas hasta que
        // la consulta se resuelva (o el usuario recargue), en vez de asumir un tipo por defecto.
      });
    return () => {
      activo = false;
    };
  }, [procesoId]);

  const recargarCandidatos = useCallback(async () => {
    const { data } = await listarCandidatos(procesoId);
    setCandidatos(data ?? []);
  }, [procesoId]);

  const recargarListas = useCallback(async () => {
    const { data } = await listarListas(procesoId);
    setListas(data ?? []);
  }, [procesoId]);

  const recargarOpciones = useCallback(async () => {
    const { data } = await listarOpciones(procesoId);
    setOpciones(data ?? []);
  }, [procesoId]);

  useEffect(() => {
    recargarCandidatos();
    recargarListas();
    recargarOpciones();
  }, [recargarCandidatos, recargarListas, recargarOpciones]);

  async function manejarDarBaja(id: string) {
    await cambiarEstadoCandidato(id, 'baja');
    await recargarCandidatos();
  }

  async function manejarReactivar(id: string) {
    await cambiarEstadoCandidato(id, 'activo');
    await recargarCandidatos();
  }

  async function manejarBorrarCandidato(id: string) {
    setMensajeError(undefined);
    const resultado = await eliminarCandidato(id);
    if (!resultado.ok) {
      setMensajeError(
        resultado.codigo === 'ENTIDAD_CON_DEPENDIENTES' ? MENSAJE_DEPENDIENTES : 'No se pudo eliminar el candidato.',
      );
      return;
    }
    await recargarCandidatos();
  }

  async function manejarBorrarLista(id: string) {
    setMensajeError(undefined);
    const resultado = await eliminarLista(id);
    if (!resultado.ok) {
      setMensajeError(
        resultado.codigo === 'ENTIDAD_CON_DEPENDIENTES' ? MENSAJE_DEPENDIENTES : 'No se pudo eliminar la lista.',
      );
      return;
    }
    await recargarListas();
  }

  async function manejarNuevaLista(datos: DatosListaFormulario) {
    setEnviandoLista(true);
    setMensajeError(undefined);
    const resultado = await crearLista({
      proceso_id: procesoId,
      nombre: datos.nombre,
      numero: Number(datos.numero),
      simbolo: datos.simbolo || undefined,
      lema: datos.lema || undefined,
      propuesta: datos.propuesta || undefined,
    });
    if (resultado.ok && resultado.data && datos.planTrabajo) {
      await subirPlanTrabajo(resultado.data.id, datos.planTrabajo);
    }
    setEnviandoLista(false);
    if (!resultado.ok) {
      setMensajeError('No se pudo crear la lista.');
      return;
    }
    setMostrarNuevaLista(false);
    await recargarListas();
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
            Gestión de candidatos
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            {esConsulta
              ? 'Administrá las opciones de consulta de este proceso.'
              : proceso?.tipo === 'municipio'
                ? 'Administrá candidatos y listas de este proceso.'
                : 'Administrá los candidatos de este proceso.'}
          </p>
        </div>
        {!esConsulta && (
          <button
            type="button"
            className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
            onClick={() => navegar({ nombre: 'candidato-nuevo', procesoId })}
          >
            Registrar candidato
          </button>
        )}
      </div>

      {mensajeError && (
        <p role="alert" className="mb-4 text-label-md text-error">
          {mensajeError}
        </p>
      )}

      {!esConsulta && (
        <section className="mb-6 rounded-card border-t-4 border-primary bg-surface-white shadow-elevation">
          <h2 className="border-b border-border-gray p-6 text-title-md text-on-surface">Candidatos</h2>
          <TablaCandidatos
            candidatos={candidatos}
            listas={listas}
            onEditar={(id) => navegar({ nombre: 'candidato-edicion', procesoId, candidatoId: id })}
            onDarBaja={manejarDarBaja}
            onReactivar={manejarReactivar}
            onBorrar={manejarBorrarCandidato}
          />
        </section>
      )}

      {proceso?.tipo === 'municipio' && (
        <section className="mb-6 rounded-card border-t-4 border-secondary bg-surface-white p-6 shadow-elevation">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-title-md text-on-surface">Listas</h2>
            <button
              type="button"
              className="rounded-control px-4 py-2 text-label-md text-primary hover:bg-surface-container"
              onClick={() => setMostrarNuevaLista((valor) => !valor)}
            >
              {mostrarNuevaLista ? 'Cancelar' : 'Nueva lista'}
            </button>
          </div>

          {mostrarNuevaLista && (
            <div className="mb-4">
              <FormularioLista onEnviar={manejarNuevaLista} enviando={enviandoLista} />
            </div>
          )}

          {listas.length === 0 && (
            <p className="text-body-md text-on-surface-variant">Todavía no hay listas registradas.</p>
          )}

          {listas.length > 0 && (
            <ul>
              {listas.map((lista) => (
                <li
                  key={lista.id}
                  className="flex items-center justify-between border-b border-border-gray py-3 last:border-b-0"
                >
                  <span className="text-body-md text-on-surface">
                    {lista.numero} · {lista.nombre} · {lista.estado}
                  </span>
                  <div className="flex gap-2">
                    {lista.estado === 'activo' ? (
                      <button
                        type="button"
                        className="rounded-control px-3 py-2 text-label-md text-on-surface-variant hover:bg-surface-container"
                        onClick={async () => {
                          await cambiarEstadoLista(lista.id, 'baja');
                          await recargarListas();
                        }}
                      >
                        Dar de baja
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rounded-control px-3 py-2 text-label-md text-on-surface-variant hover:bg-surface-container"
                        onClick={async () => {
                          await cambiarEstadoLista(lista.id, 'activo');
                          await recargarListas();
                        }}
                      >
                        Reactivar
                      </button>
                    )}
                    <button
                      type="button"
                      className="rounded-control px-3 py-2 text-label-md text-error hover:bg-surface-container"
                      onClick={() => manejarBorrarLista(lista.id)}
                    >
                      Eliminar
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {esConsulta && (
      <section className="rounded-card border-t-4 border-tertiary-fixed bg-surface-white p-6 shadow-elevation">
        <h2 className="mb-4 text-title-md text-on-surface">Opciones de consulta</h2>
        <PanelOpcionesConsulta
          opciones={opciones}
          enviando={false}
          onCrear={async (datos) => {
            await crearOpcion({
              proceso_id: procesoId,
              etiqueta: datos.etiqueta,
              descripcion: datos.descripcion || undefined,
            });
            await recargarOpciones();
          }}
          onBorrar={async (id) => {
            await eliminarOpcion(id);
            await recargarOpciones();
          }}
        />
      </section>
      )}
    </div>
  );
}
