import { useCallback, useEffect, useState } from 'react';
import {
  activarAnioEscolar,
  actualizarAnioEscolar,
  crearAnioEscolar,
  eliminarAnioEscolar,
  listarAniosEscolares,
} from '../academico-api';
import type { AnioEscolarRespuestaDto } from '../academico-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelAniosEscolaresProps {
  soloLectura: boolean;
}

type Dialogo =
  | { tipo: 'eliminar'; fila: AnioEscolarRespuestaDto }
  | { tipo: 'activar'; fila: AnioEscolarRespuestaDto }
  | undefined;

const CAMPOS: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombre', etiqueta: 'Nombre', requerido: true },
];

const COLUMNAS: ColumnaTabla<AnioEscolarRespuestaDto>[] = [
  { clave: 'nombre', encabezado: 'Nombre', celda: (fila) => fila.nombre },
  { clave: 'activo', encabezado: 'Estado', celda: (fila) => (fila.activo ? 'Activo' : 'Inactivo') },
];

/**
 * Contenedor con TODOS los efectos (design.md D2/D3/D4/D5/D7/D8/D9, tasks.md 11.1-11.7; spec:
 * school-year-management). `soloLectura` llega como prop desde `AcademicaPage` (D8) — este panel
 * nunca lee `useSesion()`. El diálogo de "Activar" (D9) NO menciona el año actualmente activo:
 * confirmación simple, ya decidida.
 */
export function PanelAniosEscolares({ soloLectura }: PanelAniosEscolaresProps) {
  const [filas, setFilas] = useState<AnioEscolarRespuestaDto[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filaEnEdicion, setFilaEnEdicion] = useState<AnioEscolarRespuestaDto | undefined>(undefined);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [dialogo, setDialogo] = useState<Dialogo>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  const recargar = useCallback(async () => {
    const { data } = await listarAniosEscolares();
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

  function abrirEditar(fila: AnioEscolarRespuestaDto) {
    setFilaEnEdicion(fila);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  async function manejarEnviarFormulario(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);
    const resultado = filaEnEdicion
      ? await actualizarAnioEscolar(filaEnEdicion.id, { nombre: valores.nombre })
      : await crearAnioEscolar({ nombre: valores.nombre });
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

  async function confirmarDialogo() {
    if (!dialogo) return;
    setProcesandoDialogo(true);
    setMensajeErrorDialogo(undefined);

    const resultado =
      dialogo.tipo === 'eliminar'
        ? await eliminarAnioEscolar(dialogo.fila.id)
        : await activarAnioEscolar(dialogo.fila.id);

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
    setDialogo(undefined);
    await recargar();
  }

  function cancelarDialogo() {
    setDialogo(undefined);
    setMensajeErrorDialogo(undefined);
  }

  const acciones: AccionFila<AnioEscolarRespuestaDto>[] = soloLectura
    ? []
    : [
        { id: 'editar', etiqueta: 'Editar', onEjecutar: abrirEditar },
        {
          id: 'activar',
          etiqueta: 'Activar',
          onEjecutar: (fila) => setDialogo({ tipo: 'activar', fila }),
          visible: (fila) => !fila.activo,
        },
        {
          id: 'eliminar',
          etiqueta: 'Eliminar',
          tono: 'peligro',
          onEjecutar: (fila) => setDialogo({ tipo: 'eliminar', fila }),
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
        mensajeVacio="Todavía no hay años escolares registrados."
        acciones={acciones}
      />

      {dialogo && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo={dialogo.tipo === 'activar' ? 'Activar año escolar' : 'Eliminar año escolar'}
            descripcion={
              dialogo.tipo === 'activar'
                ? '¿Confirmás activar este año escolar?'
                : '¿Confirmás eliminar este año escolar?'
            }
            etiquetaConfirmar={dialogo.tipo === 'activar' ? 'Activar' : 'Eliminar'}
            onConfirmar={confirmarDialogo}
            onCancelar={cancelarDialogo}
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
