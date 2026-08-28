import { describe, expect, it, vi } from 'vitest';
import { barrerNotificaciones, numeroPositivo, type SweepRepo } from './sweep-notificaciones';

const HORA_MS = 60 * 60 * 1000;
const UMBRALES = { recordatorioHoras: 24, cierreProximoHoras: 2 };
const AHORA = new Date('2026-08-28T12:00:00.000Z');

function procesoConRestante(id: string, horasRestantes: number) {
  return { id, fecha_cierre_prevista: new Date(AHORA.getTime() + horasRestantes * HORA_MS) };
}

function construirRepo(overrides: { procesosAbiertos?: SweepRepo['procesosAbiertos'] } = {}) {
  const procesosAbiertos = overrides.procesosAbiertos ?? vi.fn().mockResolvedValue([]);
  const emitirPendientes = vi.fn().mockResolvedValue(undefined);
  const repo: SweepRepo = { procesosAbiertos, emitirPendientes };
  return { repo, procesosAbiertos, emitirPendientes };
}

/**
 * notificaciones (backlog #19), PR9 (design.md D6/D12, tareas 25.1-25.5). `barrerNotificaciones`
 * es pura: `ahora` siempre inyectado, nunca `new Date()` adentro — mismo criterio que
 * `actas-contenido.ts` de `#17`.
 */
describe('barrerNotificaciones (design.md D6, tareas 25.1-25.4)', () => {
  // 25.1: restante justo por encima/por debajo de cada umbral.
  it.each([
    ['recordatorio', 24, true],
    ['recordatorio', 24.01, false],
    ['cierre_proximo', 2, true],
    ['cierre_proximo', 2.01, false],
  ] as const)('[25.1] evento=%s restante=%sh dentro del umbral=%s', async (evento, horas, dentro) => {
    const { repo, emitirPendientes } = construirRepo({
      procesosAbiertos: vi.fn().mockResolvedValue([procesoConRestante('proceso-1', horas)]),
    });

    await barrerNotificaciones(repo, UMBRALES, AHORA);

    if (dentro) {
      expect(emitirPendientes).toHaveBeenCalledWith('proceso-1', evento);
    } else {
      expect(emitirPendientes).not.toHaveBeenCalledWith('proceso-1', evento);
    }
  });

  // 25.2: proceso dentro de ambos umbrales ⇒ dos emisiones independientes.
  it('[25.2] proceso dentro de ambos umbrales emite recordatorio Y cierre_proximo, sin cancelarse', async () => {
    const { repo, emitirPendientes } = construirRepo({
      procesosAbiertos: vi.fn().mockResolvedValue([procesoConRestante('proceso-1', 1)]),
    });

    await barrerNotificaciones(repo, UMBRALES, AHORA);

    expect(emitirPendientes).toHaveBeenCalledWith('proceso-1', 'recordatorio');
    expect(emitirPendientes).toHaveBeenCalledWith('proceso-1', 'cierre_proximo');
    expect(emitirPendientes).toHaveBeenCalledTimes(2);
  });

  // 25.3: restante <= 0 ⇒ cero emisiones.
  it.each([0, -1])('[25.3] restante=%sh ⇒ cero emisiones', async (horas) => {
    const { repo, emitirPendientes } = construirRepo({
      procesosAbiertos: vi.fn().mockResolvedValue([procesoConRestante('proceso-1', horas)]),
    });

    await barrerNotificaciones(repo, UMBRALES, AHORA);

    expect(emitirPendientes).not.toHaveBeenCalled();
  });

  // 25.4: sin procesos abiertos ⇒ no llama al repo (emitirPendientes).
  it('[25.4] sin procesos abiertos ⇒ no invoca emitirPendientes', async () => {
    const { repo, emitirPendientes } = construirRepo();

    await barrerNotificaciones(repo, UMBRALES, AHORA);

    expect(emitirPendientes).not.toHaveBeenCalled();
  });
});

describe('numeroPositivo (design.md D12, tarea 25.5)', () => {
  it.each([undefined, 'abc', '0', '-5', 'NaN'])('[25.5] valor=%s cae al default', (valor) => {
    expect(numeroPositivo(valor, 24)).toBe(24);
  });

  it('[25.5] valor numérico positivo válido se respeta', () => {
    expect(numeroPositivo('48', 24)).toBe(48);
  });
});
