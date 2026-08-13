import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// design.md D8: la app monta <App/> (AuthProvider > AuthGuard > AppShell),
// no ProcesoWizardPage directo — queda detrás del guard de sesión.
// HealthPage.tsx sigue existiendo como pantalla de diagnóstico, pero se deja
// fuera del shell a propósito (no hay router para exponerla como ruta).
const root = document.getElementById('root');
if (!root) {
  throw new Error('No se encontró el elemento #root');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
