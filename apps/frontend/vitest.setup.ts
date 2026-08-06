import { afterEach, expect } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';

// Sin `globals: true`: se registran matchers de jest-dom y el cleanup de RTL
// explícitamente en vez de depender de globals inyectados por el test runner.
expect.extend(matchers);

afterEach(() => {
  cleanup();
});
