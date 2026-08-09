// administracion-academica, PR1 (design.md D1/D2, tarea 3.4). Traductor de errores de Prisma
// compartido por las seis entidades del módulo (D0): funciones puras, sin dependencia de
// `PrismaService` ni de ningún servicio de entidad — mismo criterio que `esP2002()`/
// `campoDesdeTarget()` de `users.service.ts` en `administracion-usuarios-apoderados`, adaptado a
// restricciones compuestas (`campos: string[]` en vez de un único campo, D5).

/** Discrimina un error de Prisma por su `code`, sin asumir ninguna base más allá de `unknown`. */
export function esP2002(error: unknown): error is { code: 'P2002'; meta?: { target?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

export function esP2003(
  error: unknown,
): error is { code: 'P2003'; meta?: { field_name?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}

/**
 * D2/D5: deriva la lista de columnas en conflicto desde `error.meta.target` de un `P2002`,
 * preservando el orden — a diferencia de `campoDesdeTarget()` de `#7` (un único campo), aquí las
 * restricciones pueden ser compuestas (`(nivel_id, nombre)`, `(grado_id, seccion_id,
 * anio_escolar_id)`, …), así que el body de `RESTRICCION_UNICA` lleva `campos: string[]` completo.
 * `target` no parseable (no es `string` ni arreglo) devuelve `[]` — nunca lanza.
 */
export function traducirRestriccion(target: unknown): string[] {
  if (Array.isArray(target)) {
    return target.map(String);
  }
  if (typeof target === 'string') {
    return [target];
  }
  return [];
}

/**
 * D1: distingue la colisión del índice único parcial de año activo
 * (`anio_escolar_activo_unico_idx`, `meta.target` reporta la columna `activo`) de la colisión del
 * `@unique nombre` — mismo precedente que `campoDesdeTarget()` de `#7`, pero como predicado
 * reutilizable por cualquier columna, no solo `dni`/`codigo`/`correo`.
 */
export function objetivoContiene(target: unknown, nombre: string): boolean {
  const columnas = traducirRestriccion(target);
  return columnas.some((c) => c.toLowerCase().includes(nombre.toLowerCase()));
}

/**
 * D2: deriva la relación en conflicto desde `error.meta.field_name` de un `P2003` residual —
 * best-effort porque su formato varía entre versiones de Prisma (puede llegar como
 * `"Grado_nivel_id_fkey (index)"` o simplemente `"Seccion_grado_id_fkey"`). Toma el primer
 * segmento antes del primer `_`, que en las convenciones de nombre de Prisma/Postgres coincide con
 * el nombre de la tabla que declara la FK. `field_name` no parseable devuelve `'desconocida'` en
 * vez de lanzar — ninguna violación de FK escapa como `500` por un `meta` que no se pudo leer
 * (design.md D2, "catch P2003 residual").
 *
 * Función adicional a las cuatro nombradas literalmente en la tarea 3.4 del design (`esP2002`,
 * `esP2003`, `traducirRestriccion`, `objetivoContiene`): necesaria para satisfacer la RED test de
 * la tarea 3.2 ("derivación de `relacion` desde `error.meta.field_name`") y reutilizada por el
 * `catch P2003` residual de las seis entidades (D2) — desviación declarada, DRY sobre una lógica
 * que de otro modo se repetiría seis veces.
 */
export function relacionDesdeFieldName(fieldName: unknown): string {
  if (typeof fieldName !== 'string' || fieldName.length === 0) {
    return 'desconocida';
  }
  const separador = fieldName.indexOf('_');
  const relacion = separador === -1 ? fieldName : fieldName.slice(0, separador);
  return relacion.length > 0 ? relacion : 'desconocida';
}
