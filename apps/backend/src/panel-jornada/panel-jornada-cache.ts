/**
 * dashboard-panel-jornada (Backlog #20, PR1; design.md "Caché", tarea 1.6). Copia parametrizada de
 * `resultados-cache.ts`: envoltorio `{ clave_scope, payload }` con autocomprobación
 * anticontaminación (threat: Contaminación cruzada de caché). JSON corrupto, clave ajena o error de
 * Redis (este último lo maneja el llamador, aquí sólo se degrada el parseo) ⇒ MISS, nunca 500.
 *
 * A diferencia de `resultados-cache.ts` (una sola clave por `procesoId`), acá la clave de scope no
 * siempre lleva id: `panel:institucion` es institucional (D2), el resto son `panel:{scope}:{id}`.
 * Prefijo `panel:` disjunto de `resultados:`/`session:`/`recovery:`.
 */
export function clavePanel(scope: string, id?: string): string {
  return id === undefined ? `panel:${scope}` : `panel:${scope}:${id}`;
}

interface EnvoltorioPanel<T> {
  clave_scope: string;
  payload: T;
}

export function serializar<T>(claveScope: string, payload: T): string {
  const envoltorio: EnvoltorioPanel<T> = { clave_scope: claveScope, payload };
  return JSON.stringify(envoltorio);
}

/**
 * `null` en cualquiera de estos tres casos, todos tratados como MISS por el llamador: sin valor en
 * caché, JSON corrupto, o envoltorio de una `clave_scope` distinta (threat: contaminación cruzada
 * de caché).
 */
export function deserializar<T>(claveScope: string, crudo: string | null): T | null {
  if (crudo === null) {
    return null;
  }

  let envoltorio: EnvoltorioPanel<T>;
  try {
    envoltorio = JSON.parse(crudo) as EnvoltorioPanel<T>;
  } catch {
    return null;
  }

  if (!envoltorio || envoltorio.clave_scope !== claveScope) {
    return null;
  }

  return envoltorio.payload;
}
