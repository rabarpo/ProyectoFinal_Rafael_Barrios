import { AuthProvider } from '../auth/AuthProvider';
import { AuthGuard } from '../auth/AuthGuard';
import { AppShell } from './AppShell';
import { Enrutador } from './Enrutador';
import { QueryProvider } from './QueryProvider';

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
 */
export function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <QueryProvider>
          <AppShell>
            <Enrutador />
          </AppShell>
        </QueryProvider>
      </AuthGuard>
    </AuthProvider>
  );
}
