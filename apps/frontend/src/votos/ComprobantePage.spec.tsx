import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComprobantePage } from './ComprobantePage';
import * as votosApi from './votos-api';
import type { ComprobanteDto } from './votos-api';

// [design.md D12; spec comprobante-autenticado: "Usuario autenticado consulta su propio
// comprobante"/"Comprobante de otro usuario es rechazado"; tasks.md 14.1] Único efecto de este
// batch: `votos-api.comprobante()` al montar. Mismo patrón de mock que `VotacionPage.spec.tsx`.
vi.mock('./votos-api', () => ({ comprobante: vi.fn() }));

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

    render(<ComprobantePage votoId="v1" />);

    expect(screen.getByText(/cargando/i)).toBeInTheDocument();
  });

  it('[14.1] éxito muestra el comprobante con eleccion_resumen', async () => {
    vi.mocked(votosApi.comprobante).mockResolvedValueOnce(comprobanteMock());

    render(<ComprobantePage votoId="v1" />);

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

    render(<ComprobantePage votoId="v1" />);

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/no pod/i);
    expect(screen.queryByText('Lista A')).not.toBeInTheDocument();
  });
});
