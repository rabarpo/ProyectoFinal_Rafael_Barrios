import { describe, expect, it, vi } from 'vitest';
import {
  procesarReporte,
  type ReportePendiente,
  type ReportesRepo,
  type RendererReporte,
} from './reportes.processor';
import type { ModeloReporte } from '../reportes/modelo-reporte';

function crearRepoDoble(overrides: Partial<ReportesRepo> = {}): ReportesRepo {
  return {
    leer: vi.fn(),
    finalizar: vi.fn(),
    marcarFallido: vi.fn(),
    pendientes: vi.fn(),
    ...overrides,
  };
}

const modeloConSensible: ModeloReporte = {
  version: 1,
  dimension: 'resultados',
  formato: 'pdf',
  titulo: 'Resultados',
  generado_en: '2026-08-01T00:00:00.000Z',
  meta: [],
  secciones: [
    { clave: 'desglose', titulo: 'Desglose', columnas: ['a'], filas: [['x']], sensible: true },
    { clave: 'resumen', titulo: 'Resumen', columnas: ['a'], filas: [['x']], sensible: false },
  ],
  notas: [],
};

function reportePendiente(overrides: Partial<ReportePendiente> = {}): ReportePendiente {
  return {
    id: 'reporte-1',
    proceso_id: 'proceso-1',
    dimension: 'resultados',
    formato: 'pdf',
    estado: 'borrador',
    contenido: modeloConSensible,
    ocultar_resultados: false,
    ...overrides,
  };
}

describe('procesarReporte', () => {
  it('fila inexistente ⇒ no-op sin renderizar [14.1]', async () => {
    const render = vi.fn();
    const renderers: Record<string, RendererReporte> = { pdf: { mime: 'application/pdf', extension: '.pdf', render } };
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(null) });

    const resultado = await procesarReporte(repo, renderers, 'reporte-inexistente');

    expect(resultado).toBe('no-op');
    expect(render).not.toHaveBeenCalled();
    expect(repo.finalizar).not.toHaveBeenCalled();
  });

  it('fila en estado distinto de borrador ⇒ no-op sin renderizar [14.1]', async () => {
    const render = vi.fn();
    const renderers: Record<string, RendererReporte> = { pdf: { mime: 'application/pdf', extension: '.pdf', render } };
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(reportePendiente({ estado: 'emitida' })) });

    const resultado = await procesarReporte(repo, renderers, 'reporte-1');

    expect(resultado).toBe('no-op');
    expect(render).not.toHaveBeenCalled();
    expect(repo.finalizar).not.toHaveBeenCalled();
  });

  it('gate releído ahora ⇒ poda todas las secciones sensibles antes de renderizar [14.2]', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const renderers: Record<string, RendererReporte> = { pdf: { mime: 'application/pdf', extension: '.pdf', render } };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(reportePendiente({ ocultar_resultados: true })),
      finalizar: vi.fn().mockResolvedValue('emitida'),
    });

    await procesarReporte(repo, renderers, 'reporte-1');

    const [modeloRenderizado] = render.mock.calls[0] as [ModeloReporte];
    expect(modeloRenderizado.secciones).toHaveLength(1);
    expect(modeloRenderizado.secciones[0].sensible).toBe(false);
    expect(repo.finalizar).toHaveBeenCalledWith(
      'reporte-1',
      expect.any(Buffer),
      'application/pdf',
      expect.any(String),
      true,
      1,
    );
  });

  it('gate=false ⇒ el modelo llega intacto al renderizador [14.3]', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const renderers: Record<string, RendererReporte> = { pdf: { mime: 'application/pdf', extension: '.pdf', render } };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(reportePendiente({ ocultar_resultados: false })),
      finalizar: vi.fn().mockResolvedValue('emitida'),
    });

    await procesarReporte(repo, renderers, 'reporte-1');

    const [modeloRenderizado] = render.mock.calls[0] as [ModeloReporte];
    expect(modeloRenderizado.secciones).toHaveLength(2);
    expect(repo.finalizar).toHaveBeenCalledWith(
      'reporte-1',
      expect.any(Buffer),
      'application/pdf',
      expect.any(String),
      false,
      2,
    );
  });

  it('render que rechaza ⇒ propaga (sin try/catch) y no se llama finalizar [14.4]', async () => {
    const render = vi.fn().mockRejectedValue(new Error('render explotó'));
    const renderers: Record<string, RendererReporte> = { pdf: { mime: 'application/pdf', extension: '.pdf', render } };
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(reportePendiente()) });

    await expect(procesarReporte(repo, renderers, 'reporte-1')).rejects.toThrow('render explotó');
    expect(repo.finalizar).not.toHaveBeenCalled();
    expect(repo.marcarFallido).not.toHaveBeenCalled();
  });

  it('finalizar que devuelve no-op (CAS perdido) no rompe el flujo [14.5]', async () => {
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-'));
    const renderers: Record<string, RendererReporte> = { pdf: { mime: 'application/pdf', extension: '.pdf', render } };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(reportePendiente()),
      finalizar: vi.fn().mockResolvedValue('no-op'),
    });

    const resultado = await procesarReporte(repo, renderers, 'reporte-1');

    expect(resultado).toBe('no-op');
  });

  it('formato sin renderizador registrado ⇒ lanza, nunca emite un archivo vacío [14.6]', async () => {
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(reportePendiente({ formato: 'csv' })) });

    await expect(procesarReporte(repo, {}, 'reporte-1')).rejects.toThrow();
    expect(repo.finalizar).not.toHaveBeenCalled();
  });

  it('nunca importa PrismaClient/bullmq en este módulo (D9)', async () => {
    const moduleSource = await import('./reportes.processor');
    expect(Object.keys(moduleSource)).not.toContain('PrismaClient');
    expect(Object.keys(moduleSource)).not.toContain('Queue');
    expect(Object.keys(moduleSource)).not.toContain('Worker');
  });
});
