import { describe, expect, it, vi } from 'vitest';
import { crearListenerReportesFallido, type JobFallido } from './reportes-fallido-listener';
import type { ReportesRepo } from '../processors/reportes.processor';

describe('crearListenerReportesFallido', () => {
  it('attemptsMade >= attempts ⇒ marca fallido [20.2]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<ReportesRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerReportesFallido(repo);

    const job: JobFallido = { data: { reporte_id: 'reporte-1' }, attemptsMade: 5, opts: { attempts: 5 } };
    listener(job, new Error('render falló'));

    expect(marcarFallido).toHaveBeenCalledWith('reporte-1');
  });

  it('attemptsMade < attempts ⇒ no marca fallido [20.2]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<ReportesRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerReportesFallido(repo);

    const job: JobFallido = { data: { reporte_id: 'reporte-1' }, attemptsMade: 2, opts: { attempts: 5 } };
    listener(job, new Error('render falló'));

    expect(marcarFallido).not.toHaveBeenCalled();
  });

  it('sin job (undefined) ⇒ no lanza ni marca fallido', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<ReportesRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerReportesFallido(repo);

    expect(() => listener(undefined, new Error('sin job'))).not.toThrow();
    expect(marcarFallido).not.toHaveBeenCalled();
  });
});
