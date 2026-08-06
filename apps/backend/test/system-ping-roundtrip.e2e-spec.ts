import 'reflect-metadata';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import type { RespuestaHealth } from '../src/health/health.controller';

/**
 * [R5] Cierre del walking skeleton: verifica el ida y vuelta completo
 * backend → Redis (BullMQ) → worker → Redis → `GET /health`, con los tres
 * procesos corriendo de verdad (no mocks). Requiere Redis accesible en
 * `REDIS_URL` — provisto por `infra/docker/docker-compose.test.yml`
 * (ver `apps/backend/scripts/test-e2e.mjs`, que ya lo levanta antes de Jest).
 *
 * El worker real (`apps/worker`) se levanta como proceso hijo apuntando al
 * mismo Redis efímero, en vez de importar su código desde el paquete del
 * backend — mantiene la separación de procesos del diseño real (design.md,
 * "Diagrama de secuencia del walking skeleton") en vez de simular el
 * comportamiento del worker in-process.
 */
describe('Ida y vuelta system.ping — backend + worker + Redis reales [R5]', () => {
  const repoRoot = path.resolve(__dirname, '../../..');

  let app: INestApplication;
  let baseUrl: string;
  let workerProcess: ChildProcess | undefined;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;

    workerProcess = spawn('pnpm', ['--filter', '@seei/worker', 'start'], {
      cwd: repoRoot,
      env: process.env,
      shell: process.platform === 'win32',
      stdio: 'pipe',
    });
  }, 30_000);

  afterAll(async () => {
    // `spawn(..., { shell: true })` en Windows envuelve el proceso en `cmd.exe`;
    // `child.kill()` a secas mata solo ese envoltorio, no el `node`/`tsx` real
    // que corre el worker debajo. `taskkill /t` mata el árbol completo.
    if (workerProcess?.pid) {
      if (process.platform === 'win32') {
        try {
          execFileSync('taskkill', ['/pid', String(workerProcess.pid), '/t', '/f'], { stdio: 'ignore' });
        } catch {
          // El proceso ya pudo haber terminado — no es un fallo del test.
        }
      } else {
        workerProcess.kill();
      }
    }
    await app.close();
  });

  it('POST /api/system/ping encola el job y GET /api/health refleja worker.ultimoPing dentro del timeout', async () => {
    const antesDeEncolar = new Date();

    const respuestaPing = await fetch(`${baseUrl}/api/system/ping`, { method: 'POST' });
    expect(respuestaPing.status).toBe(202);

    const timeoutMs = 15_000;
    const intervaloMs = 250;
    const limite = Date.now() + timeoutMs;

    let ultimoPing: string | null = null;
    while (Date.now() < limite) {
      const respuestaHealth = await fetch(`${baseUrl}/api/health`);
      const cuerpo = (await respuestaHealth.json()) as RespuestaHealth;
      ultimoPing = cuerpo.worker.ultimoPing;
      if (ultimoPing !== null && new Date(ultimoPing) >= antesDeEncolar) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, intervaloMs));
    }

    expect(ultimoPing).not.toBeNull();
    expect(new Date(ultimoPing as string).getTime()).toBeGreaterThanOrEqual(antesDeEncolar.getTime());
  }, 20_000);
});
