import { useCallback, useEffect, useState } from 'react';
import {
  actualizarGrado,
  crearGrado,
  eliminarGrado,
  listarGrados,
  listarNiveles,
} from '../academico-api';
import type { GradoRespuestaDto, NivelRespuestaDto } from '../academico-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelGradosProps {
  soloLectura: boolean;
}

/**
 * Contenedor con TODOS los efectos (design.md D2/D3/D4/D5/D7/D8, tasks.md 14.1-14.4; spec:
 * academic-tree-management, "Listado de Grado filtrado por Nivel seleccionado"). Filtro opcional
 * `nivel_id` sourced de `listarNiveles()`: sin selección lista todos los Grados, seleccionar un
 * Nivel refetchea con `{ nivel_id }`. `soloLectura` llega como prop desde `AcademicaPage` (D8).
 */
export function PanelGrados({ soloLectura }: PanelGradosProps) {
  const [niveles, setNiveles] = useState<NivelRespuestaDto[]>([]);
  const [filtroNivelId, setFiltroNivelId] = useState('');
  const [filas, setFilas] = useState<GradoRespuestaDto[]>([]);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filaEnEdicion, setFilaEnEdicion] = useState<GradoRespuestaDto | undefined>(undefined);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [filaAEliminar, setFilaAEliminar] = useState<GradoRespuestaDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  useEffect(() => {
    listarNiveles().then(({ data }) => setNiveles(data ?? []));
  }, []);

  const recargar = useCallback(async () => {
    const { data } = await listarGrados(filtroNivelId ? { nivel_id: filtroNivelId } : undefined);
    setFilas(data ?? []);
  }, [filtroNivelId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const opcionesNivel = niveles.map((nivel) => ({ valor: nivel.id, etiqueta: nivel.nombre }));

  const campoNombre: CampoFormulario = { tipo: 'texto', clave: 'nombre', etiqueta: 'Nombre', requerido: true };
  // ActualizarGradoDto no acepta nivel_id (sin re-parentado): en edición sólo se ofrece 'nombre'
  // para no sugerir un cambio de jerarquía que manejarEnviarFormulario ya descarta al no enviarlo.
  const camposCrear: CampoFormulario[] = [
    campoNombre,
    { tipo: 'seleccion', clave: 'nivel_id', etiqueta: 'Nivel', requerido: true, opciones: opcionesNivel },
  ];
  const camposEditar: CampoFormulario[] = [campoNombre];
  const campos = filaEnEdicion ? camposEditar : camposCrear;

  const columnas: ColumnaTabla<GradoRespuestaDto>[] = [
    { clave: 'nombre', encabezado: 'Nombre', celda: (fila) => fila.nombre },
    {
      clave: 'nivel',
      encabezado: 'Nivel',
      celda: (fila) => niveles.find((nivel) => nivel.id === fila.nivel_id)?.nombre ?? fila.nivel_id,
    },
  ];

  function abrirCrear() {
    setFilaEnEdicion(undefined);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  function abrirEditar(fila: GradoRespuestaDto) {
    setFilaEnEdicion(fila);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  async function manejarEnviarFormulario(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);
    const resultado = filaEnEdicion
      ? await actualizarGrado(filaEnEdicion.id, { nombre: valores.nombre })
      : await crearGrado({ nombre: valores.nombre, nivel_id: valores.nivel_id });
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
    const resultado = await eliminarGrado(filaAEliminar.id);
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

  const acciones: AccionFila<GradoRespuestaDto>[] = soloLectura
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
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-nivel" className="text-label-md text-on-surface-variant">
            Nivel
          </label>
          <select
            id="filtro-nivel"
            value={filtroNivelId}
            onChange={(evento) => setFiltroNivelId(evento.target.value)}
            className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
          >
            <option value="">Todos</option>
            {opcionesNivel.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
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
                : filtroNivelId
                  ? { nivel_id: filtroNivelId }
                  : undefined
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
        mensajeVacio="Todavía no hay grados registrados."
        acciones={acciones}
      />

      {filaAEliminar && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Eliminar grado"
            descripcion="¿Confirmás eliminar este grado?"
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
