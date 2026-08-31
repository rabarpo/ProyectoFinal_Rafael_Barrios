import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Enrutador } from './Enrutador';
import { AuthGuard } from '../auth/AuthGuard';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import * as votosApi from '../votos/votos-api';

// [design.md D11; spec: minimal-frontend-router; threat matrix "Enrutamiento
// (cliente)"] El enrutador se monta DENTRO de AuthGuard: la sesión, nunca la
// URL, decide entre LoginPage y la app. Ruta desconocida cae en
// 'no-encontrada' dentro del shell, sin excepción.
vi.mock('../auth/LoginPage', () => ({
  LoginPage: () => <p data-testid="login-page">LoginPage</p>,
}));

// resultados-en-vivo, PR3 (#16; design.md D11, tasks.md 13.6). Se dobla `ResultadosPage`
// completa (usa React Query vía `useResultadosEnVivo`, sin `QueryProvider` en este árbol de
// prueba) para mantener este archivo enfocado en la resolución de rutas, no en el contenido de
// la página — su propio comportamiento se prueba en `resultados/ResultadosPage.spec.tsx`.
vi.mock('../resultados/ResultadosPage', () => ({
  ResultadosPage: () => <p data-testid="resultados-page">ResultadosPage</p>,
}));

// menu-navegacion-post-login (#25; design.md D1/D6, tasks.md 2.2). Se doblan `InicioPage` y
// `ProcesoWizardPage` (esta última llama `procesos-api.padron()` sin mock en este árbol) para
// mantener este archivo enfocado en la resolución de rutas, no en el contenido de las páginas.
vi.mock('./InicioPage', () => ({
  InicioPage: () => <p data-testid="inicio-page">InicioPage</p>,
}));
vi.mock('../procesos/ProcesoWizardPage', () => ({
  ProcesoWizardPage: () => <p data-testid="proceso-wizard-page">ProcesoWizardPage</p>,
}));

// administracion-academica, PR1 (#26; design.md D1, tasks.md 1.3). Se dobla `AcademicaPage`
// (consume `useSesion()`/`academico-api` fuera de alcance de este archivo) para mantenerlo
// enfocado en la resolución de rutas.
vi.mock('../academico/AcademicaPage', () => ({
  AcademicaPage: () => <p data-testid="academica-page">AcademicaPage</p>,
}));

// administracion-usuarios-apoderados, PR1 (#27; design.md D1, tasks.md 2.1-2.2). Se doblan
// `UsuariosPage`/`CuentasBloqueadasPage` (fuera de alcance de este archivo: su gate de rol y
// fetch se prueban en sus propios specs desde PR2) para mantenerlo enfocado en la resolución
// de rutas.
vi.mock('../usuarios/UsuariosPage', () => ({
  UsuariosPage: () => <p data-testid="usuarios-page">UsuariosPage</p>,
}));
vi.mock('../usuarios/CuentasBloqueadasPage', () => ({
  CuentasBloqueadasPage: () => <p data-testid="cuentas-bloqueadas-page">CuentasBloqueadasPage</p>,
}));

// frontend-configuracion-general, PR1 (#28; design.md D1, tasks.md 2.1). Se dobla
// `ConfiguracionPage` (su gate de rol y fetch se prueban en su propio spec) para mantenerlo
// enfocado en la resolución de rutas.
vi.mock('../configuracion/ConfiguracionPage', () => ({
  ConfiguracionPage: () => <p data-testid="configuracion-page">ConfiguracionPage</p>,
}));

// estudiante-en-mis-votaciones: `MisVotacionesPage` real (#30) monta al resolver `inicio` para
// el rol `estudiante` — se dobla `votos-api.misDerechos()` (su propio fetch/contenido se prueba
// en `votos/MisVotacionesPage.spec.tsx`) para mantener este archivo enfocado en la resolución de
// rutas.
vi.mock('../votos/votos-api', () => ({
  misDerechos: vi.fn(),
}));

const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <AuthGuard>
        <Enrutador />
      </AuthGuard>
    </SesionContext.Provider>
  );
}

afterEach(() => {
  window.history.pushState(null, '', '/');
});

beforeEach(() => {
  window.history.pushState(null, '', '/procesos/00000000-0000-0000-0000-000000000000/candidatos');
});

describe('Enrutador', () => {
  it('sin sesión, cualquier pathname renderiza LoginPage (nunca resuelve rutas antes del guard)', () => {
    render(proveer({ estado: 'anonimo', ...acciones }));

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
  });

  // [design.md, threat matrix "Enrutamiento (cliente)"; tasks.md 8.1] Sin sesión, `/` y
  // `/procesos/nuevo` renderizan LoginPage — nunca InicioPage ni ProcesoWizardPage. La sesión,
  // no la URL, decide (D11, sin cambios de #12).
  it('[8.1] sin sesión, / renderiza LoginPage, nunca InicioPage', () => {
    window.history.pushState(null, '', '/');

    render(proveer({ estado: 'anonimo', ...acciones }));

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('inicio-page')).not.toBeInTheDocument();
  });

  it('[8.1] sin sesión, /procesos/nuevo renderiza LoginPage, nunca ProcesoWizardPage', () => {
    window.history.pushState(null, '', '/procesos/nuevo');

    render(proveer({ estado: 'anonimo', ...acciones }));

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByTestId('proceso-wizard-page')).not.toBeInTheDocument();
  });

  // [design.md, threat matrix "Enrutamiento (cliente)"; tasks.md 1.2/8.2] `/procesos/nuevo/extra`
  // cae en 'no-encontrada' dentro del shell, sin excepción — cruce con rutas.spec.ts 1.2.
  it('[8.2] con sesión válida, /procesos/nuevo/extra resuelve a no-encontrada sin excepción', () => {
    window.history.pushState(null, '', '/procesos/nuevo/extra');

    expect(() =>
      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
          ...acciones,
        }),
      ),
    ).not.toThrow();

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.queryByTestId('proceso-wizard-page')).not.toBeInTheDocument();
    expect(screen.getByText('Página no encontrada.')).toBeInTheDocument();
  });

  it('con sesión válida, pathname arbitrario resuelve a no-encontrada sin excepción', () => {
    window.history.pushState(null, '', '/algo/que/no/existe');

    expect(() =>
      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
          ...acciones,
        }),
      ),
    ).not.toThrow();

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
  });

  // menu-navegacion-post-login (#25; design.md D1/D4, tasks.md 2.2). `/` deja de montar
  // `ProcesoWizardPage`: ahora resuelve a `inicio` → `InicioPage`. `InicioPage` real llega en
  // Phase 6 de este change; se dobla acá para mantener este archivo enfocado en la resolución
  // de rutas, no en el contenido de la página.
  it('con sesión válida, / resuelve a InicioPage (no ProcesoWizardPage)', () => {
    window.history.pushState(null, '', '/');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.getByTestId('inicio-page')).toBeInTheDocument();
  });

  // estudiante-en-mis-votaciones: para el rol `estudiante`, `inicio` monta `MisVotacionesPage`
  // en vez de `InicioPage` — el resto de los roles no cambia (caso anterior con `administrador`).
  it('con sesión de estudiante, / resuelve a MisVotacionesPage (no InicioPage)', async () => {
    vi.mocked(votosApi.misDerechos).mockResolvedValueOnce({
      data: [],
      response: { status: 200 } as Response,
    } as Awaited<ReturnType<typeof votosApi.misDerechos>>);
    window.history.pushState(null, '', '/');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'estudiante', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.queryByTestId('inicio-page')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /mis votaciones/i })).toBeInTheDocument(),
    );
  });

  // menu-navegacion-post-login (#25; design.md D1, tasks.md 2.2). El asistente de creación de
  // proceso se muda de `/` a `/procesos/nuevo`.
  it('con sesión válida, /procesos/nuevo resuelve a ProcesoWizardPage', () => {
    window.history.pushState(null, '', '/procesos/nuevo');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.getByTestId('proceso-wizard-page')).toBeInTheDocument();
  });

  // resultados-en-vivo, PR3 (#16; design.md D11, tasks.md 13.6). `ResultadosPage` real llega en
  // PR3, doblada acá (ver mock arriba) para no depender de `QueryProvider` en este árbol.
  it('con sesión válida, /resultados/:procesoId resuelve a ResultadosPage', () => {
    window.history.pushState(null, '', '/resultados/p1');

    expect(() =>
      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
          ...acciones,
        }),
      ),
    ).not.toThrow();

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('resultados-page')).toBeInTheDocument();
  });

  // administracion-academica, PR1 (#26; design.md D1, tasks.md 1.3).
  it('[1.3] con sesión válida, /academica resuelve a AcademicaPage', () => {
    window.history.pushState(null, '', '/academica');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('academica-page')).toBeInTheDocument();
  });

  // administracion-usuarios-apoderados, PR1 (#27; design.md D1, tasks.md 2.1).
  it('[2.1] con sesión válida, /usuarios resuelve a UsuariosPage', () => {
    window.history.pushState(null, '', '/usuarios');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('usuarios-page')).toBeInTheDocument();
  });

  // administracion-usuarios-apoderados, PR1 (#27; design.md D1, tasks.md 2.2).
  it('[2.2] con sesión válida, /cuentas-bloqueadas resuelve a CuentasBloqueadasPage', () => {
    window.history.pushState(null, '', '/cuentas-bloqueadas');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'comite', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('cuentas-bloqueadas-page')).toBeInTheDocument();
  });

  // frontend-importacion-excel, PR1 (#29; design.md D1/D9, tasks.md 1.5; spec:
  // minimal-frontend-router, "Navegación a `/importacion-excel` renderiza la pantalla"; threat
  // matrix "Enrutamiento (cliente)"). `ImportacionExcelPage` real (no doblada): en PR1 no hace
  // fetch ni monta piezas, sólo el gate D9 + estado vacío, así que puede montarse en este árbol
  // sin `QueryProvider` ni mocks de API.
  it('[1.5] sin sesión, /importacion-excel renderiza LoginPage, nunca la pantalla de importación', () => {
    window.history.pushState(null, '', '/importacion-excel');

    render(proveer({ estado: 'anonimo', ...acciones }));

    expect(screen.getByTestId('login-page')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /importación de padrón/i })).not.toBeInTheDocument();
  });

  it.each(['administrador', 'director'])(
    '[1.5] con sesión de %s, /importacion-excel monta ImportacionExcelPage',
    (rol) => {
      window.history.pushState(null, '', '/importacion-excel');

      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: rol as never, creadoEn: 1 },
          ...acciones,
        }),
      );

      expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /importación de padrón/i })).toBeInTheDocument();
    },
  );

  it.each(['comite', 'docente', 'estudiante'])(
    '[1.5] con sesión de %s, /importacion-excel muestra aviso role="status" y cero piezas',
    (rol) => {
      window.history.pushState(null, '', '/importacion-excel');

      render(
        proveer({
          estado: 'autenticado',
          sesion: { userId: 'u1', rol: rol as never, creadoEn: 1 },
          ...acciones,
        }),
      );

      expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: /importación de padrón/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('importacion-excel-contenido')).not.toBeInTheDocument();
    },
  );

  // frontend-configuracion-general, PR1 (#28; design.md D1, tasks.md 2.1).
  it('[2.1] con sesión válida, /configuracion resuelve a ConfiguracionPage', () => {
    window.history.pushState(null, '', '/configuracion');

    render(
      proveer({
        estado: 'autenticado',
        sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
        ...acciones,
      }),
    );

    expect(screen.queryByTestId('login-page')).not.toBeInTheDocument();
    expect(screen.getByTestId('configuracion-page')).toBeInTheDocument();
  });
});
