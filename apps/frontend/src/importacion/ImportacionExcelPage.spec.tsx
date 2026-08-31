import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ImportacionExcelPage } from './ImportacionExcelPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import { importarPadron } from './importacion-api';
import type { ResultadoImportacionDto } from './importacion-api';

// [design.md D5/D6/D8/D9; tasks.md 3.5-3.6] `vi.mock('./importacion-api')`: intercepta el módulo
// resuelto. La página es el único componente con estado y llamadas. Máquina de estados D5:
// inactivo → enviando → resultado | error. El `File` vive en un `useState` aparte y sobrevive a
// `fase='resultado'` (reintento sin recargar). Mismo patrón `proveer()`/`SesionContext` de
// `ConfiguracionPage.spec.tsx`.
vi.mock('./importacion-api', async () => {
  const actual = await vi.importActual<typeof import('./importacion-api')>('./importacion-api');
  return { ...actual, importarPadron: vi.fn() };
});

const importarPadronMock = vi.mocked(importarPadron);

const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <ImportacionExcelPage />
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

const RESULTADO: ResultadoImportacionDto = {
  importacion_id: 'imp-1',
  filas_totales: 10,
  filas_creadas: 8,
  filas_existentes: 1,
  filas_invalidas: 1,
  errores: [{ fila: 4, campo: 'correo', motivo: 'formato', valor_recibido: 'x' }],
};

function seleccionarArchivo(archivo: File) {
  fireEvent.change(screen.getByLabelText(/archivo/i), { target: { files: [archivo] } });
}

beforeEach(() => {
  importarPadronMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ImportacionExcelPage', () => {
  it('con un .xlsm seleccionado, muestra alerta inmediata y NO invoca importarPadron', async () => {
    render(proveer(contextoConRol('administrador')));

    seleccionarArchivo(new File(['x'], 'padron.xlsm'));
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/\.xlsx o \.csv/i);
    expect(importarPadronMock).not.toHaveBeenCalled();
  });

  it('con un archivo de más de 5 MB, muestra alerta y NO invoca importarPadron', () => {
    render(proveer(contextoConRol('director')));

    const grande = new File([new Uint8Array(6 * 1024 * 1024)], 'padron.xlsx');
    seleccionarArchivo(grande);
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/5 MB/i);
    expect(importarPadronMock).not.toHaveBeenCalled();
  });

  it('durante el envío muestra role="status" y deshabilita el botón; en 201 renderiza el resumen', async () => {
    let resolverEnvio!: (v: Awaited<ReturnType<typeof importarPadron>>) => void;
    importarPadronMock.mockReturnValue(
      new Promise((resolve) => {
        resolverEnvio = resolve;
      }),
    );

    render(proveer(contextoConRol('administrador')));
    seleccionarArchivo(new File(['ok'], 'padron.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /importar/i })).toBeDisabled();

    resolverEnvio({ ok: true, data: RESULTADO });

    expect(await screen.findByText('Filas totales')).toBeInTheDocument();
    expect(screen.getByText('Filas totales').parentElement).toHaveTextContent('10');
    expect(screen.getByText('Filas inválidas').parentElement).toHaveTextContent('1');
    expect(importarPadronMock).toHaveBeenCalledTimes(1);
  });

  it('en un 400 del backend muestra el mensaje legible sin desmontar la pantalla', async () => {
    importarPadronMock.mockResolvedValue({ ok: false, status: 400, codigo: 'CABECERA_INVALIDA' });

    render(proveer(contextoConRol('administrador')));
    seleccionarArchivo(new File(['ok'], 'padron.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cabecera/i);
    expect(screen.getByRole('button', { name: /importar/i })).toBeInTheDocument();
  });

  it('un segundo envío reemplaza el resultado sin recarga ni navegación', async () => {
    importarPadronMock.mockResolvedValueOnce({ ok: true, data: RESULTADO });
    importarPadronMock.mockResolvedValueOnce({
      ok: true,
      data: { ...RESULTADO, filas_totales: 99, filas_creadas: 99, filas_invalidas: 0 },
    });

    render(proveer(contextoConRol('administrador')));
    seleccionarArchivo(new File(['ok'], 'padron.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));
    await screen.findByText('Filas totales');
    expect(screen.getByText('Filas totales').parentElement).toHaveTextContent('10');

    seleccionarArchivo(new File(['ok2'], 'padron-corregido.xlsx'));
    fireEvent.click(screen.getByRole('button', { name: /importar/i }));

    await waitFor(() =>
      expect(screen.getByText('Filas totales').parentElement).toHaveTextContent('99'),
    );
    expect(importarPadronMock).toHaveBeenCalledTimes(2);
  });

  it.each(['comite', 'docente', 'estudiante'])(
    'rol %s no alcanza la pantalla: aviso y sin CampoArchivo',
    (rol) => {
      render(proveer(contextoConRol(rol)));

      expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
      expect(screen.queryByRole('button', { name: /importar/i })).not.toBeInTheDocument();
    },
  );
});
