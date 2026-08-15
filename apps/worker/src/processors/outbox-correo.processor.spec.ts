import { describe, expect, it, vi } from 'vitest';
import {
  procesarCorreoComprobante,
  type EmailSenderPuerto,
  type JobCorreoPendiente,
  type OutboxCorreoRepo,
} from './outbox-correo.processor';

function crearRepoDoble(overrides: Partial<OutboxCorreoRepo> = {}): OutboxCorreoRepo {
  return {
    leer: vi.fn(),
    reclamar: vi.fn(),
    marcarEnviado: vi.fn(),
    marcarFallido: vi.fn(),
    pendientes: vi.fn(),
    ...overrides,
  };
}

const jobPendiente: JobCorreoPendiente = {
  id: 'job-1',
  estado: 'pendiente',
  asunto: 'Comprobante de tu voto',
  cuerpo: 'cuerpo verbatim',
  destinatario: 'votante@example.com',
};

describe('procesarCorreoComprobante', () => {
  it('estado=enviado ⇒ no-op sin invocar sender.send [6.1]', async () => {
    const send = vi.fn();
    const sender: EmailSenderPuerto = { send };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue({ ...jobPendiente, estado: 'enviado' }),
    });

    const resultado = await procesarCorreoComprobante(repo, sender, jobPendiente.id);

    expect(resultado).toBe('no-op');
    expect(send).not.toHaveBeenCalled();
    expect(repo.reclamar).not.toHaveBeenCalled();
  });

  it('repo.reclamar() devuelve false ⇒ no-op sin send (CAS perdido) [6.2]', async () => {
    const send = vi.fn();
    const sender: EmailSenderPuerto = { send };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(jobPendiente),
      reclamar: vi.fn().mockResolvedValue(false),
    });

    const resultado = await procesarCorreoComprobante(repo, sender, jobPendiente.id);

    expect(resultado).toBe('no-op');
    expect(send).not.toHaveBeenCalled();
  });

  it('job inexistente ⇒ no-op sin send', async () => {
    const send = vi.fn();
    const sender: EmailSenderPuerto = { send };
    const repo = crearRepoDoble({ leer: vi.fn().mockResolvedValue(null) });

    const resultado = await procesarCorreoComprobante(repo, sender, 'id-inexistente');

    expect(resultado).toBe('no-op');
    expect(send).not.toHaveBeenCalled();
  });

  it('camino feliz ⇒ send con asunto/cuerpo verbatim y repo.marcarEnviado [6.3]', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const sender: EmailSenderPuerto = { send };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(jobPendiente),
      reclamar: vi.fn().mockResolvedValue(true),
    });

    const resultado = await procesarCorreoComprobante(repo, sender, jobPendiente.id);

    expect(resultado).toBe('enviado');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      jobPendiente.destinatario,
      jobPendiente.asunto,
      jobPendiente.cuerpo,
    );
    expect(repo.marcarEnviado).toHaveBeenCalledWith(jobPendiente.id);
  });

  it('send que lanza ⇒ el error propaga y NO se marca fallido (BullMQ reintenta, D7) [6.4]', async () => {
    const send = vi.fn().mockRejectedValue(new Error('SMTP caído'));
    const sender: EmailSenderPuerto = { send };
    const repo = crearRepoDoble({
      leer: vi.fn().mockResolvedValue(jobPendiente),
      reclamar: vi.fn().mockResolvedValue(true),
    });

    await expect(procesarCorreoComprobante(repo, sender, jobPendiente.id)).rejects.toThrow(
      'SMTP caído',
    );
    expect(repo.marcarFallido).not.toHaveBeenCalled();
    expect(repo.marcarEnviado).not.toHaveBeenCalled();
  });

  it('nunca importa PrismaClient/prisma en este módulo (D8)', async () => {
    const moduleSource = await import('./outbox-correo.processor');
    expect(Object.keys(moduleSource)).not.toContain('PrismaClient');
    expect(Object.keys(moduleSource)).not.toContain('prisma');
  });
});
