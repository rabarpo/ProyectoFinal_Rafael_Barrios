import { useCallback, useEffect, useState } from 'react';
import { crearMatricula, eliminarMatricula, listarAniosEscolares, listarAulas, listarMatriculas } from '../academico-api';
import type { AnioEscolarRespuestaDto, AulaRespuestaDto, MatriculaRespuestaDto } from '../academico-api';
import { listarUsuarios } from '../../usuarios/usuarios-api';
import type { UsuarioRespuestaDto } from '../../usuarios/usuarios-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelMatriculasProps {
  soloLectura: boolean;
}

type PasoTraslado =
  | { paso: 'confirmar'; fila: MatriculaRespuestaDto }
  | { paso: 'formulario'; fila: MatriculaRespuestaDto }
  | undefined;

/**
 * Contenedor con TODOS los efectos (design.md D9/D10/D11, tasks.md 18.1-18.10; spec:
 * student-enrollment). El panel más grande del change:
 * - D9: sin `aula_id` elegido en el filtro, estado vacío instructivo y CERO llamadas a
 *   `listarMatriculas` (`MatriculasService.listar()` hace `findMany` sin `take` — listar sin
 *   filtro descargaría potencialmente miles de filas).
 * - D11: `listarUsuarios()` (sin filtro) resuelve `usuario_id → nombres` para las filas y
 *   alimenta el selector de estudiante del alta (filtrado a `rol === 'estudiante'` en cliente,
 *   ya que el catálogo de usuarios es chico, a diferencia de matrículas).
 * - Nunca ofrece "Editar" (no existe `PATCH /matriculas/:id`): sólo "Eliminar" y "Trasladar".
 * - D10: el alta requiere el `aula_id`/`anio_escolar_id` YA elegidos en el filtro (ambos, porque
 *   `CrearMatriculaInput.anio_escolar_id` es obligatorio) — el botón "Crear" sólo aparece cuando
 *   ambos filtros están seleccionados.
 * - D10: "Trasladar" es una secuencia de dos llamadas encapsulada en `trasladarMatricula`:
 *   `crearMatricula` SIEMPRE antes que `eliminarMatricula` (el orden importa por
 *   `@@unique([usuario_id, aula_id, anio_escolar_id])`). Si el alta falla no se borra nada; si el
 *   alta tiene éxito pero el borrado falla, se muestra una alerta persistente nombrando ambos ids
 *   de matrícula.
 */
export function PanelMatriculas({ soloLectura }: PanelMatriculasProps) {
  const [aulas, setAulas] = useState<AulaRespuestaDto[]>([]);
  const [aniosEscolares, setAniosEscolares] = useState<AnioEscolarRespuestaDto[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRespuestaDto[]>([]);
  const [filtroAulaId, setFiltroAulaId] = useState('');
  const [filtroAnioEscolarId, setFiltroAnioEscolarId] = useState('');
  const [filas, setFilas] = useState<MatriculaRespuestaDto[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [filaAEliminar, setFilaAEliminar] = useState<MatriculaRespuestaDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  const [traslado, setTraslado] = useState<PasoTraslado>(undefined);
  const [procesandoTraslado, setProcesandoTraslado] = useState(false);
  const [mensajeErrorTraslado, setMensajeErrorTraslado] = useState<string | undefined>(undefined);

  // Alerta persistente de D10: nunca se limpia por otra acción del panel, sólo al cerrarla a mano.
  const [alertaInconsistencia, setAlertaInconsistencia] = useState<string | undefined>(undefined);

  useEffect(() => {
    listarAulas().then(({ data }) => setAulas(data ?? []));
    listarAniosEscolares().then(({ data }) => setAniosEscolares(data ?? []));
    listarUsuarios().then(({ data }) => setUsuarios(data ?? []));
  }, []);

  const recargar = useCallback(async () => {
    if (!filtroAulaId) {
      setFilas([]);
      return;
    }
    const filtros: { aula_id: string; anio_escolar_id?: string } = { aula_id: filtroAulaId };
    if (filtroAnioEscolarId) filtros.anio_escolar_id = filtroAnioEscolarId;
    const { data } = await listarMatriculas(filtros);
    setFilas(data ?? []);
  }, [filtroAulaId, filtroAnioEscolarId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const opcionesAula = aulas.map((a) => ({ valor: a.id, etiqueta: a.turno }));
  const opcionesAnioEscolar = aniosEscolares.map((a) => ({ valor: a.id, etiqueta: a.nombre }));
  const opcionesEstudiante = usuarios
    .filter((u) => u.rol === 'estudiante')
    .map((u) => ({ valor: u.id, etiqueta: u.nombres }));

  function nombreUsuario(usuarioId: string) {
    return usuarios.find((u) => u.id === usuarioId)?.nombres ?? usuarioId;
  }

  function nombreAnioEscolar(anioEscolarId: string) {
    return aniosEscolares.find((a) => a.id === anioEscolarId)?.nombre ?? anioEscolarId;
  }

  const columnas: ColumnaTabla<MatriculaRespuestaDto>[] = [
    { clave: 'estudiante', encabezado: 'Estudiante', celda: (fila) => nombreUsuario(fila.usuario_id) },
    {
      clave: 'anio_escolar',
      encabezado: 'Año escolar',
      celda: (fila) => nombreAnioEscolar(fila.anio_escolar_id),
    },
  ];

  const camposCrear: CampoFormulario[] = [
    { tipo: 'seleccion', clave: 'usuario_id', etiqueta: 'Estudiante', requerido: true, opciones: opcionesEstudiante },
  ];

  const camposTraslado: CampoFormulario[] = [
    { tipo: 'seleccion', clave: 'aula_id', etiqueta: 'Aula', requerido: true, opciones: opcionesAula },
    {
      tipo: 'seleccion',
      clave: 'anio_escolar_id',
      etiqueta: 'Año escolar',
      requerido: true,
      opciones: opcionesAnioEscolar,
    },
  ];

  async function manejarEnviarCrear(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);
    const resultado = await crearMatricula({
      usuario_id: valores.usuario_id,
      aula_id: filtroAulaId,
      anio_escolar_id: filtroAnioEscolarId,
    });
    setEnviandoFormulario(false);
    if (!resultado.ok) {
      setMensajeErrorFormulario(
        mensajeDeError({ codigo: resultado.codigo, relacion: resultado.relacion, status: resultado.status }),
      );
      return;
    }
    setMostrarFormulario(false);
    await recargar();
  }

  async function confirmarEliminar() {
    if (!filaAEliminar) return;
    setProcesandoDialogo(true);
    setMensajeErrorDialogo(undefined);
    const resultado = await eliminarMatricula(filaAEliminar.id);
    setProcesandoDialogo(false);
    if (!resultado.ok) {
      setMensajeErrorDialogo(
        mensajeDeError({ codigo: resultado.codigo, relacion: resultado.relacion, status: resultado.status }),
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

  function confirmarPasoUno() {
    setTraslado((actual) => (actual ? { paso: 'formulario', fila: actual.fila } : undefined));
  }

  function cancelarTraslado() {
    setTraslado(undefined);
    setMensajeErrorTraslado(undefined);
  }

  /**
   * D10: secuencia de dos llamadas encapsulada — nunca inline en JSX, para que 18.6-18.8 sean
   * testeables en aislamiento. `crearMatricula` SIEMPRE se invoca antes que `eliminarMatricula`.
   */
  async function trasladarMatricula(
    filaAnterior: MatriculaRespuestaDto,
    nuevaAulaId: string,
    nuevoAnioEscolarId: string,
  ) {
    setProcesandoTraslado(true);
    setMensajeErrorTraslado(undefined);

    const creado = await crearMatricula({
      usuario_id: filaAnterior.usuario_id,
      aula_id: nuevaAulaId,
      anio_escolar_id: nuevoAnioEscolarId,
    });

    if (!creado.ok) {
      setProcesandoTraslado(false);
      setMensajeErrorTraslado(
        mensajeDeError({ codigo: creado.codigo, relacion: creado.relacion, status: creado.status }),
      );
      return;
    }

    const eliminado = await eliminarMatricula(filaAnterior.id);
    setProcesandoTraslado(false);

    if (!eliminado.ok) {
      const idNueva = creado.data?.id ?? '(desconocido)';
      setAlertaInconsistencia(
        `Se creó la matrícula ${idNueva} pero no se pudo eliminar la matrícula anterior ${filaAnterior.id}. ` +
          `Quedaron dos matrículas: elimine manualmente la matrícula ${filaAnterior.id}.`,
      );
      setTraslado(undefined);
      await recargar();
      return;
    }

    setTraslado(undefined);
    await recargar();
  }

  const acciones: AccionFila<MatriculaRespuestaDto>[] = soloLectura
    ? []
    : [
        {
          id: 'trasladar',
          etiqueta: 'Trasladar',
          onEjecutar: (fila) => setTraslado({ paso: 'confirmar', fila }),
        },
        {
          id: 'eliminar',
          etiqueta: 'Eliminar',
          tono: 'peligro',
          onEjecutar: (fila) => setFilaAEliminar(fila),
        },
      ];

  const puedeCrear = !soloLectura && filtroAulaId !== '' && filtroAnioEscolarId !== '';

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-aula" className="text-label-md text-on-surface-variant">
              Aula
            </label>
            <select
              id="filtro-aula"
              value={filtroAulaId}
              onChange={(evento) => setFiltroAulaId(evento.target.value)}
              className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
            >
              <option value="">Elegir aula…</option>
              {opcionesAula.map((opcion) => (
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

        {puedeCrear && (
          <button
            type="button"
            className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
            onClick={() => {
              setMensajeErrorFormulario(undefined);
              setMostrarFormulario(true);
            }}
          >
            Crear
          </button>
        )}
      </div>

      {alertaInconsistencia && (
        <div className="mb-4 rounded-control border border-error bg-surface-white p-4">
          <p role="alert" className="text-label-md text-error">
            {alertaInconsistencia}
          </p>
          <button
            type="button"
            className="mt-2 text-label-md text-primary"
            onClick={() => setAlertaInconsistencia(undefined)}
          >
            Cerrar aviso
          </button>
        </div>
      )}

      {!filtroAulaId ? (
        <p className="p-6 text-body-md text-on-surface-variant">
          Elegí un Aula en el filtro para ver sus matrículas.
        </p>
      ) : (
        <>
          {mostrarFormulario && (
            <div className="mb-4">
              <FormularioGenerico
                campos={camposCrear}
                modo="creacion"
                onEnviar={manejarEnviarCrear}
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
            mensajeVacio="No hay matrículas registradas para este filtro."
            acciones={acciones}
          />
        </>
      )}

      {filaAEliminar && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Eliminar matrícula"
            descripcion="¿Confirmás eliminar esta matrícula?"
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

      {traslado?.paso === 'confirmar' && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Trasladar matrícula"
            descripcion={
              `${nombreUsuario(traslado.fila.usuario_id)} — el traslado es una acción de dos pasos: ` +
              'primero se crea la matrícula nueva en la Aula/Año escolar destino y luego se elimina ' +
              'la matrícula actual. Si el alta falla no se borra nada; si el borrado posterior falla, ' +
              'se te avisará cuál eliminar manualmente.'
            }
            etiquetaConfirmar="Continuar"
            onConfirmar={confirmarPasoUno}
            onCancelar={cancelarTraslado}
            procesando={false}
          />
        </div>
      )}

      {traslado?.paso === 'formulario' && (
        <div className="mt-4">
          <p className="mb-2 text-body-md text-on-surface">
            Estudiante: <strong>{nombreUsuario(traslado.fila.usuario_id)}</strong>
          </p>
          <FormularioGenerico
            campos={camposTraslado}
            modo="creacion"
            onEnviar={(valores) => trasladarMatricula(traslado.fila, valores.aula_id, valores.anio_escolar_id)}
            onCancelar={cancelarTraslado}
            enviando={procesandoTraslado}
            mensajeError={mensajeErrorTraslado}
          />
        </div>
      )}
    </div>
  );
}
