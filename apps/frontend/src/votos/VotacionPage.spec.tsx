import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { VotacionPage } from './VotacionPage';
import * as votosApi from './votos-api';
import type { PapeletaDto, ComprobanteDto } from './votos-api';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';

// [Phase 27; design.md D7, "call sites"] `VotacionPage` cablea `onVolverAlInicio`/`onCerrarSesion`
// de `PanelComprobante` con `navegar({ nombre: 'inicio' })` y `logout()` de `useSesion()` — mismo
// patrón de `SesionContext.Provider` que `NavegacionPrincipal.spec.tsx`.
function conSesion(logout: () => Promise<void>, hijos: ReactNode) {
  const contexto: ContextoSesion = {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: 'estudiante', creadoEn: 1 },
    login: vi.fn(),
    google: vi.fn(),
    logout,
    alRecibir401: vi.fn(),
  };
  return <SesionContext.Provider value={contexto}>{hijos}</SesionContext.Provider>;
}

// [design.md D14; tasks.md 18.1-18.5] Único contenedor con TODOS los efectos de este batch:
// `votos-api.papeleta()` en el paso 1, `votos-api.emitir()` en la confirmación del paso 3. El paso
// NO es parte de la URL (espejo de `AperturaProcesoPage`): navegar entre pasos no recarga ni
// cambia el pathname, y el paso 2 no es alcanzable sin haber pasado por el paso 1 en la misma
// sesión de render.
vi.mock('./votos-api', () => ({
  papeleta: vi.fn(),
  emitir: vi.fn(),
  urlFotoOpcion: (derechoVotoId: string, id: string) => `/api/votos/papeleta/${derechoVotoId}/opciones/${id}/foto`,
  urlPlanTrabajoOpcion: (derechoVotoId: string, id: string) =>
    `/api/votos/papeleta/${derechoVotoId}/opciones/${id}/plan-trabajo`,
}));

function papeletaMock(overrides: Partial<PapeletaDto> = {}): { data: PapeletaDto; response: Response } {
  return {
    data: {
      proceso: {
        id: 'p1',
        nombre: 'Alcaldía escolar 2026',
        descripcion: 'Elección del municipio escolar',
        fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
        tipo: 'municipio',
      },
      en_calidad_de: 'estudiante',
      opciones: [
        {
          id: 'o1',
          etiqueta: 'Lista A',
          simbolo: 'Sol',
          lema: 'Juntos',
          candidato_id: 'c1',
          candidato_nombres: 'Ana Pérez',
          cargo: 'Presidenta',
          foto_presente: true,
        },
        { id: 'o2', etiqueta: 'Lista B' },
      ],
      ya_voto: false,
      comprobante: null,
      ...overrides,
    } as PapeletaDto,
    response: { ok: true } as Response,
  };
}

function comprobanteMock(): { data: ComprobanteDto; response: Response } {
  return {
    data: {
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: '2026-09-05T17:59:00.000Z',
      proceso: { id: 'p1', nombre: 'Alcaldía escolar 2026' },
      en_calidad_de: 'estudiante',
      eleccion_resumen: 'Lista A',
    } as ComprobanteDto,
    response: { ok: true, status: 201 } as Response,
  };
}

describe('VotacionPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/');
  });

  it('[18.3] recorre los 3 pasos sin recargar y confirma el voto con éxito', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce(comprobanteMock());

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    expect(votosApi.papeleta).toHaveBeenCalledWith('dv1');

    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));

    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(votosApi.emitir).toHaveBeenCalledTimes(1));
    const llamada = vi.mocked(votosApi.emitir).mock.calls[0][0];
    expect(llamada.derecho_voto_id).toBe('dv1');
    expect(llamada.lista_id).toBe('o1');
    expect(llamada.clave_idempotencia).toMatch(/^[0-9a-f-]{36}$/i);

    await screen.findByText(/k7qm-3xz9-8htb-p4wr/i);
  });

  // [Phase 27.1; design.md D7, "call sites"] `PanelComprobante` recibe
  // `onVolverAlInicio={() => navegar({ nombre: 'inicio' })}` y `onCerrarSesion={logout}` de
  // `useSesion()`.
  it('[27.1] "Volver al Inicio" navega a "/" y "Cerrar Sesión" invoca logout() de useSesion()', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce(comprobanteMock());
    const logout = vi.fn();

    render(conSesion(logout, <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await screen.findByText(/k7qm-3xz9-8htb-p4wr/i);

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(logout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /volver al inicio/i }));
    expect(window.location.pathname).toBe('/');
  });

  // [design.md D5/D6; tasks.md 20.1] Nuevo en PR4: `onVolver` de `PasoBoleta` regresa al paso 1
  // sin recargar — el contenedor sigue siendo el único con estado de paso.
  it('[20.1] "Volver al paso anterior" en el paso 2 regresa al paso 1', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('button', { name: /volver al paso anterior/i }));

    await screen.findByRole('button', { name: /comenzar votación/i });
    expect(screen.getByText(/alcaldía escolar 2026/i)).toBeInTheDocument();
  });

  it('[17.2/18.5] enviar el voto en blanco arma el payload con blanco=true, sin ningún id de elección', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce(comprobanteMock());

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /blanco/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));

    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(votosApi.emitir).toHaveBeenCalledTimes(1));
    const llamada = vi.mocked(votosApi.emitir).mock.calls[0][0];
    expect(llamada.blanco).toBe(true);
    expect(llamada.lista_id).toBeUndefined();
    expect(llamada.opcion_id).toBeUndefined();
    expect(llamada.candidato_id).toBeUndefined();
  });

  // confirmacion-voto-como-modal: `PasoConfirmacion` deja de reemplazar la pantalla al llegar al
  // paso 3 — pasa a ser un diálogo modal superpuesto sobre `PasoBoleta` (paso 2), que sigue en el
  // DOM (visible/oscurecido detrás del overlay) en vez de desmontarse.
  it('en el paso 3, PasoBoleta sigue en el DOM detrás del diálogo modal de confirmación', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));

    await screen.findByRole('dialog');
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /lista a/i })).toBeChecked();
  });

  it('[18.4] sin conexión al confirmar muestra el estado correspondiente, sin quedar en "Registrando…" para siempre', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));

    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await screen.findByText(/sin conexión/i);
  });

  it('[16.5] la clave de idempotencia se mantiene estable si se reintenta la confirmación', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(comprobanteMock());

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await screen.findByText(/sin conexión/i);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));

    await waitFor(() => expect(votosApi.emitir).toHaveBeenCalledTimes(2));
    const [primeraLlamada, segundaLlamada] = vi.mocked(votosApi.emitir).mock.calls;
    expect(primeraLlamada[0].clave_idempotencia).toBe(segundaLlamada[0].clave_idempotencia);
  });

  // [design.md D9/D14, "Taxonomía de rechazos"; tasks.md 22.1] PR6: cada código de rechazo del
  // backend se enruta a su variante dedicada de `PantallaRechazo`, y el éxito real (`201`) muestra
  // `PanelComprobante`. `200` (D6: reintento/colisión/derecho ya ejercido, nunca un error HTTP)
  // enruta a la variante `ya-votaste` con el comprobante ya emitido.
  async function llegarAlPaso3() {
    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /siguiente paso/i }));
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  }

  // menu-navegacion-post-login (#25; design.md D1, tasks.md 3.2). Un 403 (derecho ajeno o
  // inexistente, D9 causa 1) redirige con `navegar({ nombre: 'proceso-nuevo' })`, que ahora
  // resuelve a `/procesos/nuevo` en vez de `/` (D1) — `navegar` NO está mockeado en este archivo,
  // así que la aserción usa el `pathname` real del historial.
  it('[3.2] un 403 al confirmar redirige a /procesos/nuevo', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce({
      data: undefined,
      error: undefined,
      response: { ok: false, status: 403 } as Response,
    } as never);

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));
    await llegarAlPaso3();

    await waitFor(() => expect(window.location.pathname).toBe('/procesos/nuevo'));
  });

  it('[22.1] SIN_DERECHO enruta a la pantalla "No estás en el padrón"', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce({
      data: undefined,
      error: { codigo: 'SIN_DERECHO' },
      response: { ok: false, status: 409 } as Response,
    } as never);

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));
    await llegarAlPaso3();

    await screen.findByText(/no estás en el padrón/i);
  });

  it('[22.1] VOTACION_CERRADA enruta a la pantalla "Votación cerrada" con la hora exacta del servidor', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce({
      data: undefined,
      error: { codigo: 'VOTACION_CERRADA', cierre: '2026-09-05T18:00:00.000Z' },
      response: { ok: false, status: 409 } as Response,
    } as never);

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));
    await llegarAlPaso3();

    await screen.findByText(/votación cerrada/i);
    expect(screen.getByRole('alert')).toHaveTextContent(new Date('2026-09-05T18:00:00.000Z').toLocaleString());
  });

  it('[22.1] respuesta 200 (D6: reintento/colisión/derecho ya ejercido) enruta a "Ya emitiste tu voto" con el comprobante', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce({
      data: comprobanteMock().data,
      error: undefined,
      response: { ok: true, status: 200 } as Response,
    } as never);

    render(conSesion(vi.fn(), <VotacionPage derechoVotoId="dv1" />));
    await llegarAlPaso3();

    await screen.findByText(/ya emitiste tu voto/i);
    expect(screen.getByRole('alert')).toHaveTextContent('K7QM-3XZ9-8HTB-P4WR');
  });
});
