import { describe, expect, it, vi } from 'vitest';
import { crearListenerNotificacionesFallido, type JobFallido } from './notificaciones-fallido-listener';
import type { OutboxCorreoRepo } from '../processors/outbox-correo.processor';

/**
 * notificaciones (backlog #19), PR8 (design.md D7, tarea 21.1). Espejo de
 * `crearListenerActasFallido`/`crearListenerReportesFallido`: `estado='fallido'` lo escribe SÓLO
 * este listener cuando la cola agota los reintentos — nunca el processor (`procesarCorreoComprobante`
 * se reusa tal cual, D7).
 */
describe('crearListenerNotificacionesFallido', () => {
  it('attemptsMade >= attempts ⇒ marca fallido [21.1]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<OutboxCorreoRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerNotificacionesFallido(repo);

    const job: JobFallido = { data: { job_correo_id: 'job-1' }, attemptsMade: 5, opts: { attempts: 5 } };
    listener(job, new Error('envío falló'));

    expect(marcarFallido).toHaveBeenCalledWith('job-1');
  });

  it('attemptsMade < attempts ⇒ no marca fallido [21.1]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<OutboxCorreoRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerNotificacionesFallido(repo);

    const job: JobFallido = { data: { job_correo_id: 'job-1' }, attemptsMade: 2, opts: { attempts: 5 } };
    listener(job, new Error('envío falló'));

    expect(marcarFallido).not.toHaveBeenCalled();
  });

  it('sin job (undefined) ⇒ no lanza ni marca fallido [21.1]', () => {
    const marcarFallido = vi.fn();
    const repo: Pick<OutboxCorreoRepo, 'marcarFallido'> = { marcarFallido };
    const listener = crearListenerNotificacionesFallido(repo);

    expect(() => listener(undefined, new Error('sin job'))).not.toThrow();
    expect(marcarFallido).not.toHaveBeenCalled();
  });
});
