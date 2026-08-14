import { AuthProvider } from '../auth/AuthProvider';
import { AuthGuard } from '../auth/AuthGuard';
import { AppShell } from './AppShell';
import { Enrutador } from './Enrutador';

/**
 * Raíz de la app (design.md D8/D11). Desde PR6 (#12), `AppShell` monta el
 * `Enrutador` en vez del asistente directo: la sesión sigue eligiendo entre
 * `LoginPage` y la app (`AuthGuard`, sin cambios), pero dentro de la app el
 * `Enrutador` resuelve qué vista mostrar según `window.location.pathname`
 * (`useRuta`, D10). `ProcesoWizardPage` sigue siendo la vista de `/`.
 */
export function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppShell>
          <Enrutador />
        </AppShell>
      </AuthGuard>
    </AuthProvider>
  );
}
