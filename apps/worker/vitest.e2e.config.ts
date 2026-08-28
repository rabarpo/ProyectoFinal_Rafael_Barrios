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
    // notificaciones (#19, PR10). Todos los archivos e2e comparten el mismo Postgres real
    // (`infra/docker/docker-compose.test.yml`) — sin esto, Vitest corre archivos de prueba en
    // paralelo por defecto y `aislamiento-colas.e2e-spec.ts` (tarea 23.1, cuenta filas de TODA la
    // tabla `JobCorreo`) queda contaminado por inserciones concurrentes de `sweep.e2e-spec.ts`.
    fileParallelism: false,
  },
});
