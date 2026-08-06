import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Sin `globals: true`: se registra el cleanup de RTL explícitamente en vez de
// depender de un `afterEach` global inyectado por el test runner. El import
// de '@testing-library/jest-dom/vitest' registra los matchers en `expect` de
// Vitest en runtime (ver también src/types/testing-library.d.ts para el
// augment de tipos usado por tsc).
afterEach(() => {
  cleanup();
});
