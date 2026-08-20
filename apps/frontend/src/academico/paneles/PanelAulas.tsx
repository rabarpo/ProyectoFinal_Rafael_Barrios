import { useCallback, useEffect, useState } from 'react';
import {
  actualizarAula,
  crearAula,
  eliminarAula,
  listarAniosEscolares,
  listarAulas,
  listarGrados,
  listarSecciones,
} from '../academico-api';
import type {
  AnioEscolarRespuestaDto,
  AulaRespuestaDto,
  GradoRespuestaDto,
  SeccionRespuestaDto,
} from '../academico-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelAulasProps {
  soloLectura: boolean;
}

const OPCIONES_TURNO = [
  { valor: 'manana', etiqueta: 'Mañana' },
  { valor: 'tarde', etiqueta: 'Tarde' },
];

/**
 * Contenedor con TODOS los efectos (design.md D2/D3/D4/D5/D7/D8, tasks.md 17.1-17.4; spec:
 * academic-tree-management, "Listado de Aula filtrado por Grado, Sección, AñoEscolar y turno").
 * Cuatro filtros opcionales `grado_id`/`seccion_id`/`anio_escolar_id`/`turno`: los tres primeros
 * sourced de `listarGrados()`/`listarSecciones()`/`listarAniosEscolares()`, `turno` es un
 * `<select>` con las 2 opciones literales fijas `manana`/`tarde` — sin selección lista todas las
 * Aulas, cualquier cambio de filtro refetchea con los valores actualmente seleccionados. No hay
 * validación cliente adicional para `turno` más allá de las opciones fijas del select. `soloLectura`
 * llega como prop desde `AcademicaPage` (D8).
 */
export function PanelAulas({ soloLectura }: PanelAulasProps) {
  const [grados, setGrados] = useState<GradoRespuestaDto[]>([]);
  const [secciones, setSecciones] = useState<SeccionRespuestaDto[]>([]);
  const [aniosEscolares, setAniosEscolares] = useState<AnioEscolarRespuestaDto[]>([]);
  const [filtroGradoId, setFiltroGradoId] = useState('');
  const [filtroSeccionId, setFiltroSeccionId] = useState('');
  const [filtroAnioEscolarId, setFiltroAnioEscolarId] = useState('');
  const [filtroTurno, setFiltroTurno] = useState('');
  const [filas, setFilas] = useState<AulaRespuestaDto[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filaEnEdicion, setFilaEnEdicion] = useState<AulaRespuestaDto | undefined>(undefined);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [filaAEliminar, setFilaAEliminar] = useState<AulaRespuestaDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  useEffect(() => {
    listarGrados().then(({ data }) => setGrados(data ?? []));
    listarSecciones().then(({ data }) => setSecciones(data ?? []));
    listarAniosEscolares().then(({ data }) => setAniosEscolares(data ?? []));
  }, []);

  const recargar = useCallback(async () => {
    const filtros: {
      grado_id?: string;
      seccion_id?: string;
      anio_escolar_id?: string;
      turno?: string;
    } = {};
    if (filtroGradoId) filtros.grado_id = filtroGradoId;
    if (filtroSeccionId) filtros.seccion_id = filtroSeccionId;
    if (filtroAnioEscolarId) filtros.anio_escolar_id = filtroAnioEscolarId;
    if (filtroTurno) filtros.turno = filtroTurno;
    const { data } = await listarAulas(Object.keys(filtros).length > 0 ? filtros : undefined);
    setFilas(data ?? []);
  }, [filtroGradoId, filtroSeccionId, filtroAnioEscolarId, filtroTurno]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const opcionesGrado = grados.map((grado) => ({ valor: grado.id, etiqueta: grado.nombre }));
  const opcionesSeccion = secciones.map((seccion) => ({ valor: seccion.id, etiqueta: seccion.nombre }));
  const opcionesAnioEscolar = aniosEscolares.map((anio) => ({ valor: anio.id, etiqueta: anio.nombre }));

  const campoTurno: CampoFormulario = {
    tipo: 'seleccion',
    clave: 'turno',
    etiqueta: 'Turno',
    requerido: true,
    opciones: OPCIONES_TURNO,
  };
  // ActualizarAulaDto no acepta grado_id/seccion_id/anio_escolar_id (sin re-parentado, D del
  // backend): en modo edición el formulario sólo ofrece 'turno' para no sugerir un cambio de
  // jerarquía que el backend descartaría en silencio.
  const camposCrear: CampoFormulario[] = [
    campoTurno,
    { tipo: 'seleccion', clave: 'grado_id', etiqueta: 'Grado', requerido: true, opciones: opcionesGrado },
    {
      tipo: 'seleccion',
      clave: 'seccion_id',
      etiqueta: 'Sección',
      requerido: true,
      opciones: opcionesSeccion,
    },
    {
      tipo: 'seleccion',
      clave: 'anio_escolar_id',
      etiqueta: 'Año escolar',
      requerido: true,
      opciones: opcionesAnioEscolar,
    },
  ];
  const camposEditar: CampoFormulario[] = [campoTurno];
  const campos = filaEnEdicion ? camposEditar : camposCrear;

  const columnas: ColumnaTabla<AulaRespuestaDto>[] = [
    { clave: 'turno', encabezado: 'Turno', celda: (fila) => fila.turno },
    {
      clave: 'grado',
      encabezado: 'Grado',
      celda: (fila) => grados.find((grado) => grado.id === fila.grado_id)?.nombre ?? fila.grado_id,
    },
    {
      clave: 'seccion',
      encabezado: 'Sección',
      celda: (fila) =>
        secciones.find((seccion) => seccion.id === fila.seccion_id)?.nombre ?? fila.seccion_id,
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

  function abrirEditar(fila: AulaRespuestaDto) {
    setFilaEnEdicion(fila);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  async function manejarEnviarFormulario(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);
    const resultado = filaEnEdicion
      ? await actualizarAula(filaEnEdicion.id, { turno: valores.turno })
      : await crearAula({
          turno: valores.turno,
          grado_id: valores.grado_id,
          seccion_id: valores.seccion_id,
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
    const resultado = await eliminarAula(filaAEliminar.id);
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

  const acciones: AccionFila<AulaRespuestaDto>[] = soloLectura
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
            <label htmlFor="filtro-seccion" className="text-label-md text-on-surface-variant">
              Sección
            </label>
            <select
              id="filtro-seccion"
              value={filtroSeccionId}
              onChange={(evento) => setFiltroSeccionId(evento.target.value)}
              className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
            >
              <option value="">Todas</option>
              {opcionesSeccion.map((opcion) => (
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

          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-turno" className="text-label-md text-on-surface-variant">
              Turno
            </label>
            <select
              id="filtro-turno"
              value={filtroTurno}
              onChange={(evento) => setFiltroTurno(evento.target.value)}
              className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
            >
              <option value="">Todos</option>
              {OPCIONES_TURNO.map((opcion) => (
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
                ? { turno: filaEnEdicion.turno }
                : {
                    ...(filtroTurno ? { turno: filtroTurno } : {}),
                    ...(filtroGradoId ? { grado_id: filtroGradoId } : {}),
                    ...(filtroSeccionId ? { seccion_id: filtroSeccionId } : {}),
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
        mensajeVacio="Todavía no hay aulas registradas."
        acciones={acciones}
      />

      {filaAEliminar && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Eliminar aula"
            descripcion="¿Confirmás eliminar esta aula?"
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
