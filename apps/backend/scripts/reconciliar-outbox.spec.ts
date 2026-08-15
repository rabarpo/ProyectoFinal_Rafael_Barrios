/**
 * outbox-correo-comprobante-autenticado (#15, PR5; design.md D13, tasks.md Phase 16).
 * `PrismaClient.$queryRaw` mockeado como `jest.fn()` — mismo criterio que
 * `votos.service.spec.ts` (#14/#15 PR1).
 */
import type { PrismaClient } from '@prisma/client';
import { buscarVotosSinJobCorreo, type VotoSinJobCorreo } from './reconciliar-outbox';

function construirPrisma(queryRaw: jest.Mock): PrismaClient {
  return { $queryRaw: queryRaw } as unknown as PrismaClient;
}

describe('buscarVotosSinJobCorreo', () => {
  it('devuelve [] cuando todo Voto tiene su JobCorreo (greenfield, threat: pérdida silenciosa del job)', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = construirPrisma(queryRaw);

    const filas = await buscarVotosSinJobCorreo(prisma);

    expect(filas).toEqual([]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reporta cada Voto sin JobCorreo asociado, sin filtrar ni transformar las filas', async () => {
    const filaHuerfana: VotoSinJobCorreo = {
      id: 'voto-1',
      proceso_id: 'proceso-1',
      codigo_comprobante: 'ABCD-1234',
      hora_servidor: new Date('2026-08-14T12:00:00.000Z'),
    };
    const queryRaw = jest.fn().mockResolvedValue([filaHuerfana]);
    const prisma = construirPrisma(queryRaw);

    const filas = await buscarVotosSinJobCorreo(prisma);

    expect(filas).toEqual([filaHuerfana]);
  });

  it('ejecuta exactamente un LEFT JOIN de sólo lectura — sin INSERT/UPDATE/DELETE en la sentencia (D13, threat: script de backfill que inserta)', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = construirPrisma(queryRaw);

    await buscarVotosSinJobCorreo(prisma);

    const [sqlFragments] = queryRaw.mock.calls[0] as [TemplateStringsArray];
    const sentenciaCompleta = sqlFragments.join('');
    expect(sentenciaCompleta).toMatch(/LEFT JOIN/i);
    expect(sentenciaCompleta).not.toMatch(/INSERT|UPDATE|DELETE/i);
  });
});
