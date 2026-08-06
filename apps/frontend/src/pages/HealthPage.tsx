import { useEffect, useState } from 'react';
import { createSeeiClient } from '@seei/contracts/src/client';

/**
 * Espejo del contrato documentado en design.md ("Contratos e interfaces").
 *
 * Gotcha: el documento OpenAPI extraído por `apps/backend/src/openapi.ts`
 * decora `HealthController` solo con `@ApiResponse({ status, description })`
 * (sin `type`/`schema`), así que `packages/contracts/src/generated/api.d.ts`
 * tipa el body de la respuesta 200 como `content?: never` — el cliente
 * generado no expone el shape real. Corregir esa decoración es trabajo de
 * Fase 1 (backend), fuera del alcance de esta fase (Fase 3, frontend); acá
 * se declara el contrato localmente y se castea la respuesta, documentando
 * el motivo en vez de ampliar el alcance de este PR.
 */
interface EstadoDependencia {
  estado: 'ok' | 'error';
  latenciaMs: number;
}

interface RespuestaHealth {
  estado: 'ok' | 'degradado';
  db: EstadoDependencia;
  redis: EstadoDependencia;
  worker: { ultimoPing: string | null };
}

// El backend fija `setGlobalPrefix('api')` (apps/backend/src/main.ts), pero
// el documento OpenAPI extraído no lo incluye en sus rutas (design.md D1 /
// packages/contracts/src/client.ts). La base URL configurada acá SIEMPRE
// debe incluir "/api" — Caddy comparte origen entre frontend y backend
// (design.md, Caddyfile), así que el valor por defecto es una ruta relativa.
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

const client = createSeeiClient(BASE_URL);

export function HealthPage() {
  const [health, setHealth] = useState<RespuestaHealth | null>(null);
  const [huboError, setHuboError] = useState(false);

  useEffect(() => {
    let cancelado = false;

    client
      .GET('/health', {})
      .then(({ data, error }) => {
        if (cancelado) return;
        if (error || !data) {
          setHuboError(true);
          return;
        }
        setHealth(data as unknown as RespuestaHealth);
      })
      .catch(() => {
        if (!cancelado) setHuboError(true);
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (huboError) {
    return <p role="alert">No se pudo obtener el estado del sistema.</p>;
  }

  if (!health) {
    return <p>Cargando estado del sistema…</p>;
  }

  return (
    <div>
      <h1>Estado del sistema</h1>
      <p data-testid="db-estado">DB: {health.db.estado}</p>
      <p data-testid="redis-estado">Redis: {health.redis.estado}</p>
      <p data-testid="worker-ultimo-ping">
        Último ping del worker: {health.worker.ultimoPing ?? 'sin datos'}
      </p>
    </div>
  );
}
