import { useState } from 'react';
import imagenColegio from '../assets/images/login.jpg';
import logoColegio from '../assets/images/logo.jpg';
import { BotonGoogle } from './BotonGoogle';
import { DialogoVinculacion } from './DialogoVinculacion';
import { FormularioCredenciales } from './FormularioCredenciales';
import { IconoEscudo } from './iconos';
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
    <div className="flex min-h-screen bg-background text-on-surface">
      {/* Panel izquierdo: mismo criterio que antes (foto + overlay + título), con un tratamiento
          más editorial — degradé en vez de overlay plano, kicker sobre el título, contenido
          anclado abajo en vez de centrado, para que se lea como portada institucional y no como
          un cartel pegado sobre la foto. */}
      <div
        className="relative hidden w-1/2 shrink-0 flex-col justify-end bg-cover bg-center px-10 py-10 md:flex"
        style={{ backgroundImage: `url(${imagenColegio})` }}
      >
        {/* observación del usuario: mismo degradado que la zona azul del Paso 1 de votación
            (PasoInformacionProceso) — parte superior transparente para que la foto se note más. */}
        <div className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent" />
        <div className="relative flex flex-col gap-4">
          <span className="h-1 w-12 rounded-full bg-inverse-primary" />
          <div>
            <p className="text-label-md tracking-[0.08em] text-inverse-primary uppercase">
              Plataforma institucional
            </p>
            <h2 className="mt-2 text-headline-lg font-bold text-on-primary">
              Sistema Electoral Estudiantil Institucional
            </h2>
          </div>
          <p className="mt-6 border-t border-on-primary/20 pt-4 text-caption text-on-primary/70">
            © Created by BARRIPON
          </p>
        </div>
      </div>

      <main className="flex w-full items-center justify-center bg-surface px-5 py-10 md:w-1/2 md:px-12">
        <div className="w-full max-w-md rounded-card border-t-4 border-primary bg-surface-white p-6 shadow-elevation md:p-8">
          <div className="mb-6 flex flex-col items-center text-center">
            <img src={logoColegio} alt="Escudo institucional" className="mb-3 h-16 w-auto rounded-control shadow-elevation" />
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

          <div className="my-6 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-border-gray" />
            <span className="text-label-md text-on-surface-variant">o</span>
            <span className="h-px flex-1 bg-border-gray" />
          </div>

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

          <div className="mt-8 flex items-start gap-3 rounded-control border-l-4 border-tertiary-fixed bg-surface-container-low p-4">
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
