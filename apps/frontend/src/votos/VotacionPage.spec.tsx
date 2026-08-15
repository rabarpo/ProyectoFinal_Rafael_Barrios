import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VotacionPage } from './VotacionPage';
import * as votosApi from './votos-api';
import type { PapeletaDto, ComprobanteDto } from './votos-api';

// [design.md D14; tasks.md 18.1-18.5] Único contenedor con TODOS los efectos de este batch:
// `votos-api.papeleta()` en el paso 1, `votos-api.emitir()` en la confirmación del paso 3. El paso
// NO es parte de la URL (espejo de `AperturaProcesoPage`): navegar entre pasos no recarga ni
// cambia el pathname, y el paso 2 no es alcanzable sin haber pasado por el paso 1 en la misma
// sesión de render.
vi.mock('./votos-api', () => ({ papeleta: vi.fn(), emitir: vi.fn() }));

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
        { id: 'o1', etiqueta: 'Lista A' },
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
  });

  it('[18.3] recorre los 3 pasos sin recargar y confirma el voto con éxito', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce(comprobanteMock());

    render(<VotacionPage derechoVotoId="dv1" />);

    await screen.findByText(/alcaldía escolar 2026/i);
    expect(votosApi.papeleta).toHaveBeenCalledWith('dv1');

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

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

  it('[17.2/18.5] enviar el voto en blanco arma el payload con blanco=true, sin ningún id de elección', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce(comprobanteMock());

    render(<VotacionPage derechoVotoId="dv1" />);

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /blanco/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

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

  it('[18.4] sin conexión al confirmar muestra el estado correspondiente, sin quedar en "Registrando…" para siempre', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockRejectedValueOnce(new TypeError('Failed to fetch'));

    render(<VotacionPage derechoVotoId="dv1" />);

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

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

    render(<VotacionPage derechoVotoId="dv1" />);

    await screen.findByText(/alcaldía escolar 2026/i);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
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
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await screen.findByRole('radiogroup');
    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    await screen.findByRole('checkbox');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
  }

  it('[22.1] SIN_DERECHO enruta a la pantalla "No estás en el padrón"', async () => {
    vi.mocked(votosApi.papeleta).mockResolvedValueOnce(papeletaMock());
    vi.mocked(votosApi.emitir).mockResolvedValueOnce({
      data: undefined,
      error: { codigo: 'SIN_DERECHO' },
      response: { ok: false, status: 409 } as Response,
    } as never);

    render(<VotacionPage derechoVotoId="dv1" />);
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

    render(<VotacionPage derechoVotoId="dv1" />);
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

    render(<VotacionPage derechoVotoId="dv1" />);
    await llegarAlPaso3();

    await screen.findByText(/ya emitiste tu voto/i);
    expect(screen.getByRole('alert')).toHaveTextContent('K7QM-3XZ9-8HTB-P4WR');
  });
});
