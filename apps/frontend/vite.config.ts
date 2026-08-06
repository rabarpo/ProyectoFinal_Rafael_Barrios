import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Bloque `test` sin `globals: true` (convención del monorepo, ver design.md —
// "Coexistencia de Jest y Vitest"): los specs importan describe/it/expect/etc.
// explícitamente desde 'vitest'.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
  },
});
