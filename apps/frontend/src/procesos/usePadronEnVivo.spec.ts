import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { usePadronEnVivo } from './usePadronEnVivo';
import * as procesosApi from './procesos-api';
import type { PadronRespuestaDto } from './procesos-api';
import type { Segmentacion } from './wizard-reducer';

// [design.md D7, "Carrera de conteos"]: cada petición lleva un número de
// secuencia y se aborta la anterior; toda respuesta que no sea la última
// emitida se descarta, aunque llegue después de una más reciente.
vi.mock('./procesos-api', () => ({ padron: vi.fn() }));

function segmentacion(overrides: Partial<Segmentacion> = {}): Segmentacion {
  return {
    publico_objetivo: 'estudiantes',
    alcance: 'institucion',
    nivel_id: undefined,
    grado_ids: [],
    aula_ids: [],
    ...overrides,
  };
}

function respuesta(derechos_totales: number): { data: PadronRespuestaDto; response: Response } {
  return {
    data: {
      derechos_totales,
      estudiantes: derechos_totales,
      padres: 0,
      cuentas_distintas: derechos_totales,
      aulas: [],
      aulas_excluidas: [],
    },
    response: { ok: true } as Response,
  };
}

async function avanzarDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('usePadronEnVivo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(procesosApi.padron).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('respuesta fuera de orden no pisa el conteo vigente', async () => {
    let resolverLenta!: (valor: ReturnType<typeof respuesta>) => void;
    const promesaLenta = new Promise<ReturnType<typeof respuesta>>((resolve) => {
      resolverLenta = resolve;
    });
    const promesaRapida = Promise.resolve(respuesta(2));

    vi.mocked(procesosApi.padron)
      .mockImplementationOnce(() => promesaLenta as never)
      .mockImplementationOnce(() => promesaRapida as never);

    const { result, rerender } = renderHook(({ seg }) => usePadronEnVivo(seg), {
      initialProps: { seg: segmentacion({ alcance: 'institucion' }) },
    });

    await avanzarDebounce(); // dispara la petición lenta (primera)

    rerender({ seg: segmentacion({ alcance: 'nivel', nivel_id: 'nivel-1' }) });
    await avanzarDebounce(); // dispara la petición rápida (segunda, ya resuelta)

    expect(result.current.datos?.derechos_totales).toBe(2);

    // La respuesta lenta (primera petición) llega tarde: no debe pisar el
    // conteo vigente que dejó la segunda.
    await act(async () => {
      resolverLenta(respuesta(1));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.datos?.derechos_totales).toBe(2);
  });

  it('petición previa se aborta al cambiar la segmentación', async () => {
    vi.mocked(procesosApi.padron).mockImplementation(() => new Promise(() => {}) as never);

    const { rerender } = renderHook(({ seg }) => usePadronEnVivo(seg), {
      initialProps: { seg: segmentacion({ alcance: 'institucion' }) },
    });

    await avanzarDebounce();

    const primeraLlamada = vi.mocked(procesosApi.padron).mock.calls[0];
    const primeraSignal = primeraLlamada[1] as AbortSignal;
    expect(primeraSignal.aborted).toBe(false);

    rerender({ seg: segmentacion({ alcance: 'nivel', nivel_id: 'nivel-1' }) });
    await avanzarDebounce();

    expect(primeraSignal.aborted).toBe(true);
  });
});
