/**
 * dashboard-panel-jornada (Backlog #20, PR1; design.md "Umbral de rezago"/"Caché", tarea 1.6).
 * Constantes puras del panel, sin `ioredis`. Idioma de envs de `RESULTADOS_CACHE_TTL_SECONDS`.
 */

// D7: umbral relativo en puntos porcentuales (no absoluto). Evaluado siempre en el servidor.
export const UMBRAL_REZAGO_PP = Number(process.env.PANEL_JORNADA_UMBRAL_REZAGO_PP ?? 15);

// D5: TTLs distintos por agregación, no por endpoint. `_RESUMEN_` alineado con
// `RESULTADOS_CACHE_TTL_SECONDS` (8 s, punto medio del rango 5-10 s de ADR-0005).
export const TTL_PANEL_INSTITUCION_SEGUNDOS = Number(process.env.PANEL_JORNADA_TTL_INSTITUCION_SECONDS ?? 300);
export const TTL_PANEL_RESUMEN_SEGUNDOS = Number(process.env.PANEL_JORNADA_TTL_RESUMEN_SECONDS ?? 8);
export const TTL_PANEL_VOTOS_HORA_SEGUNDOS = Number(process.env.PANEL_JORNADA_TTL_VOTOS_HORA_SECONDS ?? 60);
export const TTL_PANEL_AVANCE_AULAS_SEGUNDOS = Number(process.env.PANEL_JORNADA_TTL_AVANCE_AULAS_SECONDS ?? 30);
