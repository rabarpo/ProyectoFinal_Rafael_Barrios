import { useState } from 'react';
import { actualizarUsuario, cambiarEstadoUsuario, crearUsuario } from './usuarios-api';
import type { CrearUsuarioInput, UsuarioRespuestaDto } from './usuarios-api';
import { mensajeDeError } from './mensajes-error';
import { FormularioGenerico } from '../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../comun/piezas/FormularioGenerico';
import { DialogoConfirmacion } from '../comun/piezas/DialogoConfirmacion';
import { PanelApoderados } from './paneles/PanelApoderados';

interface FichaUsuarioPageProps {
  usuario: UsuarioRespuestaDto | null;
  soloLectura: boolean;
  onVolver: () => void;
  onCambio: () => void;
}

const OPCIONES_ROL = [
  { valor: '', etiqueta: 'Seleccioná un rol' },
  { valor: 'estudiante', etiqueta: 'Estudiante' },
  { valor: 'docente', etiqueta: 'Docente' },
  { valor: 'comite', etiqueta: 'Comité' },
  { valor: 'administrador', etiqueta: 'Administrador' },
  { valor: 'director', etiqueta: 'Director' },
];

/**
 * design.md D8: un único conjunto de campos para los cinco roles, sin ramas condicionales. La
 * opción vacía inicial es obligatoria — `FormularioGenerico` inicializa todo valor en `''` y su
 * `<select>` no emite placeholder propio: sin ella el usuario vería un rol real preseleccionado
 * con el valor `''` y el submit quedaría deshabilitado sin explicación visible.
 */
const CAMPOS_CREAR: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombres', etiqueta: 'Nombres', requerido: true },
  { tipo: 'texto', clave: 'dni', etiqueta: 'DNI', requerido: true },
  { tipo: 'texto', clave: 'codigo', etiqueta: 'Código', requerido: true },
  { tipo: 'texto', clave: 'correo', etiqueta: 'Correo', requerido: true },
  { tipo: 'seleccion', clave: 'rol', etiqueta: 'Rol', requerido: true, opciones: OPCIONES_ROL },
];

// D8: en edición el campo `rol` se omite del todo (no se deshabilita) — `ActualizarUsuarioDto`
// lo acepta en el backend, pero degradar el rol de un estudiante con `Apoderado` vinculados no
// cascadea ni bloquea nada ahí, dejaría filas de `Apoderado` vivas e inalcanzables.
const CAMPOS_EDITAR: CampoFormulario[] = CAMPOS_CREAR.slice(0, 4);

/**
 * Contenedor de la ficha de `Usuario` (design.md D3/D8/D9, tasks.md Phase 13-15). Recibe
 * `{ usuario, soloLectura, onVolver, onCambio }`: `usuario === null` ⇒ modo creación (5 campos,
 * incluye `rol`), `usuario` presente ⇒ modo edición (4 campos, sin `rol`). El cambio de estado
 * (D9) ofrece "Activar"/"Desactivar" salvo con `estado === 'bloqueado'` (el único destino posible
 * desde ahí es `409 TRANSICION_DESDE_BLOQUEADO`, así que no se ofrece el botón) — sin acción
 * "Eliminar" en ningún lado, el backend no expone `DELETE` para `Usuario`. `acciones` derivadas
 * de `soloLectura` recibido por prop, nunca de `useSesion()` (mismo criterio D4/D8 de `#26`).
 * `PanelApoderados` (D10, tasks.md Phase 18) se monta sólo cuando `usuario` existe y
 * `usuario.rol === 'estudiante'` — la condición vive acá, no dentro del panel, porque montarlo
 * incondicionalmente dispararía `GET /usuarios/:id/apoderados` ⇒ `409 USUARIO_NO_ES_ESTUDIANTE`
 * para los otros cuatro roles.
 */
export function FichaUsuarioPage({ usuario, soloLectura, onVolver, onCambio }: FichaUsuarioPageProps) {
  const [enviando, setEnviando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);

  const [dialogoEstado, setDialogoEstado] = useState<'activo' | 'inactivo' | undefined>(undefined);
  const [procesandoEstado, setProcesandoEstado] = useState(false);
  const [mensajeErrorEstado, setMensajeErrorEstado] = useState<string | undefined>(undefined);

  const modo: 'creacion' | 'edicion' = usuario ? 'edicion' : 'creacion';

  async function manejarEnviar(valores: Record<string, string>) {
    setEnviando(true);
    setMensajeError(undefined);

    const resultado = usuario
      ? await actualizarUsuario(usuario.id, {
          nombres: valores.nombres,
          dni: valores.dni,
          codigo: valores.codigo,
          correo: valores.correo,
        })
      : await crearUsuario({
          nombres: valores.nombres,
          dni: valores.dni,
          codigo: valores.codigo,
          correo: valores.correo,
          rol: valores.rol as CrearUsuarioInput['rol'],
        });

    setEnviando(false);
    if (!resultado.ok) {
      setMensajeError(
        mensajeDeError({ codigo: resultado.codigo, campo: resultado.campo, status: resultado.status }),
      );
      return;
    }
    onCambio();
  }

  async function confirmarEstado() {
    if (!usuario || !dialogoEstado) return;
    setProcesandoEstado(true);
    setMensajeErrorEstado(undefined);

    const resultado = await cambiarEstadoUsuario(usuario.id, dialogoEstado);

    setProcesandoEstado(false);
    if (!resultado.ok) {
      setMensajeErrorEstado(mensajeDeError({ codigo: resultado.codigo, status: resultado.status }));
      return;
    }
    setDialogoEstado(undefined);
    onCambio();
  }

  function cancelarEstado() {
    setDialogoEstado(undefined);
    setMensajeErrorEstado(undefined);
  }

  const puedeCambiarEstado = !soloLectura && usuario && usuario.estado !== 'bloqueado';

  return (
    <div data-testid="ficha-usuario-page" className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="mb-6 text-headline-lg-mobile text-primary md:text-headline-lg">
        {usuario ? usuario.nombres : 'Nuevo usuario'}
      </h1>

      <FormularioGenerico
        campos={modo === 'creacion' ? CAMPOS_CREAR : CAMPOS_EDITAR}
        modo={modo}
        valoresIniciales={
          usuario
            ? { nombres: usuario.nombres, dni: usuario.dni, codigo: usuario.codigo, correo: usuario.correo }
            : undefined
        }
        onEnviar={manejarEnviar}
        enviando={enviando}
        mensajeError={mensajeError}
      />

      {usuario && (
        <div className="mt-6 flex items-center gap-4">
          <p className="text-body-md text-on-surface">Estado: {usuario.estado}</p>
          {puedeCambiarEstado && (
            <button
              type="button"
              onClick={() => setDialogoEstado(usuario.estado === 'activo' ? 'inactivo' : 'activo')}
              className="rounded-control px-4 py-2 text-label-md text-primary hover:bg-surface-container"
            >
              {usuario.estado === 'activo' ? 'Desactivar' : 'Activar'}
            </button>
          )}
        </div>
      )}

      {dialogoEstado && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo={dialogoEstado === 'activo' ? 'Activar usuario' : 'Desactivar usuario'}
            descripcion={
              dialogoEstado === 'activo'
                ? '¿Confirmás activar a este usuario?'
                : '¿Confirmás desactivar a este usuario?'
            }
            etiquetaConfirmar={dialogoEstado === 'activo' ? 'Activar' : 'Desactivar'}
            onConfirmar={confirmarEstado}
            onCancelar={cancelarEstado}
            procesando={procesandoEstado}
          />
          {mensajeErrorEstado && (
            <p role="alert" className="mt-2 text-label-md text-error">
              {mensajeErrorEstado}
            </p>
          )}
        </div>
      )}

      {usuario && usuario.rol === 'estudiante' && (
        <div className="mt-8">
          <PanelApoderados usuarioId={usuario.id} soloLectura={soloLectura} />
        </div>
      )}

      <button
        type="button"
        onClick={onVolver}
        className="mt-6 rounded-control px-4 py-2 text-label-md text-primary hover:bg-surface-container"
      >
        Volver
      </button>
    </div>
  );
}
