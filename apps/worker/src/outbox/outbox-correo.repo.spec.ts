import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaOutboxCorreoRepo } from './outbox-correo.repo';

/**
 * notificaciones (backlog #19), PR7 (design.md D3, tarea 18.1, corrige C5). Unit test con
 * `PrismaClient` mockeado (spy sobre `findMany`), sin Postgres. Antes de este fix, `pendientes()`
 * de la cola `correo` filtraba solo por `estado:'pendiente'`, así que un `JobCorreo` de
 * `origen='notificacion'` (encolado por `emitirNotificaciones`, `#19` PR3) también salía por la
 * cola de comprobantes — dos workers podían disputarse el mismo job. El fix agrega
 * `origen:'comprobante'` al `where`.
 */
describe('PrismaOutboxCorreoRepo.pendientes() (design.md D3, tarea 18.1, corrige C5)', () => {
  it('[18.1] filtra por origen=comprobante además de estado=pendiente', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { jobCorreo: { findMany } } as unknown as PrismaClient;
    const repo = new PrismaOutboxCorreoRepo(prisma);

    await repo.pendientes(10);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estado: 'pendiente', origen: 'comprobante' },
      }),
    );
  });
});
