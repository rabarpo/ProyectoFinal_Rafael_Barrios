import type { ResultadosRespuestaDto } from './dto/resultados-respuesta.dto';

/**
 * resultados-en-vivo (#16, PR1; design.md D7, tareas 2.1-2.6). PURO, sin `ioredis`: se prueba en
 * Jest sin Redis. TTL por defecto 8 s (punto medio del rango 5-10 s de ADR-0005), mismo idioma de
 * env que `SESSION_TTL_SECONDS`/`RECOVERY_TTL_SECONDS`.
 */
export const TTL_RESULTADOS_SEGUNDOS = Number(process.env.RESULTADOS_CACHE_TTL_SECONDS ?? 8);

/** Prefijo `resultados:` disjunto de `session:`/`session:user:`/`recovery:`/bloqueo/importación. */
export function claveResultados(procesoId: string): string {
  return `resultados:${procesoId}`;
}

/**
 * Envoltorio interno de Redis: `proceso_id` NUNCA se serializa al cliente HTTP (no está en
 * `ResultadosRespuestaDto`). Su única función es la autocomprobación anticontaminación de D7 — un
 * error de derivación de clave se degrada a MISS (recalcular), nunca a fuga cruzada.
 */
export interface EnvoltorioResultados {
  proceso_id: string;
  payload: ResultadosRespuestaDto;
}

export function serializar(procesoId: string, payload: ResultadosRespuestaDto): string {
  const envoltorio: EnvoltorioResultados = { proceso_id: procesoId, payload };
  return JSON.stringify(envoltorio);
}

/**
 * `null` en cualquiera de estos tres casos, todos tratados como MISS por el llamador: sin valor en
 * caché, JSON corrupto, o envoltorio de un `proceso_id` distinto (D7, threat: contaminación
 * cruzada de caché).
 */
export function deserializar(procesoId: string, crudo: string | null): ResultadosRespuestaDto | null {
  if (crudo === null) {
    return null;
  }

  let envoltorio: EnvoltorioResultados;
  try {
    envoltorio = JSON.parse(crudo) as EnvoltorioResultados;
  } catch {
    return null;
  }

  if (!envoltorio || envoltorio.proceso_id !== procesoId) {
    return null;
  }

  return envoltorio.payload;
}
