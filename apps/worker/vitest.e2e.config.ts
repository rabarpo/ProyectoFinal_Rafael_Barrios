import { defineConfig } from 'vitest/config';

/**
 * cierre-escrutinio-actas (#17, PR5; design.md D11/D15). Desviación declarada: el design no fija
 * el runner del e2e del worker (sólo la ruta `test/procesos/actas-transicion.e2e-spec.ts`, patrón
 * de `test/schema/` del backend). El worker ya usa Vitest para sus pruebas unitarias
 * (`vitest.config.ts`, `src/**\/*.spec.ts`) — este config espejo corre contra Postgres real, sin
 * mocks, con un timeout mayor por la prueba de carrera real de 22.4 (dos conexiones concurrentes).
 */
export default defineConfig({
  test: {
    include: ['test/**/*.e2e-spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
