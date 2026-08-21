import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as authApi from './auth-api';
import { SesionContext } from './sesion-context';
import type { EstadoSesion } from './sesion-context';
import { navegar } from '../app/useRuta';

/**
 * Único componente con efectos de `auth/` (design.md D8): resuelve `whoami`
 * al montar, expone `login`/`logout`/`alRecibir401` y guarda el estado en
 * `useState` — NUNCA en `localStorage`/`sessionStorage` (la cookie es
 * `httpOnly`; cualquier espejo en cliente puede desincronizarse de Redis).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<EstadoSesion>({ estado: 'cargando' });

  const consultarSesion = useCallback(async () => {
    const sesion = await authApi.whoami();
    setEstado(sesion ? { estado: 'autenticado', sesion } : { estado: 'anonimo' });
  }, []);

  useEffect(() => {
    consultarSesion();
  }, [consultarSesion]);

  const login = useCallback(
    async (codigo: string, password: string) => {
      const resultado = await authApi.login(codigo, password);
      if (resultado.ok) {
        // El body de POST /auth/login no trae rol/userId (design.md D8,
        // "Post-login"); se vuelve a consultar whoami para poblarlos.
        await consultarSesion();
      }
      return resultado;
    },
    [consultarSesion],
  );

  const google = useCallback(
    async (idToken: string, password?: string) => {
      const resultado = await authApi.google(idToken, password);
      if (resultado.ok) {
        // Mismo motivo que login() (D8, "Post-login"): el body de
        // POST /auth/google tampoco trae rol/userId.
        await consultarSesion();
      }
      return resultado;
    },
    [consultarSesion],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // Deliberado (D8): incluso si /auth/logout falla (red/5xx), la UI
      // pasa a 'anonimo' — dejar al usuario "adentro" es el peor error. Se
      // captura acá (no `finally`) para no dejar un rechazo sin manejar:
      // AppShell dispara `logout()` sin `await`.
    } finally {
      setEstado({ estado: 'anonimo' });
      // Hallazgo de revisión manual: AuthGuard es una composición de estado
      // pura, nunca toca window.location.pathname (D8), así que sin este
      // reset el pathname de la sesión anterior sobrevive al logout. Si
      // otro rol inicia sesión después en la misma pestaña, Enrutador re-lee
      // ese pathname viejo (p. ej. /usuarios) y lo resuelve contra el rol
      // nuevo — si no tiene acceso, aterriza directo en el aviso de esa
      // pantalla en vez de en /.
      navegar({ nombre: 'inicio' });
    }
  }, []);

  const alRecibir401 = useCallback(() => {
    setEstado({ estado: 'anonimo' });
    // Mismo motivo que logout(): una sesión expirada en una pantalla
    // restringida no debe dejar esa URL esperando al próximo login.
    navegar({ nombre: 'inicio' });
  }, []);

  return (
    <SesionContext.Provider value={{ ...estado, login, google, logout, alRecibir401 }}>
      {children}
    </SesionContext.Provider>
  );
}
