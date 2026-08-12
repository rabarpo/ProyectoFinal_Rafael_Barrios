import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import * as authApi from './auth-api';
import { SesionContext } from './sesion-context';
import type { EstadoSesion } from './sesion-context';

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
    }
  }, []);

  const alRecibir401 = useCallback(() => {
    setEstado({ estado: 'anonimo' });
  }, []);

  return (
    <SesionContext.Provider value={{ ...estado, login, logout, alRecibir401 }}>
      {children}
    </SesionContext.Provider>
  );
}
