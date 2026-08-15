import { describe, expect, it, vi } from 'vitest';
import { despacharLoteOutbox, type OutboxQueue } from './outbox-dispatcher';

describe('despacharLoteOutbox', () => {
  it('respeta el LIMIT pasado al repo y genera jobId determinista jobcorreo:<id> [7.1]', async () => {
    const pendientes = vi.fn().mockResolvedValue(['id-1', 'id-2']);
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue: OutboxQueue = { addBulk };

    const total = await despacharLoteOutbox({ pendientes }, queue, 20);

    expect(pendientes).toHaveBeenCalledWith(20);
    expect(total).toBe(2);
    expect(addBulk).toHaveBeenCalledTimes(1);
    const [lote] = addBulk.mock.calls[0] as [
      { name: string; data: { job_correo_id: string }; opts: Record<string, unknown> }[],
    ];
    expect(lote).toHaveLength(2);
    expect(lote[0]).toMatchObject({
      name: 'correo.comprobante',
      data: { job_correo_id: 'id-1' },
      opts: { jobId: 'jobcorreo:id-1', attempts: 5 },
    });
    expect(lote[1]).toMatchObject({
      name: 'correo.comprobante',
      data: { job_correo_id: 'id-2' },
      opts: { jobId: 'jobcorreo:id-2', attempts: 5 },
    });
    expect(lote[0].opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('sin jobs pendientes ⇒ no invoca addBulk', async () => {
    const pendientes = vi.fn().mockResolvedValue([]);
    const addBulk = vi.fn();
    const queue: OutboxQueue = { addBulk };

    const total = await despacharLoteOutbox({ pendientes }, queue, 20);

    expect(total).toBe(0);
    expect(addBulk).not.toHaveBeenCalled();
  });
});
