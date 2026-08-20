import { useCallback, useEffect, useState } from 'react';
import {
  actualizarSeccion,
  crearSeccion,
  eliminarSeccion,
  listarAniosEscolares,
  listarGrados,
  listarSecciones,
} from '../academico-api';
import type { AnioEscolarRespuestaDto, GradoRespuestaDto, SeccionRespuestaDto } from '../academico-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelSeccionesProps {
  soloLectura: boolean;
}

/**
 * Contenedor con TODOS los efectos (design.md D2/D3/D4/D5/D7/D8, tasks.md 15.1-15.4; spec:
 * academic-tree-management). Dos filtros opcionales `grado_id`/`anio_escolar_id`, sourced de
 * `listarGrados()`/`listarAniosEscolares()`: sin selección lista todas las Secciones, cualquier
 * cambio de filtro refetchea con los valores actualmente seleccionados. `soloLectura` llega como
 * prop desde `AcademicaPage` (D8).
 */
export function PanelSecciones({ soloLectura }: PanelSeccionesProps) {
  const [grados, setGrados] = useState<GradoRespuestaDto[]>([]);
  const [aniosEscolares, setAniosEscolares] = useState<AnioEscolarRespuestaDto[]>([]);
  const [filtroGradoId, setFiltroGradoId] = useState('');
  const [filtroAnioEscolarId, setFiltroAnioEscolarId] = useState('');
  const [filas, setFilas] = useState<SeccionRespuestaDto[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filaEnEdicion, setFilaEnEdicion] = useState<SeccionRespuestaDto | undefined>(undefined);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [filaAEliminar, setFilaAEliminar] = useState<SeccionRespuestaDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  useEffect(() => {
    listarGrados().then(({ data }) => setGrados(data ?? []));
    listarAniosEscolares().then(({ data }) => setAniosEscolares(data ?? []));
  }, []);

  const recargar = useCallback(async () => {
    const filtros: { grado_id?: string; anio_escolar_id?: string } = {};
    if (filtroGradoId) filtros.grado_id = filtroGradoId;
    if (filtroAnioEscolarId) filtros.anio_escolar_id = filtroAnioEscolarId;
    const { data } = await listarSecciones(Object.keys(filtros).length > 0 ? filtros : undefined);
    setFilas(data ?? []);
  }, [filtroGradoId, filtroAnioEscolarId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const opcionesGrado = grados.map((grado) => ({ valor: grado.id, etiqueta: grado.nombre }));
  const opcionesAnioEscolar = aniosEscolares.map((anio) => ({ valor: anio.id, etiqueta: anio.nombre }));

  const campoNombre: CampoFormulario = { tipo: 'texto', clave: 'nombre', etiqueta: 'Nombre', requerido: true };
  // ActualizarSeccionDto no acepta grado_id/anio_escolar_id (sin re-parentado): en edición sólo se
  // ofrece 'nombre' para no sugerir un cambio de jerarquía que manejarEnviarFormulario ya descarta.
  const camposCrear: CampoFormulario[] = [
    campoNombre,
    { tipo: 'seleccion', clave: 'grado_id', etiqueta: 'Grado', requerido: true, opciones: opcionesGrado },
    {
      tipo: 'seleccion',
      clave: 'anio_escolar_id',
      etiqueta: 'Año escolar',
      requerido: true,
      opciones: opcionesAnioEscolar,
    },
  ];
  const camposEditar: CampoFormulario[] = [campoNombre];
  const campos = filaEnEdicion ? camposEditar : camposCrear;

  const columnas: ColumnaTabla<SeccionRespuestaDto>[] = [
    { clave: 'nombre', encabezado: 'Nombre', celda: (fila) => fila.nombre },
    {
      clave: 'grado',
      encabezado: 'Grado',
      celda: (fila) => grados.find((grado) => grado.id === fila.grado_id)?.nombre ?? fila.grado_id,
    },
    {
      clave: 'anio_escolar',
      encabezado: 'Año escolar',
      celda: (fila) =>
        aniosEscolares.find((anio) => anio.id === fila.anio_escolar_id)?.nombre ?? fila.anio_escolar_id,
    },
  ];

  function abrirCrear() {
    setFilaEnEdicion(undefined);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  function abrirEditar(fila: SeccionRespuestaDto) {
    setFilaEnEdicion(fila);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  async function manejarEnviarFormulario(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);
    const resultado = filaEnEdicion
      ? await actualizarSeccion(filaEnEdicion.id, { nombre: valores.nombre })
      : await crearSeccion({
          nombre: valores.nombre,
          grado_id: valores.grado_id,
          anio_escolar_id: valores.anio_escolar_id,
        });
    setEnviandoFormulario(false);
    if (!resultado.ok) {
      setMensajeErrorFormulario(
        mensajeDeError({ codigo: resultado.codigo, status: resultado.status }),
      );
      return;
    }
    setMostrarFormulario(false);
    setFilaEnEdicion(undefined);
    await recargar();
  }

  async function confirmarEliminar() {
    if (!filaAEliminar) return;
    setProcesandoDialogo(true);
    setMensajeErrorDialogo(undefined);
    const resultado = await eliminarSeccion(filaAEliminar.id);
    setProcesandoDialogo(false);
    if (!resultado.ok) {
      setMensajeErrorDialogo(
        mensajeDeError({
          codigo: resultado.codigo,
          relacion: resultado.relacion,
          status: resultado.status,
        }),
      );
      return;
    }
    setFilaAEliminar(undefined);
    await recargar();
  }

  function cancelarEliminar() {
    setFilaAEliminar(undefined);
    setMensajeErrorDialogo(undefined);
  }

  const acciones: AccionFila<SeccionRespuestaDto>[] = soloLectura
    ? []
    : [
        { id: 'editar', etiqueta: 'Editar', onEjecutar: abrirEditar },
        {
          id: 'eliminar',
          etiqueta: 'Eliminar',
          tono: 'peligro',
          onEjecutar: (fila) => setFilaAEliminar(fila),
        },
      ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-grado" className="text-label-md text-on-surface-variant">
              Grado
            </label>
            <select
              id="filtro-grado"
              value={filtroGradoId}
              onChange={(evento) => setFiltroGradoId(evento.target.value)}
              className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
            >
              <option value="">Todos</option>
              {opcionesGrado.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-anio-escolar" className="text-label-md text-on-surface-variant">
              Año escolar
            </label>
            <select
              id="filtro-anio-escolar"
              value={filtroAnioEscolarId}
              onChange={(evento) => setFiltroAnioEscolarId(evento.target.value)}
              className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
            >
              <option value="">Todos</option>
              {opcionesAnioEscolar.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!soloLectura && (
          <button
            type="button"
            className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
            onClick={abrirCrear}
          >
            Crear
          </button>
        )}
      </div>

      {mostrarFormulario && (
        <div className="mb-4">
          <FormularioGenerico
            key={filaEnEdicion?.id ?? 'crear'}
            campos={campos}
            modo={filaEnEdicion ? 'edicion' : 'creacion'}
            valoresIniciales={
              filaEnEdicion
                ? { nombre: filaEnEdicion.nombre }
                : {
                    ...(filtroGradoId ? { grado_id: filtroGradoId } : {}),
                    ...(filtroAnioEscolarId ? { anio_escolar_id: filtroAnioEscolarId } : {}),
                  }
            }
            onEnviar={manejarEnviarFormulario}
            onCancelar={() => setMostrarFormulario(false)}
            enviando={enviandoFormulario}
            mensajeError={mensajeErrorFormulario}
          />
        </div>
      )}

      <TablaGenerica
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Todavía no hay secciones registradas."
        acciones={acciones}
      />

      {filaAEliminar && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Eliminar sección"
            descripcion="¿Confirmás eliminar esta sección?"
            etiquetaConfirmar="Eliminar"
            onConfirmar={confirmarEliminar}
            onCancelar={cancelarEliminar}
            procesando={procesandoDialogo}
          />
          {mensajeErrorDialogo && (
            <p role="alert" className="mt-2 text-label-md text-error">
              {mensajeErrorDialogo}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
