import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { HealthPage } from './HealthPage';

// [R4c] La página MUST renderizar el estado devuelto por el cliente generado
// (packages/contracts/src/client.ts), no un valor hardcodeado en el frontend.
// Se mockea el módulo del cliente para controlar la respuesta y se usan
// valores mixtos (db en error, redis en ok) para que un hardcodeo trivial
// (p. ej. mostrar siempre 'ok') haga fallar este test.
vi.mock('@seei/contracts/src/client', () => ({
  createSeeiClient: () => ({
    GET: vi.fn(async () => ({
      data: {
        estado: 'degradado',
        db: { estado: 'error', latenciaMs: 12 },
        redis: { estado: 'ok', latenciaMs: 3 },
        worker: { ultimoPing: null },
      },
      error: undefined,
      response: new Response(),
    })),
  }),
}));

describe('HealthPage', () => {
  it('renderiza el db.estado y redis.estado devueltos por el cliente generado', async () => {
    render(<HealthPage />);

    await waitFor(() => {
      expect(screen.getByTestId('db-estado')).toHaveTextContent('error');
    });
    expect(screen.getByTestId('redis-estado')).toHaveTextContent('ok');
  });
});
