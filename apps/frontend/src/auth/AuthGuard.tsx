import type { ReactNode } from 'react';
import { useSesion } from './sesion-context';
import { LoginPage } from './LoginPage';

/**
 * Composición pura, NO un guard de router (no hay router — design.md D8):
 * decide qué árbol renderizar según el estado de sesión. Mientras
 * `estado === 'cargando'` no renderiza NI el login NI los children — evita
 * el parpadeo de contenido protegido antes de resolver `whoami` (adversarial
 * de PR2, Phase 5).
 */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { estado } = useSesion();

  if (estado === 'cargando') return null;
  if (estado === 'anonimo') return <LoginPage />;
  return <>{children}</>;
}
