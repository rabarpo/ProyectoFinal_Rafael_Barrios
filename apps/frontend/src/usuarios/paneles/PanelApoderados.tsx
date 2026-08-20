import { useCallback, useEffect, useState } from 'react';
import {
  actualizarApoderado,
  crearApoderado,
  eliminarApoderado,
  listarApoderados,
} from '../usuarios-api';
import type { ApoderadoRespuestaDto } from '../usuarios-api';
import { mensajeDeError } from '../mensajes-error';
import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../../comun/piezas/DialogoConfirmacion';

interface PanelApoderadosProps {
  usuarioId: string;
  soloLectura: boolean;
}

const CAMPOS: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombres', etiqueta: 'Nombres', requerido: true },
  { tipo: 'texto', clave: 'dni', etiqueta: 'DNI', requerido: true },
  { tipo: 'texto', clave: 'correo', etiqueta: 'Correo', requerido: false },
];

const COLUMNAS: ColumnaTabla<ApoderadoRespuestaDto>[] = [
  { clave: 'nombres', encabezado: 'Nombres', celda: (fila) => fila.nombres },
  { clave: 'dni', encabezado: 'DNI', celda: (fila) => fila.dni },
  { clave: 'correo', encabezado: 'Correo', celda: (fila) => fila.correo ?? '' },
];

/**
 * Contenedor con TODOS los efectos (design.md D10, tasks.md 16.1-17.4; spec:
 * administracion-usuarios-apoderados, "Panel de Apoderado visible solo para rol === 'estudiante'").
 * Montado sólo por `FichaUsuarioPage` cuando `usuario.rol === 'estudiante'` — la condición vive
 * ahí, no acá (Fase 18), porque montar este panel dispara `GET /usuarios/:id/apoderados` que
 * responde `409 USUARIO_NO_ES_ESTUDIANTE` para cualquier otro rol. `correo` vacío en el
 * formulario nunca viaja como `''`: `FormularioGenerico` siempre entrega todas las claves como
 * `string`, así que la normalización a `undefined` es responsabilidad de este contenedor (D10).
 * "Eliminar" es borrado FÍSICO real (a diferencia de `Usuario`, que no expone `DELETE`) — el
 * texto del diálogo lo dice explícitamente.
 */
export function PanelApoderados({ usuarioId, soloLectura }: PanelApoderadosProps) {
  const [filas, setFilas] = useState<ApoderadoRespuestaDto[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [filaEnEdicion, setFilaEnEdicion] = useState<ApoderadoRespuestaDto | undefined>(undefined);
  const [enviandoFormulario, setEnviandoFormulario] = useState(false);
  const [mensajeErrorFormulario, setMensajeErrorFormulario] = useState<string | undefined>(undefined);

  const [filaAEliminar, setFilaAEliminar] = useState<ApoderadoRespuestaDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  const recargar = useCallback(async () => {
    const resultado = await listarApoderados(usuarioId);
    setFilas(resultado.ok ? (resultado.data ?? []) : []);
  }, [usuarioId]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  function abrirCrear() {
    setFilaEnEdicion(undefined);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  function abrirEditar(fila: ApoderadoRespuestaDto) {
    setFilaEnEdicion(fila);
    setMensajeErrorFormulario(undefined);
    setMostrarFormulario(true);
  }

  async function manejarEnviarFormulario(valores: Record<string, string>) {
    setEnviandoFormulario(true);
    setMensajeErrorFormulario(undefined);

    const input = {
      nombres: valores.nombres,
      dni: valores.dni,
      correo: valores.correo.trim() || undefined,
    };

    const resultado = filaEnEdicion
      ? await actualizarApoderado(usuarioId, filaEnEdicion.id, input)
      : await crearApoderado(usuarioId, input);

    setEnviandoFormulario(false);
    if (!resultado.ok) {
      setMensajeErrorFormulario(
        mensajeDeError({ codigo: resultado.codigo, campo: resultado.campo, status: resultado.status }),
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
    const resultado = await eliminarApoderado(usuarioId, filaAEliminar.id);
    setProcesandoDialogo(false);
    if (!resultado.ok) {
      setMensajeErrorDialogo(mensajeDeError({ codigo: resultado.codigo, status: resultado.status }));
      return;
    }
    setFilaAEliminar(undefined);
    await recargar();
  }

  function cancelarEliminar() {
    setFilaAEliminar(undefined);
    setMensajeErrorDialogo(undefined);
  }

  const acciones: AccionFila<ApoderadoRespuestaDto>[] = soloLectura
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
      <h2 className="mb-4 text-title-lg text-on-surface">Apoderados</h2>

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
            valoresIniciales={
              filaEnEdicion
                ? { nombres: filaEnEdicion.nombres, dni: filaEnEdicion.dni, correo: filaEnEdicion.correo ?? '' }
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
        columnas={COLUMNAS}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Todavía no hay apoderados registrados."
        acciones={acciones}
      />

      {filaAEliminar && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Eliminar apoderado"
            descripcion="Esta acción es un borrado físico y permanente: no se puede deshacer. ¿Confirmás eliminar este apoderado?"
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
