import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MisVotacionesPage } from './MisVotacionesPage';
import * as votosApi from './votos-api';
import { navegar } from '../app/useRuta';
import type { MiDerechoVotoDto } from './votos-api';

// [design.md "Estrategia de pruebas" (Componente); spec: descubrimiento-derechos-voto,
// "Aterrizaje frontend con navegación bloqueada en derechos usados"; tasks.md 4.3] Contenedor de
// carga única al estilo `ComprobantePage` (D7): un solo fetch al montar, sin polling; entrada
// pendiente navega a `/votar/:derechoVotoId`; entrada `ya_voto:true` queda bloqueada sin click;
// lista vacía muestra el mensaje genérico.
vi.mock('./votos-api');
vi.mock('../app/useRuta', async () => {
  const real = await vi.importActual<typeof import('../app/useRuta')>('../app/useRuta');
  return { ...real, navegar: vi.fn() };
});

function derecho(overrides: Partial<MiDerechoVotoDto> = {}): MiDerechoVotoDto {
  return {
    derecho_voto_id: 'dv1',
    en_calidad_de: 'estudiante',
    ya_voto: false,
    proceso: {
      id: 'p1',
      nombre: 'Elección de municipio escolar',
      tipo: 'municipio',
      fecha_cierre_prevista: '2026-09-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('MisVotacionesPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('[4.3] hace un único fetch al montar, sin re-disparar en re-renders', async () => {
    vi.mocked(votosApi.misDerechos).mockResolvedValue({
      data: [derecho()],
      response: { status: 200 } as Response,
    } as Awaited<ReturnType<typeof votosApi.misDerechos>>);

    const { rerender } = render(<MisVotacionesPage />);
    await waitFor(() => expect(screen.getByText(/elección de municipio escolar/i)).toBeInTheDocument());

    rerender(<MisVotacionesPage />);

    expect(votosApi.misDerechos).toHaveBeenCalledTimes(1);
  });

  it('[4.3] click en una entrada pendiente navega a /votar/:derechoVotoId', async () => {
    vi.mocked(votosApi.misDerechos).mockResolvedValue({
      data: [derecho({ derecho_voto_id: 'dv-pendiente', ya_voto: false })],
      response: { status: 200 } as Response,
    } as Awaited<ReturnType<typeof votosApi.misDerechos>>);

    render(<MisVotacionesPage />);
    const boton = await screen.findByRole('button', { name: /elección de municipio escolar/i });
    boton.click();

    expect(navegar).toHaveBeenCalledWith({ nombre: 'votacion', derechoVotoId: 'dv-pendiente' });
  });

  it('[4.3] una entrada ya votada se muestra bloqueada, sin handler de navegación', async () => {
    vi.mocked(votosApi.misDerechos).mockResolvedValue({
      data: [derecho({ derecho_voto_id: 'dv-usado', ya_voto: true })],
      response: { status: 200 } as Response,
    } as Awaited<ReturnType<typeof votosApi.misDerechos>>);

    render(<MisVotacionesPage />);
    await screen.findByText(/ya votaste/i);

    expect(screen.queryByRole('button', { name: /elección de municipio escolar/i })).not.toBeInTheDocument();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('[4.3] lista vacía muestra el mensaje genérico', async () => {
    vi.mocked(votosApi.misDerechos).mockResolvedValue({
      data: [],
      response: { status: 200 } as Response,
    } as Awaited<ReturnType<typeof votosApi.misDerechos>>);

    render(<MisVotacionesPage />);

    expect(await screen.findByText(/no tenés votaciones activas en este momento/i)).toBeInTheDocument();
  });
});
