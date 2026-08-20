import { useCallback, useEffect, useState } from 'react';
import { actualizarNivel, crearNivel, eliminarNivel, listarNiveles } from '../academico-api';
import type { NivelRespuestaDto } from '../academico-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelNivelesProps {
  soloLectura: boolean;
}

const CAMPOS: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombre', etiqueta: 'Nombre', requerido: true },
];

const COLUMNAS: ColumnaTabla<NivelRespuestaDto>[] = [
  { clave: 'nombre', encabezado: 'Nombre', celda: (fila) => fila.nombre },
];

/**
 * Contenedor con TODOS los efectos (design.md D2/D3/D4/D5/D7/D8, tasks.md 12.1-12.4; spec:
 * academic-tree-management). Sin filtros ni acción "Activar" — mismo cableado que
 * `PanelAniosEscolares` (CRUD simple). `soloLectura` llega como prop desde `AcademicaPage` (D8).
 */
export function PanelNiveles({ soloLectura }: PanelNivelesProps) {
  const [filas, setFilas] = useState<NivelRespuestaDto[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filaEnEdicion, setFilaEnEdicion] = useState<NivelRespuestaDto | undefined>(undefined);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [filaAEliminar, setFilaAEliminar] = useState<NivelRespuestaDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  const recargar = useCallback(async () => {
    const { data } = await listarNiveles();
    setFilas(data ?? []);
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function abrirCrear() {
    setFilaEnEdicion(undefined);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  function abrirEditar(fila: NivelRespuestaDto) {
    setFilaEnEdicion(fila);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  async function manejarEnviarFormulario(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);
    const resultado = filaEnEdicion
      ? await actualizarNivel(filaEnEdicion.id, { nombre: valores.nombre })
      : await crearNivel({ nombre: valores.nombre });
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
    const resultado = await eliminarNivel(filaAEliminar.id);
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

  const acciones: AccionFila<NivelRespuestaDto>[] = soloLectura
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
      {!soloLectura && (
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
            onClick={abrirCrear}
          >
            Crear
          </button>
        </div>
      )}

      {mostrarFormulario && (
        <div className="mb-4">
          <FormularioGenerico
            key={filaEnEdicion?.id ?? 'crear'}
            campos={CAMPOS}
            modo={filaEnEdicion ? 'edicion' : 'creacion'}
            valoresIniciales={filaEnEdicion ? { nombre: filaEnEdicion.nombre } : undefined}
            onEnviar={manejarEnviarFormulario}
            onCancelar={() => setMostrarFormulario(false)}
            enviando={enviandoFormulario}
            mensajeError={mensajeErrorFormulario}
          />
        </div>
      )}

      <TablaGenerica
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Todavía no hay niveles registrados."
        acciones={acciones}
      />

      {filaAEliminar && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Eliminar nivel"
            descripcion="¿Confirmás eliminar este nivel?"
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
