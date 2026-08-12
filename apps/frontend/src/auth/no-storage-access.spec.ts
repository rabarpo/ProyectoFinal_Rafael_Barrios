import { describe, expect, it } from 'vitest';

// [design.md D8, adversarial] La cookie `seei_session` es `httpOnly`: el JS
// no puede leerla, y cualquier espejo de la sesión en `localStorage`/
// `sessionStorage` puede desincronizarse de Redis (sesión revocada) y
// afirmar una sesión que ya no existe. `whoami()` es la ÚNICA fuente de
// verdad. Esta prueba estática recorre el código fuente real de `auth/`
// (excluyendo tests) y falla si aparece cualquiera de los tres patrones
// prohibidos. Se usa `import.meta.glob(..., { query: '?raw' })` (feature de
// Vite) en vez de `node:fs`: el tsconfig de este paquete no incluye tipos de
// Node (solo DOM — es código de navegador), así que `readFileSync` no
// typechequea acá.
const PATRONES_PROHIBIDOS = [/localStorage/, /sessionStorage/, /document\.cookie/];

const fuentes = import.meta.glob('./*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const archivosDeProduccion = Object.entries(fuentes).filter(
  ([ruta]) => !ruta.includes('.spec.'),
);

/**
 * Quita comentarios `//` y `/* *\/` antes de buscar: el objetivo es detectar
 * CÓDIGO que use estas APIs, no prosa explicativa que las mencione (varios
 * archivos de este módulo documentan la regla en un JSDoc, lo que produciría
 * falsos positivos si se buscara sobre el texto crudo).
 */
function sinComentarios(codigoFuente: string): string {
  return codigoFuente
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('auth/ no persiste la sesión en el cliente', () => {
  it('recorre al menos un archivo de producción (sanity check del propio test)', () => {
    expect(archivosDeProduccion.length).toBeGreaterThan(0);
  });

  it.each(archivosDeProduccion)(
    '%s no usa localStorage/sessionStorage/document.cookie',
    (ruta, contenidoCrudo) => {
      const contenido = sinComentarios(contenidoCrudo);
      for (const patron of PATRONES_PROHIBIDOS) {
        expect(contenido).not.toMatch(patron);
      }
    },
  );
});
