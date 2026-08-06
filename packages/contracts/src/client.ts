import createClient from 'openapi-fetch';
import type { paths } from './generated/api';

/**
 * Cliente delgado tipado sobre el contrato OpenAPI generado (`src/generated/api.d.ts`).
 * `baseUrl` debe incluir el prefijo global `/api` del backend (`app.setGlobalPrefix('api')`,
 * ver `apps/backend/src/main.ts`), ya que el documento OpenAPI extraído (design.md D1) no lo
 * incluye en sus rutas: `GET /health` en el contrato se convierte en `GET {baseUrl}/health`.
 *
 * Consumidores: `apps/frontend` (página de health) y los tests e2e de `apps/backend`
 * (design.md — sección "Transformación").
 */
export function createSeeiClient(baseUrl: string) {
  return createClient<paths>({ baseUrl });
}
