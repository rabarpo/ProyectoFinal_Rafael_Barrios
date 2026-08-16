import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { crearQueryClient } from './query-client';

interface QueryProviderProps {
  children: ReactNode;
}

/**
 * resultados-en-vivo (#16, PR2; design.md D9, tasks.md 9.5). `useState(crearQueryClient)` — no un
 * singleton de módulo — para que un `QueryClient` nuevo nazca cada vez que este componente se
 * monta. Se monta DENTRO de `AuthGuard` (`App.tsx`): al cerrar sesión, `AuthGuard` desmonta este
 * subárbol y el `QueryClient` (y su caché de consultas) se descarta con él, sin
 * `queryClient.clear()` manual — la misma disciplina de "la sesión, no la URL, decide" que ya
 * rige el enrutador (`#12` D11).
 */
export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(crearQueryClient);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
