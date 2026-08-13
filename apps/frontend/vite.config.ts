import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Bloque `test` sin `globals: true` (convención del monorepo, ver design.md —
// "Coexistencia de Jest y Vitest"): los specs importan describe/it/expect/etc.
// explícitamente desde 'vitest'.
//
// administracion-procesos-electorales, PR1 (design.md D10, tarea 1.6). `server.proxy` mantiene
// mono-origen en desarrollo: la cookie `seei_session` es `httpOnly, sameSite: 'lax'` y
// `createSeeiClient` no setea `credentials` (mismo default `same-origin` de `fetch`), así que
// `VITE_API_BASE_URL=http://localhost:3000/api` ni siquiera guardaría la cookie. El backend no
// habilita CORS a propósito (`src/main.ts`); el proxy evita tener que abrirlo con `credentials:
// true`, que debilitaría `sameSite: 'lax'` como única defensa CSRF (pregunta abierta desde #4).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
  },
});
