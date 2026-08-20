import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AcademicaPage } from './AcademicaPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import { PESTANAS } from './pestanas';
import * as academicoApi from './academico-api';
import * as usuariosApi from '../usuarios/usuarios-api';

// [design.md D1/D2/D8; tasks.md 5.1-5.3/13.2/16.2/17.5/18.11; spec: minimal-frontend-router,
// menu-navegacion-post-login] `AcademicaPage` resuelve rol ⇒ `soloLectura` y pestaña activa vía
// `useState` local (D1: nunca URL). Mismo patrón `proveer()`/`SesionContext` de
// `Enrutador.spec.tsx`. Desde PR4 (13.1), PR5 (16.1), PR6 (17.5) y PR7 (18.11), las 6 pestañas
// montan los paneles reales, así que `academico-api`/`usuarios-api` se mockean aquí también — las
// assertions se quedan a nivel de rol/tab; el comportamiento propio de cada panel ya está cubierto
// en `PanelAniosEscolares.spec.tsx`, `PanelNiveles.spec.tsx`, `PanelGrados.spec.tsx`,
// `PanelSecciones.spec.tsx`, `PanelAulas.spec.tsx` y `PanelMatriculas.spec.tsx` (no se duplica
// acá, tasks.md 13.2/16.2/17.5/18.11).
vi.mock('./academico-api', () => ({
  listarAniosEscolares: vi.fn(),
  crearAnioEscolar: vi.fn(),
  actualizarAnioEscolar: vi.fn(),
  eliminarAnioEscolar: vi.fn(),
  activarAnioEscolar: vi.fn(),
  listarNiveles: vi.fn(),
  crearNivel: vi.fn(),
  actualizarNivel: vi.fn(),
  eliminarNivel: vi.fn(),
  listarGrados: vi.fn(),
  crearGrado: vi.fn(),
  actualizarGrado: vi.fn(),
  eliminarGrado: vi.fn(),
  listarSecciones: vi.fn(),
  crearSeccion: vi.fn(),
  actualizarSeccion: vi.fn(),
  eliminarSeccion: vi.fn(),
  listarAulas: vi.fn(),
  crearAula: vi.fn(),
  actualizarAula: vi.fn(),
  eliminarAula: vi.fn(),
  listarMatriculas: vi.fn(),
  crearMatricula: vi.fn(),
  eliminarMatricula: vi.fn(),
}));

vi.mock('../usuarios/usuarios-api', () => ({
  listarUsuarios: vi.fn(),
}));

const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <AcademicaPage />
    </SesionContext.Provider>
  );
}

function contextoAdministrador(): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
    ...acciones,
  };
}

function contextoComite(): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u2', rol: 'comite', creadoEn: 1 },
    ...acciones,
  };
}

describe('AcademicaPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[5.1] la pestaña "Año escolar" está activa por defecto y las 6 pestañas son visibles', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    render(proveer(contextoAdministrador()));

    for (const pestana of PESTANAS) {
      expect(screen.getByText(pestana.etiqueta)).toBeInTheDocument();
    }
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));
    expect(
      screen.getByText('Todavía no hay años escolares registrados.'),
    ).toBeInTheDocument();
  });

  it('[5.2] hacer click en la pestaña "Nivel" renderiza su panel y desmonta el de Años', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    render(proveer(contextoAdministrador()));
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Nivel'));

    await waitFor(() => expect(academicoApi.listarNiveles).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Todavía no hay niveles registrados.')).toBeInTheDocument();
    expect(
      screen.queryByText('Todavía no hay años escolares registrados.'),
    ).not.toBeInTheDocument();
  });

  it('[16.2] hacer click en la pestaña "Grado" renderiza su panel y desmonta el de Años', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    render(proveer(contextoAdministrador()));
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Grado'));

    await waitFor(() => expect(academicoApi.listarGrados).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Todavía no hay grados registrados.')).toBeInTheDocument();
    expect(
      screen.queryByText('Todavía no hay años escolares registrados.'),
    ).not.toBeInTheDocument();
  });

  it('[16.2] hacer click en la pestaña "Sección" renderiza su panel y desmonta el de Años', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    render(proveer(contextoAdministrador()));
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Sección'));

    await waitFor(() => expect(academicoApi.listarSecciones).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Todavía no hay secciones registradas.')).toBeInTheDocument();
    expect(
      screen.queryByText('Todavía no hay años escolares registrados.'),
    ).not.toBeInTheDocument();
  });

  it('[17.5] hacer click en la pestaña "Aula" renderiza su panel y desmonta el de Años', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarGrados).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarAulas).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    render(proveer(contextoAdministrador()));
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Aula'));

    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Todavía no hay aulas registradas.')).toBeInTheDocument();
    expect(
      screen.queryByText('Todavía no hay años escolares registrados.'),
    ).not.toBeInTheDocument();
  });

  it('[18.11] hacer click en la pestaña "Matrícula" renderiza su panel (sin llamar a listarMatriculas, D9) y desmonta el de Años', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(academicoApi.listarAulas).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);
    vi.mocked(usuariosApi.listarUsuarios).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    render(proveer(contextoAdministrador()));
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText('Matrícula'));

    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/eleg[íi] un aula/i)).toBeInTheDocument();
    expect(academicoApi.listarMatriculas).not.toHaveBeenCalled();
    expect(
      screen.queryByText('Todavía no hay años escolares registrados.'),
    ).not.toBeInTheDocument();
  });

  it('[5.3] rol comité renderiza AcademicaPage sin lanzar', async () => {
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue({
      data: [],
      response: new Response(),
    } as never);

    expect(() => render(proveer(contextoComite()))).not.toThrow();
    await waitFor(() => expect(academicoApi.listarAniosEscolares).toHaveBeenCalledTimes(1));
  });
});
