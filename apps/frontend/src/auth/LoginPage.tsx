import { useState } from 'react';
import { BotonGoogle } from './BotonGoogle';
import { DialogoVinculacion } from './DialogoVinculacion';
import { FormularioCredenciales } from './FormularioCredenciales';
import { useSesion } from './sesion-context';

const MENSAJES: Record<'credenciales' | 'vinculacion' | 'red', string> = {
  credenciales: 'Credenciales inválidas',
  vinculacion: 'Esta cuenta requiere confirmar la contraseña actual para vincularse con Google.',
  red: 'No se pudo contactar con el servidor.',
};

/**
 * Contenedor de pantalla (design.md D8): orquesta el submit de
 * `FormularioCredenciales` y de `BotonGoogle` contra `login()`/`google()`
 * del contexto de sesión, y traduce la `CausaError` a un mensaje visible.
 * NUNCA distingue "cuenta bloqueada" de "contraseña incorrecta" — ambas
 * llegan como 'credenciales' (spec: minimal-login, "Manejo uniforme de
 * credenciales inválidas o cuenta bloqueada"), y esa misma regla vale para
 * el 401 de Google (spec: "401 en login con Google muestra error genérico").
 *
 * `idTokenPendiente` guarda el `credential` de Google mientras se espera la
 * confirmación de `DialogoVinculacion` (409 VINCULACION_REQUERIDA, spec:
 * "Vinculación requerida (409) no autentica ni redirige") — el reenvío lleva
 * `{idToken, password}` sin pedirle a Google un nuevo token.
 */
export function LoginPage() {
  const { login, google } = useSesion();
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);
  const [idTokenPendiente, setIdTokenPendiente] = useState<string | undefined>(undefined);

  async function manejarEnvio(codigo: string, password: string) {
    setCargando(true);
    setMensajeError(undefined);
    const resultado = await login(codigo, password);
    setCargando(false);
    if (!resultado.ok && resultado.error) {
      setMensajeError(MENSAJES[resultado.error]);
    }
  }

  async function manejarCredencialGoogle(idToken: string) {
    setCargando(true);
    setMensajeError(undefined);
    const resultado = await google(idToken);
    setCargando(false);
    if (!resultado.ok && resultado.error === 'vinculacion') {
      setIdTokenPendiente(idToken);
      return;
    }
    if (!resultado.ok && resultado.error) {
      setMensajeError(MENSAJES[resultado.error]);
    }
  }

  async function manejarVinculacion(password: string) {
    if (!idTokenPendiente) return;
    setCargando(true);
    setMensajeError(undefined);
    const resultado = await google(idTokenPendiente, password);
    setCargando(false);
    if (resultado.ok) {
      setIdTokenPendiente(undefined);
      return;
    }
    if (resultado.error) {
      setMensajeError(MENSAJES[resultado.error]);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-5 py-10 text-on-surface md:px-12">
      <div className="w-full max-w-md rounded-card bg-surface-white p-6 shadow-elevation">
        <h1 className="text-headline-lg-mobile text-on-surface md:text-headline-lg">
          Iniciar sesión
        </h1>
        <FormularioCredenciales
          onEnviar={manejarEnvio}
          cargando={cargando}
          mensajeError={mensajeError}
        />
        <p className="my-4 text-center text-label-md text-on-surface-variant">o</p>
        <div className="flex justify-center">
          <BotonGoogle onCredential={manejarCredencialGoogle} />
        </div>
        {idTokenPendiente && (
          <DialogoVinculacion
            cargando={cargando}
            onConfirmar={manejarVinculacion}
            onCancelar={() => setIdTokenPendiente(undefined)}
          />
        )}
      </div>
    </div>
  );
}
