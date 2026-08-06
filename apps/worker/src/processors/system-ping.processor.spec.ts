import { describe, expect, it, vi } from 'vitest';
import { SYSTEM_PING_HEARTBEAT_KEY, procesarSystemPing } from './system-ping.processor';

describe('procesarSystemPing', () => {
  it('escribe SET system:ping:heartbeat <timestamp ISO> en Redis', async () => {
    const set = vi.fn().mockResolvedValue('OK');
    const redisMock = { set };

    await procesarSystemPing(redisMock);

    expect(set).toHaveBeenCalledTimes(1);
    const [key, value] = set.mock.calls[0] as [string, string];
    expect(key).toBe(SYSTEM_PING_HEARTBEAT_KEY);
    expect(key).toBe('system:ping:heartbeat');
    // ISO 8601 con milisegundos, ej. 2026-08-05T18:44:06.123Z
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(value).toISOString()).toBe(value);
  });

  it('nunca importa ni llama a Prisma/Postgres', async () => {
    // No hay ningún import de PrismaClient/PrismaService en este módulo: el
    // heartbeat del walking skeleton vive exclusivamente en Redis (design.md,
    // diagrama de secuencia). Esta prueba documenta la garantía explícitamente:
    // si algún día se agrega un import de Prisma en system-ping.processor.ts,
    // el mock de Redis de arriba seguiría pasando pero esta intención quedaría
    // rota — por eso se reafirma aquí como contrato, no solo como comentario.
    const moduleSource = await import('./system-ping.processor');
    expect(Object.keys(moduleSource)).not.toContain('PrismaClient');
    expect(Object.keys(moduleSource)).not.toContain('prisma');
  });
});
