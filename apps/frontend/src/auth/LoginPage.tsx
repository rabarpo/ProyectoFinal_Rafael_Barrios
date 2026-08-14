import { useState } from 'react';
import { BotonGoogle } from './BotonGoogle';
import { DialogoVinculacion } from './DialogoVinculacion';
import { FormularioCredenciales } from './FormularioCredenciales';
import { IconoEscudo, IconoInstitucion } from './iconos';
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
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header className="flex h-16 w-full items-center border-b border-border-gray bg-surface-white px-5 md:px-12">
        <div className="flex items-center gap-3">
          <IconoInstitucion className="size-7 text-primary" />
          <span className="text-title-md font-bold text-primary md:text-headline-lg-mobile">
            Portal de Votación Institucional
          </span>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 md:px-12">
        <div className="w-full max-w-md rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation md:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex size-16 items-center justify-center rounded-full border-2 border-primary/10 bg-surface-container">
              <IconoEscudo className="size-9 text-primary" />
            </div>
            <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">SEEI</h1>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Acceso al Sistema Electoral Estudiantil Institucional
            </p>
          </div>

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
            <div className="mt-6">
              <DialogoVinculacion
                cargando={cargando}
                onConfirmar={manejarVinculacion}
                onCancelar={() => setIdTokenPendiente(undefined)}
              />
            </div>
          )}

          <div className="mt-8 flex items-start gap-3 rounded-control border border-border-gray/50 bg-surface-container-low p-4">
            <IconoEscudo className="mt-0.5 size-5 shrink-0 text-on-tertiary-container" />
            <p className="text-caption text-on-surface-variant">
              Tu voto es secreto y personal. No compartas tus credenciales con terceros.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
