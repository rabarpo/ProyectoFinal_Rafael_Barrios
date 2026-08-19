import { describe, expect, it, vi } from 'vitest';
import { crearListenerActasFallido, type JobFallido } from './actas-fallido-listener';
import type { ActasRepo } from '../processors/actas.processor';

describe('crearListenerActasFallido', () => {
  it('attemptsMade >= attempts ⇒ marca fallido [23.2]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<ActasRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerActasFallido(repo);

    const job: JobFallido = { data: { acta_id: 'acta-1' }, attemptsMade: 5, opts: { attempts: 5 } };
    listener(job, new Error('render falló'));

    expect(marcarFallido).toHaveBeenCalledWith('acta-1');
  });

  it('attemptsMade < attempts ⇒ no marca fallido [23.2]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<ActasRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerActasFallido(repo);

    const job: JobFallido = { data: { acta_id: 'acta-1' }, attemptsMade: 2, opts: { attempts: 5 } };
    listener(job, new Error('render falló'));

    expect(marcarFallido).not.toHaveBeenCalled();
  });

  it('sin job (undefined) ⇒ no lanza ni marca fallido', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<ActasRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerActasFallido(repo);

    expect(() => listener(undefined, new Error('sin job'))).not.toThrow();
    expect(marcarFallido).not.toHaveBeenCalled();
  });
});
