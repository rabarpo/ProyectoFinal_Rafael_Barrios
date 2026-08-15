import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { PasoPublico } from './PasoPublico';
import * as academicoApi from '../../academico/academico-api';
import type {
  AnioEscolarRespuestaDto,
  AulaRespuestaDto,
  GradoRespuestaDto,
  NivelRespuestaDto,
} from '../../academico/academico-api';
import type { Segmentacion } from '../wizard-reducer';

// Arreglo de UX (#11 ya archivado): Nivel/Grados/Aulas antes eran texto libre
// con IDs separados por coma; ahora consumen `academico/academico-api.ts` vía
// `useOpcionesSegmentacion.ts`. Se mockea el módulo de API, no el hook, para
// ejercitar el flujo real de carga/error de cada selector.
vi.mock('../../academico/academico-api', () => ({
  listarNiveles: vi.fn(),
  listarGrados: vi.fn(),
  listarAulas: vi.fn(),
  listarAniosEscolares: vi.fn(),
}));

function ok<T>(data: T): { data: T; response: Response } {
  return { data, response: { ok: true } as Response };
}

function nivel(id: string, nombre: string): NivelRespuestaDto {
  return { id, nombre };
}

function grado(id: string, nombre: string, nivel_id: string): GradoRespuestaDto {
  return { id, nombre, nivel_id };
}

function aula(id: string, grado_id: string, turno: 'manana' | 'tarde'): AulaRespuestaDto {
  return { id, turno, grado_id, seccion_id: 'seccion-1', anio_escolar_id: 'anio-1' };
}

function anioActivo(id: string): AnioEscolarRespuestaDto {
  return { id, nombre: '2026', activo: true } as AnioEscolarRespuestaDto;
}

/** Harness controlado: PasoPublico es presentacional, el estado vive acá. */
function Harness() {
  const [segmentacion, setSegmentacion] = useState<Segmentacion>({
    publico_objetivo: 'estudiantes',
    alcance: undefined,
    nivel_id: undefined,
    grado_ids: [],
    aula_ids: [],
  });

  return (
    <PasoPublico
      segmentacion={segmentacion}
      tipoProceso="municipio"
      onCambiarPublicoObjetivo={(valor) => setSegmentacion((s) => ({ ...s, publico_objetivo: valor }))}
      onCambiarAlcance={(valor) =>
        setSegmentacion((s) => ({ ...s, alcance: valor, nivel_id: undefined, grado_ids: [], aula_ids: [] }))
      }
      onCambiarNivel={(valor) => setSegmentacion((s) => ({ ...s, nivel_id: valor }))}
      onCambiarGrados={(valor) => setSegmentacion((s) => ({ ...s, grado_ids: valor }))}
      onCambiarAulas={(valor) => setSegmentacion((s) => ({ ...s, aula_ids: valor }))}
    />
  );
}

async function elegirAlcance(nombre: RegExp) {
  await act(async () => {
    screen.getByRole('radio', { name: nombre }).click();
    await Promise.resolve();
  });
}

describe('PasoPublico — selectores de Nivel/Grados/Aulas', () => {
  beforeEach(() => {
    // `useGrados`/`useNiveles` corren siempre (el filtro de nivel de la
    // sección Grados también alimenta el filtro de grado de Aulas), así que
    // cada test necesita una respuesta por defecto para las cuatro llamadas,
    // aunque ese `alcance` en particular no las use.
    vi.mocked(academicoApi.listarNiveles).mockReset().mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarGrados).mockReset().mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarAulas).mockReset().mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarAniosEscolares).mockReset().mockResolvedValue(ok([]));
  });

  it('carga los niveles desde la API y los ofrece en un selector único', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue(
      ok([nivel('nivel-1', 'Inicial'), nivel('nivel-2', 'Primaria')]),
    );

    render(<Harness />);
    await elegirAlcance(/^nivel$/i);

    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Primaria' })).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox', { name: /^nivel$/i }) as HTMLSelectElement;
    await act(async () => {
      select.value = 'nivel-2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(select).toHaveValue('nivel-2');
  });

  it('permite seleccionar múltiples grados vía checkboxes', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarGrados).mockResolvedValue(
      ok([grado('grado-1', '1ro', 'nivel-1'), grado('grado-2', '2do', 'nivel-1')]),
    );

    render(<Harness />);
    await elegirAlcance(/^grados$/i);

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: '1ro' })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole('checkbox', { name: '1ro' }).click();
      screen.getByRole('checkbox', { name: '2do' }).click();
    });

    expect(screen.getByRole('checkbox', { name: '1ro' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2do' })).toBeChecked();

    await act(async () => {
      screen.getByRole('checkbox', { name: '1ro' }).click();
    });

    expect(screen.getByRole('checkbox', { name: '1ro' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '2do' })).toBeChecked();
  });

  it('permite seleccionar múltiples aulas, acotadas al año escolar activo por defecto', async () => {
    vi.mocked(academicoApi.listarNiveles).mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarGrados).mockResolvedValue(ok([grado('grado-1', '1ro', 'nivel-1')]));
    vi.mocked(academicoApi.listarAniosEscolares).mockResolvedValue(ok([anioActivo('anio-1')]));
    vi.mocked(academicoApi.listarAulas).mockResolvedValue(
      ok([aula('aula-1', 'grado-1', 'manana'), aula('aula-2', 'grado-1', 'tarde')]),
    );

    render(<Harness />);
    await elegirAlcance(/^aulas$/i);

    await waitFor(() => {
      expect(academicoApi.listarAniosEscolares).toHaveBeenCalledWith(
        { activo: 'true' },
        expect.anything(),
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /1ro · Mañana/ })).toBeInTheDocument();
    });

    await act(async () => {
      screen.getByRole('checkbox', { name: /1ro · Mañana/ }).click();
      screen.getByRole('checkbox', { name: /1ro · Tarde/ }).click();
    });

    expect(screen.getByRole('checkbox', { name: /1ro · Mañana/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /1ro · Tarde/ })).toBeChecked();
  });
});
