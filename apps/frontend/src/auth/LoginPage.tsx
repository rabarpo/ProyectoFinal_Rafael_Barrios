import { useState } from 'react';
import { FormularioCredenciales } from './FormularioCredenciales';
import { useSesion } from './sesion-context';

const MENSAJES: Record<'credenciales' | 'vinculacion' | 'red', string> = {
  credenciales: 'Credenciales inválidas',
  // [D8] `vinculacion` (409) es un flujo de Google — se resuelve en PR3
  // (DialogoVinculacion). Se mantiene el mensaje acá para que el catálogo de
  // causas de auth-api.ts tenga una traducción completa desde ya.
  vinculacion: 'Esta cuenta requiere confirmar la contraseña actual para vincularse con Google.',
  red: 'No se pudo contactar con el servidor.',
};

/**
 * Contenedor de pantalla (design.md D8): orquesta el submit de
 * `FormularioCredenciales` contra `login()` del contexto de sesión y
 * traduce la `CausaError` a un mensaje visible. NUNCA distingue "cuenta
 * bloqueada" de "contraseña incorrecta" — ambas llegan como 'credenciales'
 * (spec: minimal-login, "Manejo uniforme de credenciales inválidas o cuenta
 * bloqueada").
 */
export function LoginPage() {
  const { login } = useSesion();
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);

  async function manejarEnvio(codigo: string, password: string) {
    setCargando(true);
    setMensajeError(undefined);
    const resultado = await login(codigo, password);
    setCargando(false);
    if (!resultado.ok && resultado.error) {
      setMensajeError(MENSAJES[resultado.error]);
    }
  }

  return (
    <div>
      <h1>Iniciar sesión</h1>
      <FormularioCredenciales onEnviar={manejarEnvio} cargando={cargando} mensajeError={mensajeError} />
    </div>
  );
}
