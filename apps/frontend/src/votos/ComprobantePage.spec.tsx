import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ComprobantePage } from './ComprobantePage';
import * as votosApi from './votos-api';
import type { ComprobanteDto } from './votos-api';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';

// [design.md D12; spec comprobante-autenticado: "Usuario autenticado consulta su propio
// comprobante"/"Comprobante de otro usuario es rechazado"; tasks.md 14.1] Único efecto de este
// batch: `votos-api.comprobante()` al montar. Mismo patrón de mock que `VotacionPage.spec.tsx`.
vi.mock('./votos-api', () => ({ comprobante: vi.fn() }));

// [Phase 27.2; design.md D7, "call sites"] `ComprobantePage` cablea `onVolverAlInicio`/
// `onCerrarSesion` de `PanelComprobante` con `useSesion()` — mismo patrón de
// `SesionContext.Provider` que `VotacionPage.spec.tsx`/`NavegacionPrincipal.spec.tsx`.
function conSesion(logout: () => Promise<void>, votoId: string) {
  const contexto: ContextoSesion = {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: 'estudiante', creadoEn: 1 },
    login: vi.fn(),
    google: vi.fn(),
    logout,
    alRecibir401: vi.fn(),
  };
  return (
    <SesionContext.Provider value={contexto}>
      <ComprobantePage votoId={votoId} />
    </SesionContext.Provider>
  );
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
    response: { ok: true, status: 200 } as Response,
  };
}

describe('ComprobantePage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[14.1] muestra "Cargando…" mientras espera la respuesta', () => {
    vi.mocked(votosApi.comprobante).mockReturnValue(new Promise(() => {}) as never);

    render(conSesion(vi.fn(), 'v1'));

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('[14.1] éxito muestra el comprobante con eleccion_resumen', async () => {
    vi.mocked(votosApi.comprobante).mockResolvedValueOnce(comprobanteMock());

    render(conSesion(vi.fn(), 'v1'));

    await screen.findByText(/k7qm-3xz9-8htb-p4wr/i);
    expect(screen.getByText('Lista A')).toBeInTheDocument();
    expect(votosApi.comprobante).toHaveBeenCalledWith('v1');
  });

  it('[14.1] 403 (voto ajeno o votoId inexistente) muestra rechazo sin exponer datos del comprobante', async () => {
    vi.mocked(votosApi.comprobante).mockResolvedValueOnce({
      data: undefined,
      error: undefined,
      response: { ok: false, status: 403 } as Response,
    } as never);

    render(conSesion(vi.fn(), 'v1'));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/no pod/i);
    expect(screen.queryByText('Lista A')).not.toBeInTheDocument();
  });

  // [Phase 27.2; design.md D7, "call sites"; proposal.md Success Criteria: "ComprobantePage sigue
  // funcionando en ambos caminos"] Mismo wiring que VotacionPage, badge yaRegistrado intacto.
  it('[27.2] cablea onVolverAlInicio/onCerrarSesion de useSesion() sin romper el badge yaRegistrado', async () => {
    vi.mocked(votosApi.comprobante).mockResolvedValueOnce(comprobanteMock());
    const logout = vi.fn();

    render(conSesion(logout, 'v1'));

    await screen.findByText(/k7qm-3xz9-8htb-p4wr/i);
    expect(screen.getByText(/ya has votado/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /cerrar sesión/i }));
    expect(logout).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /volver al inicio/i }));
    expect(window.location.pathname).toBe('/');
  });
});
