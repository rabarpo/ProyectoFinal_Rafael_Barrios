import { describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryProvider } from './QueryProvider';
import * as queryClientModule from './query-client';

// [design.md D9; tasks.md 9.4] `QueryProvider` crea un `QueryClient` NUEVO cada vez que se
// remonta — no reutiliza un singleton de módulo. Esto es lo que permite que el `QueryClient`
// muera con la sesión al desmontarse `AuthGuard` (D9), sin cablear `queryClient.clear()` manual.
describe('QueryProvider', () => {
  it('renderiza a sus hijos', () => {
    render(
      <QueryProvider>
        <p>contenido</p>
      </QueryProvider>,
    );
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('crea un QueryClient nuevo cada vez que se remonta (no reutiliza un singleton de módulo)', () => {
    const spy = vi.spyOn(queryClientModule, 'crearQueryClient');

    const { unmount } = render(
      <QueryProvider>
        <p>uno</p>
      </QueryProvider>,
    );
    unmount();
    cleanup();

    render(
      <QueryProvider>
        <p>dos</p>
      </QueryProvider>,
    );

    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
});
