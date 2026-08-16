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

// resultados-en-vivo (#16, PR4): primer consumidor de `recharts` bajo jsdom.
// `ResponsiveContainer` usa `ResizeObserver`, ausente en jsdom (design.md, gotcha
// documentado en "Estrategia de pruebas" — bajo jsdom mide 0×0 y no dibuja de
// todas formas; el polyfill sólo evita el `ReferenceError` al montar el efecto).
class ResizeObserverPolyfill {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverPolyfill as unknown as typeof ResizeObserver;
}
