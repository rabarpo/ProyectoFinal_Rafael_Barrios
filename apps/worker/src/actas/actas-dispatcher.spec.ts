import { describe, expect, it, vi } from 'vitest';
import { despacharLoteActas, type ActasQueue } from './actas-dispatcher';

describe('despacharLoteActas', () => {
  it('respeta el LIMIT pasado al repo y genera jobId determinista acta:<id> [19.1]', async () => {
    const pendientes = vi.fn().mockResolvedValue(['acta-1', 'acta-2']);
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue: ActasQueue = { addBulk };

    const total = await despacharLoteActas({ pendientes }, queue, 20);

    expect(pendientes).toHaveBeenCalledWith(20);
    expect(total).toBe(2);
    expect(addBulk).toHaveBeenCalledTimes(1);
    const [lote] = addBulk.mock.calls[0] as [
      { name: string; data: { acta_id: string }; opts: Record<string, unknown> }[],
    ];
    expect(lote).toHaveLength(2);
    expect(lote[0]).toMatchObject({
      name: 'acta.pdf',
      data: { acta_id: 'acta-1' },
      opts: { jobId: 'acta:acta-1', attempts: 5 },
    });
    expect(lote[1]).toMatchObject({
      name: 'acta.pdf',
      data: { acta_id: 'acta-2' },
      opts: { jobId: 'acta:acta-2', attempts: 5 },
    });
    expect(lote[0].opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('lote vacío ⇒ no invoca addBulk [19.2]', async () => {
    const pendientes = vi.fn().mockResolvedValue([]);
    const addBulk = vi.fn();
    const queue: ActasQueue = { addBulk };

    const total = await despacharLoteActas({ pendientes }, queue, 20);

    expect(total).toBe(0);
    expect(addBulk).not.toHaveBeenCalled();
  });
});
