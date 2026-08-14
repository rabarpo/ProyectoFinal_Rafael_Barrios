import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { ProcesoWizardPage } from './ProcesoWizardPage';
import * as procesosApi from './procesos-api';
import type { PadronRespuestaDto, ProcesoRespuestaDto } from './procesos-api';

// [design.md D7]: `procesos-api.padron`/`crear` son la única superficie de
// red de este contenedor; se mockean para que los tests de navegación y
// submit sean deterministas y no dependan de un backend vivo.
vi.mock('./procesos-api', () => ({ padron: vi.fn(), crear: vi.fn() }));

// [design.md D12] El panel de éxito enlaza a "Gestionar candidatos" vía
// `navegar()` (#12, PR6) — se mockea para no depender del enrutador real.
const { navegarMock } = vi.hoisted(() => ({ navegarMock: vi.fn() }));
vi.mock('../app/useRuta', () => ({ navegar: navegarMock }));

function padronVacio(): { data: PadronRespuestaDto; response: Response } {
  return {
    data: {
      derechos_totales: 0,
      estudiantes: 0,
      padres: 0,
      cuentas_distintas: 0,
      aulas: [],
      aulas_excluidas: [],
    },
    response: { ok: true } as Response,
  };
}

function llenarPaso1(nombre: string, tipo: string) {
  fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: nombre } });
  fireEvent.change(screen.getByLabelText(/tipo de proceso/i), { target: { value: tipo } });
  fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
}

function llenarPaso2Institucion() {
  fireEvent.click(screen.getByRole('radio', { name: /^estudiantes$/i }));
  fireEvent.click(screen.getByRole('radio', { name: /instituci[oó]n/i }));
  fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));
}

async function avanzarDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// [spec: electoral-process-wizard, "Selección de tipo determina las opciones
// de segmentación disponibles" y "Cuatro tipos de proceso soportados"];
// design.md D7 (navegación 1→2 sin router, preserva estado en el reducer).
describe('ProcesoWizardPage', () => {
  it('paso 1 pide nombre y tipo antes de habilitar Siguiente', () => {
    render(<ProcesoWizardPage />);

    expect(screen.getByRole('heading', { name: /datos del proceso/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('navegar de paso 1 a paso 2 preserva el estado tecleado', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Elección de comité 2026' },
    });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'municipio' },
    });

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.getByRole('heading', { name: /público y segmentación/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));

    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Elección de comité 2026');
    expect(screen.getByLabelText(/tipo de proceso/i)).toHaveValue('municipio');
  });

  it('representante_aula no ofrece la opción institución en el paso 2', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Elección de aula' } });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'representante_aula' },
    });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.queryByRole('radio', { name: /instituci[oó]n/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^aulas$/i })).toBeChecked();
  });

  it('municipio sí ofrece la opción institución en el paso 2', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Elección municipal' } });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'municipio' },
    });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.getByRole('radio', { name: /instituci[oó]n/i })).toBeInTheDocument();
  });

  // [design.md D5]: el indicador de progreso es texto plano, no un heading
  // (ProcesoWizardPage.spec.tsx:53/69 ya usan getByRole('heading', …) para
  // los títulos de cada paso, y no deben chocar con el indicador).
  it('muestra "Paso 2 de 4" como texto, no como heading', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Elección municipal' } });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'municipio' },
    });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.getByText(/paso 2 de 4/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /paso 2 de 4/i })).not.toBeInTheDocument();
  });
});

// [spec: electoral-process-wizard, "El asistente pre-marca ocultar_resultados"
// y "Creación en lote..."]; design.md D7 (usePadronEnVivo, submit vía
// procesos-api.crear()).
describe('ProcesoWizardPage — padrón, revisión y submit (PR9)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(procesosApi.padron).mockReset().mockResolvedValue(padronVacio());
    vi.mocked(procesosApi.crear).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('paso 4 muestra el checkbox de ocultar_resultados marcado por defecto', async () => {
    render(<ProcesoWizardPage />);

    llenarPaso1('Elección de comité 2026', 'municipio');
    llenarPaso2Institucion();
    await avanzarDebounce();

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i })); // paso 3 -> 4

    expect(
      screen.getByRole('checkbox', { name: /ocultar resultados/i }),
    ).toBeChecked();
  });

  it('el conteo se vuelve a solicitar al cambiar la segmentación', async () => {
    render(<ProcesoWizardPage />);

    llenarPaso1('Elección de comité 2026', 'municipio');

    fireEvent.click(screen.getByRole('radio', { name: /^estudiantes$/i }));
    fireEvent.click(screen.getByRole('radio', { name: /instituci[oó]n/i }));
    await avanzarDebounce();

    expect(procesosApi.padron).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('radio', { name: /^padres de familia$/i }));
    await avanzarDebounce();

    expect(procesosApi.padron).toHaveBeenCalledTimes(2);
  });

  it('la navegación completa de 4 pasos llama POST /procesos al confirmar', async () => {
    vi.mocked(procesosApi.crear).mockResolvedValue({
      data: { id: 'proceso-1' } as ProcesoRespuestaDto,
      response: { ok: true, status: 201 } as Response,
    });

    render(<ProcesoWizardPage />);

    llenarPaso1('Elección de comité 2026', 'municipio');
    llenarPaso2Institucion();
    await avanzarDebounce();

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i })); // paso 3 -> 4

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(procesosApi.crear).toHaveBeenCalledTimes(1);
    expect(procesosApi.crear).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Elección de comité 2026',
        tipo: 'municipio',
        publico_objetivo: 'estudiantes',
        alcance: 'institucion',
        ocultar_resultados: true,
      }),
    );
  });

  it('el panel de éxito ofrece "Gestionar candidatos" y navega al índice del proceso creado', async () => {
    vi.mocked(procesosApi.crear).mockResolvedValue({
      data: { id: 'proceso-1' } as ProcesoRespuestaDto,
      response: { ok: true, status: 201 } as Response,
    });

    render(<ProcesoWizardPage />);

    llenarPaso1('Elección de comité 2026', 'municipio');
    llenarPaso2Institucion();
    await avanzarDebounce();

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i })); // paso 3 -> 4

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole('button', { name: /gestionar candidatos/i }));

    expect(navegarMock).toHaveBeenCalledWith({ nombre: 'candidatos', procesoId: 'proceso-1' });
  });
});
