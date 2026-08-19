import { describe, expect, it, vi } from 'vitest';
import {
  procesarActa,
  type ActaPendiente,
  type ActasRepo,
  type RendererActa,
} from './actas.processor';

function crearRepoDoble(overrides: Partial<ActasRepo> = {}): ActasRepo {
  return {
    leer: vi.fn(),
    finalizar: vi.fn(),
    marcarFallido: vi.fn(),
    pendientes: vi.fn(),
    ...overrides,
  };
}

const actaBorrador: ActaPendiente = {
  id: 'acta-1',
  proceso_id: 'proceso-1',
  tipo: 'apertura',
  estado: 'borrador',
  contenido: { version: 1, tipo: 'apertura' },
};

describe('procesarActa', () => {
  it('acta inexistente ⇒ no-op sin renderizar [20.1]', async () => {
    const render = vi.fn();
    const renderer: RendererActa = { render };
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(null) });

    const resultado = await procesarActa(repo, renderer, 'acta-inexistente');

    expect(resultado).toBe('no-op');
    expect(render).not.toHaveBeenCalled();
    expect(repo.finalizar).not.toHaveBeenCalled();
  });

  it('acta en estado distinto de borrador ⇒ no-op sin renderizar [20.1]', async () => {
    const render = vi.fn();
    const renderer: RendererActa = { render };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue({ ...actaBorrador, estado: 'emitida' }),
    });

    const resultado = await procesarActa(repo, renderer, actaBorrador.id);

    expect(resultado).toBe('no-op');
    expect(render).not.toHaveBeenCalled();
    expect(repo.finalizar).not.toHaveBeenCalled();
  });

  it('render que rechaza ⇒ el error propaga (sin try/catch) y no se llama finalizar [20.2]', async () => {
    const render = vi.fn().mockRejectedValue(new Error('pdfkit explotó'));
    const renderer: RendererActa = { render };
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(actaBorrador) });

    await expect(procesarActa(repo, renderer, actaBorrador.id)).rejects.toThrow(
      'pdfkit explotó',
    );
    expect(repo.finalizar).not.toHaveBeenCalled();
    expect(repo.marcarFallido).not.toHaveBeenCalled();
  });

  it('camino feliz ⇒ render con contenido/tipo verbatim y repo.finalizar con el buffer', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const render = vi.fn().mockResolvedValue(buffer);
    const renderer: RendererActa = { render };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(actaBorrador),
      finalizar: vi.fn().mockResolvedValue('emitida'),
    });

    const resultado = await procesarActa(repo, renderer, actaBorrador.id);

    expect(resultado).toBe('emitida');
    expect(render).toHaveBeenCalledWith(actaBorrador.contenido, actaBorrador.tipo);
    expect(repo.finalizar).toHaveBeenCalledWith(actaBorrador.id, buffer);
  });

  it('finalizar que devuelve no-op (CAS perdido) no rompe el flujo [20.3]', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const render = vi.fn().mockResolvedValue(buffer);
    const renderer: RendererActa = { render };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(actaBorrador),
      finalizar: vi.fn().mockResolvedValue('no-op'),
    });

    const resultado = await procesarActa(repo, renderer, actaBorrador.id);

    expect(resultado).toBe('no-op');
  });

  it('nunca importa PrismaClient/bullmq en este módulo (D10)', async () => {
    const moduleSource = await import('./actas.processor');
    expect(Object.keys(moduleSource)).not.toContain('PrismaClient');
    expect(Object.keys(moduleSource)).not.toContain('Queue');
    expect(Object.keys(moduleSource)).not.toContain('Worker');
  });
});
