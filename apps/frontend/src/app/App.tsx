import { AuthProvider } from '../auth/AuthProvider';
import { AuthGuard } from '../auth/AuthGuard';
import { AppShell } from './AppShell';

/**
 * Raíz de la app (design.md D8): el asistente ya no se monta directo desde
 * `main.tsx` — vive detrás del guard, dentro del shell. Hoy `AppShell` no
 * tiene un hijo real: `ProcesoWizardPage` (#8/#9) todavía no existe en este
 * PR; la tarea 28.1 lo montará acá cuando exista.
 */
export function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppShell>
          <p>Asistente de procesos electorales — próximamente.</p>
        </AppShell>
      </AuthGuard>
    </AuthProvider>
  );
}
