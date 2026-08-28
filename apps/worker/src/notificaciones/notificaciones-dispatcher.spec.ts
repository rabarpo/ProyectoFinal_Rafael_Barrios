import { describe, expect, it, vi } from 'vitest';
import { despacharLoteNotificaciones, type NotificacionesQueue } from './notificaciones-dispatcher';

/**
 * notificaciones (backlog #19), PR8 (design.md D7, tarea 20.2). Copia estructural de
 * `reportes-dispatcher.spec.ts`.
 */
describe('despacharLoteNotificaciones', () => {
  it('respeta el LIMIT pasado al repo y genera jobId determinista notificacion:<id> [20.2]', async () => {
    const pendientes = vi.fn().mockResolvedValue(['job-1', 'job-2']);
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue: NotificacionesQueue = { addBulk };

    const total = await despacharLoteNotificaciones({ pendientes }, queue, 20);

    expect(pendientes).toHaveBeenCalledWith(20);
    expect(total).toBe(2);
    expect(addBulk).toHaveBeenCalledTimes(1);
    const [lote] = addBulk.mock.calls[0] as [
      { name: string; data: { job_correo_id: string }; opts: Record<string, unknown> }[],
    ];
    expect(lote).toHaveLength(2);
    expect(lote[0]).toMatchObject({
      name: 'notificacion.correo',
      data: { job_correo_id: 'job-1' },
      opts: { jobId: 'notificacion:job-1', attempts: 5 },
    });
    expect(lote[1]).toMatchObject({
      name: 'notificacion.correo',
      data: { job_correo_id: 'job-2' },
      opts: { jobId: 'notificacion:job-2', attempts: 5 },
    });
    expect(lote[0].opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('lote vacío ⇒ no invoca addBulk [20.2]', async () => {
    const pendientes = vi.fn().mockResolvedValue([]);
    const addBulk = vi.fn();
    const queue: NotificacionesQueue = { addBulk };

    const total = await despacharLoteNotificaciones({ pendientes }, queue, 20);

    expect(total).toBe(0);
    expect(addBulk).not.toHaveBeenCalled();
  });
});
