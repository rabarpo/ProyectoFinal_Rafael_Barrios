import { describe, expect, it, vi } from 'vitest';
import { despacharLoteReportes, type ReportesQueue } from './reportes-dispatcher';

describe('despacharLoteReportes', () => {
  it('respeta el LIMIT pasado al repo y genera jobId determinista reporte:<id> [13.1]', async () => {
    const pendientes = vi.fn().mockResolvedValue(['reporte-1', 'reporte-2']);
    const addBulk = vi.fn().mockResolvedValue([]);
    const queue: ReportesQueue = { addBulk };

    const total = await despacharLoteReportes({ pendientes }, queue, 20);

    expect(pendientes).toHaveBeenCalledWith(20);
    expect(total).toBe(2);
    expect(addBulk).toHaveBeenCalledTimes(1);
    const [lote] = addBulk.mock.calls[0] as [
      { name: string; data: { reporte_id: string }; opts: Record<string, unknown> }[],
    ];
    expect(lote).toHaveLength(2);
    expect(lote[0]).toMatchObject({
      name: 'reporte.generar',
      data: { reporte_id: 'reporte-1' },
      opts: { jobId: 'reporte:reporte-1', attempts: 5 },
    });
    expect(lote[1]).toMatchObject({
      name: 'reporte.generar',
      data: { reporte_id: 'reporte-2' },
      opts: { jobId: 'reporte:reporte-2', attempts: 5 },
    });
    expect(lote[0].opts.backoff).toEqual({ type: 'exponential', delay: 2000 });
  });

  it('lote vacío ⇒ no invoca addBulk [13.2]', async () => {
    const pendientes = vi.fn().mockResolvedValue([]);
    const addBulk = vi.fn();
    const queue: ReportesQueue = { addBulk };

    const total = await despacharLoteReportes({ pendientes }, queue, 20);

    expect(total).toBe(0);
    expect(addBulk).not.toHaveBeenCalled();
  });
});
