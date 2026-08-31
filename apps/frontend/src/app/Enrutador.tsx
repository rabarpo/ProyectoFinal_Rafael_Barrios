import { useRuta } from './useRuta';
import { useSesion } from '../auth/sesion-context';
import { InicioPage } from './InicioPage';
import { ProcesoWizardPage } from '../procesos/ProcesoWizardPage';
import { ProcesosIndexPage } from '../procesos/ProcesosIndexPage';
import { AperturaProcesoPage } from '../procesos/AperturaProcesoPage';
import { RegistroCandidatoPage } from '../candidatos/RegistroCandidatoPage';
import { GestionCandidatosPage } from '../candidatos/GestionCandidatosPage';
import { VotacionPage } from '../votos/VotacionPage';
import { ComprobantePage } from '../votos/ComprobantePage';
import { ResultadosPage } from '../resultados/ResultadosPage';
import { AcademicaPage } from '../academico/AcademicaPage';
import { UsuariosPage } from '../usuarios/UsuariosPage';
import { CuentasBloqueadasPage } from '../usuarios/CuentasBloqueadasPage';
import { ConfiguracionPage } from '../configuracion/ConfiguracionPage';
import { PanelJornadaPage } from '../panel-jornada/PanelJornadaPage';
import { ProyeccionPage } from '../panel-jornada/ProyeccionPage';
import { MisVotacionesPage } from '../votos/MisVotacionesPage';

/**
 * design.md D11: `switch` sobre `Ruta`, montado DENTRO de `AuthGuard` >
 * `AppShell` — la sesión, no la URL, decide entre `LoginPage` y la app
 * (threat matrix "Enrutamiento (cliente)"). `candidato-nuevo`/
 * `candidato-edicion` montan `RegistroCandidatoPage` real desde PR7
 * (tasks.md 21.5); `candidatos` (listado/gestión) monta `GestionCandidatosPage`
 * real desde PR8 (tasks.md 23.6); `apertura` monta `AperturaProcesoPage` real
 * desde `#13`/PR5 (design.md D13, tasks.md 18.2); `votacion` monta
 * `VotacionPage` real desde `#14`/PR5 (design.md D14, tasks.md 18.2); `comprobante` monta
 * `ComprobantePage` real desde `#15`/PR4 (design.md D12, tasks.md 14.3); `resultados` monta
 * `ResultadosPage` real desde `#16`/PR3 (design.md D11, tasks.md 13.6); `academica` monta
 * `AcademicaPage` real desde `#26`/PR1 (design.md D1, tasks.md 1.3); `usuarios` monta
 * `UsuariosPage` y `cuentas-bloqueadas` monta `CuentasBloqueadasPage`, ambos stubs desde
 * `#27`/PR1 (design.md D1, tasks.md 2.3) reemplazados por su implementación real en PR2;
 * `configuracion` monta `ConfiguracionPage` desde `#28`/PR1 (design.md D1, tasks.md 2.2).
 * `mis-votaciones` monta `MisVotacionesPage` real desde `#30`/PR2 (design.md D7, tasks.md 5.3).
 * `no-encontrada` se renderiza
 * dentro del shell, nunca lanza ni deja `undefined`. menu-navegacion-post-login
 * (#25; design.md D1): `/` ya NO monta `ProcesoWizardPage` — resuelve a la
 * variante `inicio` y monta `InicioPage`; el asistente de creación de proceso
 * se mudó a `/procesos/nuevo` (variante `proceso-nuevo`, sin cambios de nombre).
 * dashboard-panel-jornada (Backlog #20, PR3/PR4; design.md D10, "Cambios de archivos", tasks.md
 * 12.4/14.4): `panel-jornada` monta `PanelJornadaPage` real (reemplaza el placeholder de PR2,
 * tasks.md 9.3). `proyeccion` monta `ProyeccionPage` real, siempre fuera de `AppShell` (D10,
 * `App.tsx`/`RUTAS_SIN_SHELL`, tasks.md 14.5) — el `Enrutador` no distingue el layout, sólo la
 * variante de `Ruta`.
 * `estudiante`-en-mis-votaciones: el rol `estudiante` aterriza directo en `MisVotacionesPage` al
 * resolver `inicio` (mismo componente que `mis-votaciones`) — el resto de los roles sigue viendo
 * `InicioPage` sin cambios.
 */
function VistaNoEncontrada() {
  return <p className="text-body-md text-on-surface">Página no encontrada.</p>;
}

export function Enrutador() {
  const ruta = useRuta();
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;

  switch (ruta.nombre) {
    case 'inicio':
      return rol === 'estudiante' ? <MisVotacionesPage /> : <InicioPage />;
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
    case 'resultados':
      return <ResultadosPage procesoId={ruta.procesoId} />;
    case 'academica':
      return <AcademicaPage />;
    case 'usuarios':
      return <UsuariosPage />;
    case 'cuentas-bloqueadas':
      return <CuentasBloqueadasPage />;
    case 'configuracion':
      return <ConfiguracionPage />;
    case 'panel-jornada':
      return <PanelJornadaPage />;
    case 'proyeccion':
      return <ProyeccionPage procesoId={ruta.procesoId} />;
    case 'mis-votaciones':
      return <MisVotacionesPage />;
    case 'no-encontrada':
      return <VistaNoEncontrada />;
  }
}
