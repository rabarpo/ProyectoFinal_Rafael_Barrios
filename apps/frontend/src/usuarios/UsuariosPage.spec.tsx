import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { UsuariosPage } from './UsuariosPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import { listarApoderados, listarUsuarios } from './usuarios-api';
import type { UsuarioRespuestaDto } from './usuarios-api';

// [design.md D4; tasks.md 5.1-5.3; spec: administracion-usuarios-apoderados, "Aislamiento del
// rol comite en el cliente"] Gate BINARIO allowlist fail-closed: `puedeGestionar = rol ===
// 'administrador' || rol === 'director'`. A diferencia de #26 D8 (`soloLectura` graduado), un rol
// que falla el gate acá recibe CERO llamadas a la API — `GET /usuarios` es
// `@Roles('administrador', 'director')` en el backend, así que renderizar en modo lectura
// garantizaría un 403 permanente. Mismo patrón `proveer()`/`SesionContext` de
// `Enrutador.spec.tsx`/`AcademicaPage.spec.tsx`.
//
// [design.md D3/D12; tasks.md 10.1-12.4] PR4 agrega el listado real — `vi.mock('./usuarios-api')`
// intercepta `listarUsuarios` (que sigue devolviendo el objeto crudo `{ data, response }`, no
// `ResultadoApi`, per D5/D6) así que las aserciones de "cero fetch" de PR2 (5.1/5.2) siguen
// siendo válidas: el `fetch` global nunca se invoca, sólo el módulo mockeado.
vi.mock('./usuarios-api');

const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function usuarioDeEjemplo(datos: Partial<UsuarioRespuestaDto> = {}): UsuarioRespuestaDto {
  return {
    id: 'u1',
    nombres: 'Ana Pérez',
    dni: '10000001',
    codigo: 'A001',
    correo: 'ana@example.com',
    rol: 'estudiante',
    estado: 'activo',
    creado_en: '2026-01-01T00:00:00.000Z',
    ...datos,
  };
}

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <UsuariosPage />
    </SesionContext.Provider>
  );
}

function contextoConRol(rol: string): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: rol as never, creadoEn: 1 },
    ...acciones,
  };
}

describe('UsuariosPage', () => {
  beforeEach(() => {
    vi.mocked(listarUsuarios).mockResolvedValue({ data: [] } as never);
    // [design.md D10; tasks.md Phase 18] Selecting a row opens `FichaUsuarioPage`, which mounts
    // the real `PanelApoderados` for the default `rol: 'estudiante'` fixture — this file doesn't
    // test that panel's own behavior (covered by `PanelApoderados.spec.tsx`), just prevents its
    // `listarApoderados(usuarioId)` call from crashing on the auto-mocked `usuarios-api`.
    vi.mocked(listarApoderados).mockResolvedValue({ ok: true, data: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it.each(['administrador', 'director'])(
    '[5.1] rol %s renderiza el shell de la página sin lanzar y sin llamar a fetch',
    (rol) => {
      const fetchEspiado = vi.fn();
      vi.stubGlobal('fetch', fetchEspiado);

      expect(() => render(proveer(contextoConRol(rol)))).not.toThrow();

      expect(screen.getByTestId('usuarios-page-shell')).toBeInTheDocument();
      expect(fetchEspiado).not.toHaveBeenCalled();
    },
  );

  it.each(['comite', 'docente', 'estudiante'])(
    '[5.2] rol %s renderiza un aviso de sección no disponible y sin llamar a fetch',
    (rol) => {
      const fetchEspiado = vi.fn();
      vi.stubGlobal('fetch', fetchEspiado);

      render(proveer(contextoConRol(rol)));

      expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
      expect(fetchEspiado).not.toHaveBeenCalled();
    },
  );

  it('[5.2] sin sesión (rol indefinido) renderiza el aviso de sección no disponible y sin llamar a fetch', () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal('fetch', fetchEspiado);

    render(
      proveer({
        estado: 'anonimo',
        ...acciones,
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
    expect(fetchEspiado).not.toHaveBeenCalled();
  });

  // [design.md D3/D12; tasks.md 10.1-10.4; spec: administracion-usuarios-apoderados, "UI de
  // listado central de Usuario con filtro por rol y estado"]
  it('[10.1] con puedeGestionar, monta y llama a listarUsuarios una vez, renderizando filas via TablaGenerica', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      data: [usuarioDeEjemplo({ id: 'u1', nombres: 'Ana Pérez' })],
    } as never);

    render(proveer(contextoConRol('administrador')));

    await waitFor(() => expect(listarUsuarios).toHaveBeenCalledTimes(1));
    expect(listarUsuarios).toHaveBeenCalledWith({});
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  it('[10.2] cambiar el filtro rol y luego estado re-consulta listarUsuarios con los filtros combinados', async () => {
    render(proveer(contextoConRol('director')));
    await waitFor(() => expect(listarUsuarios).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'docente' } });
    await waitFor(() => expect(listarUsuarios).toHaveBeenLastCalledWith({ rol: 'docente' }));

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'activo' } });
    await waitFor(() =>
      expect(listarUsuarios).toHaveBeenLastCalledWith({ rol: 'docente', estado: 'activo' }),
    );
  });

  it('[10.3] una combinación de filtros sin resultados renderiza un estado vacío legible, no un error', async () => {
    render(proveer(contextoConRol('administrador')));

    expect(await screen.findByText(/no hay usuarios/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // [design.md D12; tasks.md 11.1-11.2] `TablaGenerica` no se toca — la paginación es un `slice`
  // hecho en `UsuariosPage`.
  it('[11.1] pagina 25 filas por página con pie "Mostrando" y anterior/siguiente', async () => {
    const filas = Array.from({ length: 30 }, (_, i) =>
      usuarioDeEjemplo({ id: `u${i}`, nombres: `Usuario ${i}` }),
    );
    vi.mocked(listarUsuarios).mockResolvedValue({ data: filas } as never);

    render(proveer(contextoConRol('administrador')));

    await screen.findByText('Usuario 0');
    expect(screen.getByText(/mostrando 1–25 de 30/i)).toBeInTheDocument();
    expect(screen.queryByText('Usuario 25')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    expect(await screen.findByText('Usuario 25')).toBeInTheDocument();
    expect(screen.queryByText('Usuario 0')).not.toBeInTheDocument();
    expect(screen.getByText(/mostrando 26–30 de 30/i)).toBeInTheDocument();
  });

  it('[11.2] cambiar de filtro mientras se está en la página 2 vuelve a la página 1', async () => {
    const filas = Array.from({ length: 30 }, (_, i) =>
      usuarioDeEjemplo({ id: `u${i}`, nombres: `Usuario ${i}`, rol: 'docente' }),
    );
    vi.mocked(listarUsuarios).mockResolvedValue({ data: filas } as never);
    render(proveer(contextoConRol('administrador')));
    await screen.findByText('Usuario 0');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await screen.findByText('Usuario 25');

    vi.mocked(listarUsuarios).mockResolvedValue({ data: filas.slice(0, 5) } as never);
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'docente' } });

    expect(await screen.findByText(/mostrando 1–5 de 5/i)).toBeInTheDocument();
  });

  // [design.md D3/D1; tasks.md 12.1-12.3, 15.1-15.2; spec: minimal-frontend-router, "Abrir la
  // ficha de un usuario no cambia la URL"] PR5 (Phase 15) reemplaza el placeholder de PR4 por
  // `FichaUsuarioPage` real — estos tests quedan scoped a la mecánica del swap (no navega, monta
  // la ficha), el comportamiento propio de la ficha vive en `FichaUsuarioPage.spec.tsx` (13.1-14.6).
  it('[12.1/15.1] click en "Abrir" monta FichaUsuarioPage sin cambiar la URL', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      data: [usuarioDeEjemplo({ id: 'u1', nombres: 'Ana Pérez' })],
    } as never);
    render(proveer(contextoConRol('administrador')));
    await screen.findByText('Ana Pérez');
    const pathnameAntes = window.location.pathname;

    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByTestId('ficha-usuario-page')).toBeInTheDocument();
    expect(screen.queryByTestId('usuarios-page-shell')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe(pathnameAntes);
  });

  it('[12.2/15.1] "Volver" desde la ficha regresa al listado y vuelve a renderizar TablaGenerica', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      data: [usuarioDeEjemplo({ id: 'u1', nombres: 'Ana Pérez' })],
    } as never);
    render(proveer(contextoConRol('administrador')));
    await screen.findByText('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(screen.getByTestId('ficha-usuario-page')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));

    expect(screen.getByTestId('usuarios-page-shell')).toBeInTheDocument();
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  // [design.md D3; tasks.md 15.1] `onCambio` cierra la ficha y recarga el listado — mismo
  // contrato que el resto de `#26` (reload sobre optimistic update).
  it('[15.1] al confirmar un cambio de estado desde la ficha, vuelve al listado y recarga', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      data: [usuarioDeEjemplo({ id: 'u1', nombres: 'Ana Pérez', estado: 'activo' })],
    } as never);
    render(proveer(contextoConRol('administrador')));
    await screen.findByText('Ana Pérez');
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    expect(await waitFor(() => screen.getByTestId('ficha-usuario-page'))).toBeInTheDocument();

    const { cambiarEstadoUsuario } = await import('./usuarios-api');
    vi.mocked(cambiarEstadoUsuario).mockResolvedValue({
      ok: true,
      data: { id: 'u1', estado: 'inactivo' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(screen.getByTestId('usuarios-page-shell')).toBeInTheDocument());
    expect(listarUsuarios).toHaveBeenCalledTimes(2);
  });

  // Gap detectado post-Phase 15: el modo creación de FichaUsuarioPage (usuario === null) estaba
  // implementado y probado a nivel de componente pero era inalcanzable desde el listado real —
  // sin este botón, dar de alta un usuario exigía llamar la API a mano (rompe el Success Criteria
  // de proposal.md). Fix aplicado directamente, no vía sdd-apply, por ser una edición mecánica ya
  // entendida sobre un solo archivo.
  it('[gap-crear] click en "Crear" monta FichaUsuarioPage en modo creación, sin cambiar la URL', async () => {
    vi.mocked(listarUsuarios).mockResolvedValue({
      data: [usuarioDeEjemplo({ id: 'u1', nombres: 'Ana Pérez' })],
    } as never);
    render(proveer(contextoConRol('administrador')));
    await screen.findByText('Ana Pérez');
    const pathnameAntes = window.location.pathname;

    fireEvent.click(screen.getByRole('button', { name: 'Crear' }));

    expect(screen.getByTestId('ficha-usuario-page')).toBeInTheDocument();
    expect(screen.getByText('Nuevo usuario')).toBeInTheDocument();
    expect(window.location.pathname).toBe(pathnameAntes);
  });
});
