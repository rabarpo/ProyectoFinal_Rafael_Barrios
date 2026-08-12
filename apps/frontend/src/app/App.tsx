import { AuthProvider } from '../auth/AuthProvider';
import { AuthGuard } from '../auth/AuthGuard';
import { AppShell } from './AppShell';
import { ProcesoWizardPage } from '../procesos/ProcesoWizardPage';

/**
 * Raíz de la app (design.md D8): el asistente ya no se monta directo desde
 * `main.tsx` — vive detrás del guard, dentro del shell. Tarea 28.1:
 * `ProcesoWizardPage` (#8/#9) es el único hijo de `AppShell` — `AppShell.tsx`
 * ya era genérico (`children: ReactNode`, sin cambios propios necesarios
 * desde PR2/PR3), así que el punto de montaje real es esta composición.
 */
export function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <AppShell>
          <ProcesoWizardPage />
        </AppShell>
      </AuthGuard>
    </AuthProvider>
  );
}
