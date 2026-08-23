import { AuthProvider } from '../auth/AuthProvider';
import { AuthGuard } from '../auth/AuthGuard';
import { AppShell } from './AppShell';
import { Enrutador } from './Enrutador';
import { QueryProvider } from './QueryProvider';
import { useRuta } from './useRuta';
import type { Ruta } from './rutas';

/**
 * Raíz de la app (design.md D8/D11). Desde PR6 (#12), `AppShell` monta el
 * `Enrutador` en vez del asistente directo: la sesión sigue eligiendo entre
 * `LoginPage` y la app (`AuthGuard`, sin cambios), pero dentro de la app el
 * `Enrutador` resuelve qué vista mostrar según `window.location.pathname`
 * (`useRuta`, D10). `ProcesoWizardPage` sigue siendo la vista de `/`.
 *
 * resultados-en-vivo (#16, PR2; design.md D9, tasks.md 9.6): `QueryProvider` se monta DENTRO de
 * `AuthGuard`, envolviendo `AppShell` — el `QueryClient` (y su caché de consultas) muere con la
 * sesión al desmontarse `AuthGuard`, sin `queryClient.clear()` manual.
 *
 * dashboard-panel-jornada (Backlog #20, PR4; design.md D10, tasks.md 14.5). `RUTAS_SIN_SHELL`
 * lista las variantes de `Ruta` que se montan SIN `AppShell` (sin header, sin sidebar) — hoy
 * sólo `proyeccion` (pantalla de kiosco). `App.tsx` sigue sin lógica de negocio propia: sólo
 * decide el layout según `ruta.nombre`, dentro de la MISMA `AuthGuard > QueryProvider` (la
 * sesión y el `QueryClient` no cambian, sólo el chrome visual alrededor del `Enrutador`).
 */
const RUTAS_SIN_SHELL: ReadonlyArray<Ruta['nombre']> = ['proyeccion'];

export function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <QueryProvider>
          <Raiz />
        </QueryProvider>
      </AuthGuard>
    </AuthProvider>
  );
}

function Raiz() {
  const ruta = useRuta();

  if (RUTAS_SIN_SHELL.includes(ruta.nombre)) {
    return <Enrutador />;
  }

  return (
    <AppShell>
      <Enrutador />
    </AppShell>
  );
}
