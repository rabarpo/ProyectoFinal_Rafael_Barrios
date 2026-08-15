import { useRuta } from './useRuta';
import { ProcesoWizardPage } from '../procesos/ProcesoWizardPage';
import { ProcesosIndexPage } from '../procesos/ProcesosIndexPage';
import { AperturaProcesoPage } from '../procesos/AperturaProcesoPage';
import { RegistroCandidatoPage } from '../candidatos/RegistroCandidatoPage';
import { GestionCandidatosPage } from '../candidatos/GestionCandidatosPage';
import { VotacionPage } from '../votos/VotacionPage';
import { ComprobantePage } from '../votos/ComprobantePage';

/**
 * design.md D11: `switch` sobre `Ruta`, montado DENTRO de `AuthGuard` >
 * `AppShell` — la sesión, no la URL, decide entre `LoginPage` y la app
 * (threat matrix "Enrutamiento (cliente)"). `candidato-nuevo`/
 * `candidato-edicion` montan `RegistroCandidatoPage` real desde PR7
 * (tasks.md 21.5); `candidatos` (listado/gestión) monta `GestionCandidatosPage`
 * real desde PR8 (tasks.md 23.6); `apertura` monta `AperturaProcesoPage` real
 * desde `#13`/PR5 (design.md D13, tasks.md 18.2); `votacion` monta
 * `VotacionPage` real desde `#14`/PR5 (design.md D14, tasks.md 18.2); `comprobante` monta
 * `ComprobantePage` real desde `#15`/PR4 (design.md D12, tasks.md 14.3) — sin
 * stubs restantes en el alcance de este change. `no-encontrada` se renderiza
 * dentro del shell, nunca lanza ni deja `undefined`.
 */
function VistaNoEncontrada() {
  return <p className="text-body-md text-on-surface">Página no encontrada.</p>;
}

export function Enrutador() {
  const ruta = useRuta();

  switch (ruta.nombre) {
    case 'proceso-nuevo':
      return <ProcesoWizardPage />;
    case 'procesos':
      return <ProcesosIndexPage />;
    case 'candidatos':
      return <GestionCandidatosPage procesoId={ruta.procesoId} />;
    case 'candidato-nuevo':
      return <RegistroCandidatoPage procesoId={ruta.procesoId} />;
    case 'candidato-edicion':
      return <RegistroCandidatoPage procesoId={ruta.procesoId} candidatoId={ruta.candidatoId} />;
    case 'apertura':
      return <AperturaProcesoPage procesoId={ruta.procesoId} />;
    case 'votacion':
      return <VotacionPage derechoVotoId={ruta.derechoVotoId} />;
    case 'comprobante':
      return <ComprobantePage votoId={ruta.votoId} />;
    case 'no-encontrada':
      return <VistaNoEncontrada />;
  }
}
