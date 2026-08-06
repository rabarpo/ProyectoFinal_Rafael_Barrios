// Augmenta el tipo `Assertion` de Vitest con los matchers de jest-dom
// (toHaveTextContent, etc.) para `tsc --noEmit`. El registro en runtime ocurre
// en vitest.setup.ts, que importa el mismo módulo.
import '@testing-library/jest-dom/vitest';
