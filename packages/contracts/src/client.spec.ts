import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSeeiClient } from './client';

describe('createSeeiClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('invoca GET /api/health contra la URL base configurada', async () => {
    const client = createSeeiClient('http://localhost:3000/api');

    await client.GET('/health', {});

    expect(fetch).toHaveBeenCalledTimes(1);
    const [requestArg] = vi.mocked(fetch).mock.calls[0];
    const request = requestArg as Request;
    expect(request.url).toBe('http://localhost:3000/api/health');
    expect(request.method).toBe('GET');
  });
});
