import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PanelDatosInstitucionales } from './PanelDatosInstitucionales';
import { actualizarConfiguracion } from '../configuracion-api';
import type { ConfiguracionRespuestaDto } from '../configuracion-api';

// [design.md D5/D6, tasks.md Fase 9-11; spec: configuracion-institucional] `FormularioGenerico`
// para los 8 campos string precargados/SMTP + diff de merge parcial + coerción de `smtp_puerto` +
// wiring de `CampoDominios`. `vi.mock('../configuracion-api')`: sólo `actualizarConfiguracion` se
// invoca desde este panel — el `GET` singleton vive en `ConfiguracionPage` (D6).
vi.mock('../configuracion-api', async () => {
  const actual = await vi.importActual<typeof import('../configuracion-api')>('../configuracion-api');
  return { ...actual, actualizarConfiguracion: vi.fn() };
});

const actualizarConfiguracionMock = vi.mocked(actualizarConfiguracion);

const CONFIG_BASE: ConfiguracionRespuestaDto = {
  id: 'config-1',
  nombre: 'Colegio San Martín',
  director: 'Ana Torres',
  color_primario: '#112233',
  color_secundario: '#445566',
  zona_horaria: 'America/Lima',
  dominios_google: ['colegio.edu.pe'],
  logo_presente: false,
  logo_mime: null,
};

beforeEach(() => {
  actualizarConfiguracionMock.mockReset();
});

describe('PanelDatosInstitucionales', () => {
  it('[9.1] precarga nombre, director, colores y zona horaria desde config', () => {
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={vi.fn()} />);

    expect(screen.getByLabelText(/nombre de la institución/i)).toHaveValue('Colegio San Martín');
    expect(screen.getByLabelText(/director/i)).toHaveValue('Ana Torres');
    expect(screen.getByLabelText(/color primario/i)).toHaveValue('#112233');
    expect(screen.getByLabelText(/color secundario/i)).toHaveValue('#445566');
    expect(screen.getByLabelText(/zona horaria/i)).toHaveValue('America/Lima');
  });

  it('[9.2] renderiza los tres campos SMTP vacíos aunque config trajera valores', () => {
    render(
      <PanelDatosInstitucionales
        config={{ ...CONFIG_BASE, smtp_host: 'smtp.colegio.edu.pe' } as ConfiguracionRespuestaDto}
        onGuardado={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/servidor smtp/i)).toHaveValue('');
    expect(screen.getByLabelText(/puerto smtp/i)).toHaveValue('');
    expect(screen.getByLabelText(/remitente smtp/i)).toHaveValue('');
    expect(screen.getByText(/dejar.*en blanco no modifica el valor guardado/i)).toBeInTheDocument();
  });

  it('[9.3] no renderiza ningún campo de contraseña SMTP', () => {
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={vi.fn()} />);

    const html = document.body.innerHTML.toLowerCase();
    expect(html).not.toMatch(/contraseñ|clave|password/);
  });

  it('[10.1] editar solo nombre y director envía exactamente esas dos claves', async () => {
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/nombre de la institución/i), {
      target: { value: 'Colegio Nuevo Nombre' },
    });
    fireEvent.change(screen.getByLabelText(/^director/i), { target: { value: 'Luis Paredes' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarConfiguracionMock).toHaveBeenCalledTimes(1));
    expect(actualizarConfiguracionMock).toHaveBeenCalledWith({
      nombre: 'Colegio Nuevo Nombre',
      director: 'Luis Paredes',
    });
  });

  it('[10.2] dejar los tres campos SMTP en blanco no incluye ninguna clave smtp_*', async () => {
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/nombre de la institución/i), {
      target: { value: 'Otro nombre' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarConfiguracionMock).toHaveBeenCalledTimes(1));
    const body = actualizarConfiguracionMock.mock.calls[0][0];
    expect(Object.keys(body).some((clave) => clave.startsWith('smtp_'))).toBe(false);
  });

  it('[10.3] typear "8025" en puerto SMTP envía smtp_puerto como number', async () => {
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/puerto smtp/i), { target: { value: '8025' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarConfiguracionMock).toHaveBeenCalledTimes(1));
    const body = actualizarConfiguracionMock.mock.calls[0][0];
    expect(body.smtp_puerto).toBe(8025);
    expect(typeof body.smtp_puerto).toBe('number');
  });

  it.each(['abc', '80.5'])(
    '[10.4] puerto SMTP no entero (%s) muestra error de campo y no llama al backend',
    async (valorInvalido) => {
      render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={vi.fn()} />);

      fireEvent.change(screen.getByLabelText(/puerto smtp/i), { target: { value: valorInvalido } });
      fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

      expect(await screen.findByRole('alert')).toHaveTextContent(/puerto/i);
      expect(actualizarConfiguracionMock).not.toHaveBeenCalled();
    },
  );

  it('[10.5] éxito llama a onGuardado con los datos devueltos por el backend', async () => {
    const devuelto = { ...CONFIG_BASE, nombre: 'Nombre confirmado' };
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: devuelto });
    const onGuardado = vi.fn();
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={onGuardado} />);

    fireEvent.change(screen.getByLabelText(/nombre de la institución/i), {
      target: { value: 'Nombre confirmado' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(devuelto));
  });

  it('[10.5] error 4xx muestra mensajeDeError en role="alert", no llama a onGuardado y conserva los valores', async () => {
    actualizarConfiguracionMock.mockResolvedValue({
      ok: false,
      status: 400,
      codigo: 'CAMPO_INVALIDO',
      campo: 'color_primario',
    });
    const onGuardado = vi.fn();
    render(<PanelDatosInstitucionales config={CONFIG_BASE} onGuardado={onGuardado} />);

    fireEvent.change(screen.getByLabelText(/color primario/i), { target: { value: 'no-es-un-color' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/color_primario/);
    expect(onGuardado).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/color primario/i)).toHaveValue('no-es-un-color');
  });

  it('[11.1] agregar un dominio y guardar incluye dominios_google junto a otros cambios', async () => {
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    render(
      <PanelDatosInstitucionales
        config={{ ...CONFIG_BASE, dominios_google: [] }}
        onGuardado={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/dominio/i), { target: { value: 'nuevo.edu.pe' } });
    fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarConfiguracionMock).toHaveBeenCalledTimes(1));
    expect(actualizarConfiguracionMock).toHaveBeenCalledWith({ dominios_google: ['nuevo.edu.pe'] });
  });

  it('[11.2] quitar el último dominio sin tocar nada más envía dominios_google: []', async () => {
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    render(
      <PanelDatosInstitucionales
        config={{ ...CONFIG_BASE, dominios_google: ['colegio.edu.pe'] }}
        onGuardado={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /quitar/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarConfiguracionMock).toHaveBeenCalledTimes(1));
    expect(actualizarConfiguracionMock).toHaveBeenCalledWith({ dominios_google: [] });
  });

  it('[11.3] guardar sin tocar dominios_google no incluye esa clave en el body', async () => {
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    render(
      <PanelDatosInstitucionales
        config={{ ...CONFIG_BASE, dominios_google: ['colegio.edu.pe'] }}
        onGuardado={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre de la institución/i), {
      target: { value: 'Otro nombre' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => expect(actualizarConfiguracionMock).toHaveBeenCalledTimes(1));
    const body = actualizarConfiguracionMock.mock.calls[0][0];
    expect('dominios_google' in body).toBe(false);
  });

  it('[11.4] error 4xx en dominios_google no borra la lista previamente renderizada', async () => {
    actualizarConfiguracionMock.mockResolvedValue({
      ok: false,
      status: 400,
      codigo: 'CAMPO_INVALIDO',
      campo: 'dominios_google',
    });
    render(
      <PanelDatosInstitucionales
        config={{ ...CONFIG_BASE, dominios_google: ['colegio.edu.pe'] }}
        onGuardado={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText(/dominio/i), { target: { value: 'otro.edu.pe' } });
    fireEvent.click(screen.getByRole('button', { name: /^agregar$/i }));
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await screen.findByRole('alert');
    expect(screen.getByText('colegio.edu.pe')).toBeInTheDocument();
    expect(screen.getByText('otro.edu.pe')).toBeInTheDocument();
  });
});
