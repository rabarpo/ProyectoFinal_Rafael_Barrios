import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PanelLogo } from './PanelLogo';
import { subirLogo, urlLogo } from '../configuracion-api';

// [design.md D8; tasks.md Fase 14] `CampoArchivo` (sin tocar) + botón propio "Subir logo" +
// doble barrera (`validarArchivoLogo` antes de cualquier `POST`). `logoPresente` gatea el `<img>`
// porque `GET /configuracion/logo` 404 sin logo — un `<img>` incondicional mostraría el ícono roto.
vi.mock('../configuracion-api', async () => {
  const actual = await vi.importActual<typeof import('../configuracion-api')>('../configuracion-api');
  return { ...actual, subirLogo: vi.fn() };
});

const subirLogoMock = vi.mocked(subirLogo);

function seleccionarArchivo(archivo: File) {
  fireEvent.change(screen.getByLabelText(/logo/i), { target: { files: [archivo] } });
}

describe('PanelLogo', () => {
  beforeEach(() => {
    subirLogoMock.mockReset();
  });

  it('[14.1] logoPresente: true renderiza el <img> actual, CampoArchivo y el botón "Subir logo"', () => {
    render(<PanelLogo logoPresente logoMime="image/png" />);

    expect(screen.getByRole('img')).toHaveAttribute('src', urlLogo(undefined));
    expect(screen.getByLabelText(/logo/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subir logo/i })).toBeInTheDocument();
  });

  it('[14.2] logoPresente: false no renderiza ningún <img>', () => {
    render(<PanelLogo logoPresente={false} />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('[14.3] un .pdf se rechaza con alerta y sin invocar subirLogo', () => {
    render(<PanelLogo logoPresente={false} />);
    const archivo = new File(['contenido'], 'documento.pdf', { type: 'application/pdf' });

    seleccionarArchivo(archivo);
    fireEvent.click(screen.getByRole('button', { name: /subir logo/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(subirLogoMock).not.toHaveBeenCalled();
  });

  it('[14.3] un archivo de 3 MB se rechaza con alerta y sin invocar subirLogo', () => {
    render(<PanelLogo logoPresente={false} />);
    const archivo = new File(['x'.repeat(3 * 1024 * 1024)], 'logo.png', { type: 'image/png' });

    seleccionarArchivo(archivo);
    fireEvent.click(screen.getByRole('button', { name: /subir logo/i }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(subirLogoMock).not.toHaveBeenCalled();
  });

  it('[14.4] un PNG válido de 1 MB llama subirLogo y, en éxito, cambia el src del <img>', async () => {
    subirLogoMock.mockResolvedValue({
      ok: true,
      data: { logo_mime: 'image/png', logo_actualizado_en: '2026-02-02T00:00:00.000Z' },
    });
    render(<PanelLogo logoPresente logoMime="image/png" />);
    const srcInicial = screen.getByRole('img').getAttribute('src');
    const archivo = new File(['x'.repeat(1024 * 1024)], 'logo.png', { type: 'image/png' });

    seleccionarArchivo(archivo);
    fireEvent.click(screen.getByRole('button', { name: /subir logo/i }));

    expect(subirLogoMock).toHaveBeenCalledWith(archivo);
    await waitFor(() => {
      expect(screen.getByRole('img').getAttribute('src')).not.toBe(srcInicial);
    });
  });

  it('[14.5] un 4xx del backend muestra mensajeDeError en un role="alert"', async () => {
    subirLogoMock.mockResolvedValue({ ok: false, status: 400, codigo: 'LOGO_TAMANIO_EXCEDIDO' });
    render(<PanelLogo logoPresente={false} />);
    const archivo = new File(['x'.repeat(1024)], 'logo.png', { type: 'image/png' });

    seleccionarArchivo(archivo);
    fireEvent.click(screen.getByRole('button', { name: /subir logo/i }));

    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(/tamaño máximo/i);
  });

  it('[14.6] deshabilitado deshabilita el botón "Subir logo" (CampoArchivo se mantiene sin tocar, D8)', () => {
    render(<PanelLogo logoPresente={false} deshabilitado />);

    expect(screen.getByRole('button', { name: /subir logo/i })).toBeDisabled();
  });
});
