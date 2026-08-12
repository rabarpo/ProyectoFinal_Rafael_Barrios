import { createContext, useContext } from 'react';
import type { ResultadoLogin, SesionUsuario } from './auth-api';

/**
 * Estado de sesión (design.md D8, "Dónde vive el estado de sesión"): tres
 * estados explícitos en vez de `sesion: SesionUsuario | null`, para que el
 * guard distinga "todavía no pregunté" (`cargando`) de "no hay sesión"
 * (`anonimo`) y no parpadee el login en cada recarga antes de resolver
 * `whoami`.
 */
export type EstadoSesion =
  | { estado: 'cargando' }
  | { estado: 'anonimo' }
  | { estado: 'autenticado'; sesion: SesionUsuario };

export type ContextoSesion = EstadoSesion & {
  login: (codigo: string, password: string) => Promise<ResultadoLogin>;
  /**
   * `password` solo se envía en el reintento de vinculación (409
   * VINCULACION_REQUERIDA ⇒ `DialogoVinculacion` reenvía `{idToken,
   * password}`, design.md D8/D10).
   */
  google: (idToken: string, password?: string) => Promise<ResultadoLogin>;
  logout: () => Promise<void>;
  /** Reacción a un 401 de CUALQUIER ruta (no solo /auth), ver design.md D8. */
  alRecibir401: () => void;
};

export const SesionContext = createContext<ContextoSesion | null>(null);

/**
 * `useSesion()` fuera de `<AuthProvider>` lanza en vez de devolver un valor
 * por defecto: no hay un estado de sesión "razonable" fuera del provider, y
 * fallar en silencio ocultaría un error de composición de árbol.
 */
export function useSesion(): ContextoSesion {
  const contexto = useContext(SesionContext);
  if (!contexto) {
    throw new Error('useSesion debe usarse dentro de <AuthProvider>');
  }
  return contexto;
}
