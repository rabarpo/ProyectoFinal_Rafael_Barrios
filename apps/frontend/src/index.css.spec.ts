/// <reference types="node" />
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// [design.md D2/D3, sistema-diseno-visual PR1, tareas 1.3-1.4] `src/index.css` es la única
// traducción de `DESIGN-SYSTEM.md` a tokens de Tailwind v4 (`@theme`) y la única fuente de la
// tipografía self-hosted (`@font-face`). Este archivo usa `node:fs`/`node:path` (design.md,
// "Estrategia de pruebas": "Vitest lee el archivo con readFileSync") en vez del patrón
// `import.meta.glob(..., { query: '?raw' })` de `auth/no-storage-access.spec.ts`: con
// `@tailwindcss/vite` activo en el pipeline, un `?raw` sobre un `.css` devuelve contenido vacío
// (el plugin intercepta la transformación de `.css` antes que el raw-loader de Vite). La
// referencia `/// <reference types="node" />` habilita los tipos de Node SOLO en este archivo de
// test, sin tocar el `tsconfig.json` de la app (que a propósito no declara `types: ["node"]`
// porque es código de navegador) ni instalar nada en runtime — `@types/node` es una devDependency
// de solo-tipos, igual que en `apps/backend`/`apps/worker`/`packages/contracts`. Desviación
// documentada en apply-progress.
const directorioActual = dirname(fileURLToPath(import.meta.url));
const rutaIndexCss = join(directorioActual, 'index.css');
const contenidoIndexCss = existsSync(rutaIndexCss) ? readFileSync(rutaIndexCss, 'utf-8') : '';

const rutaIndexHtml = join(directorioActual, '..', 'index.html');
const contenidoIndexHtml = existsSync(rutaIndexHtml) ? readFileSync(rutaIndexHtml, 'utf-8') : '';

function listarArchivosFuenteRecursivo(directorio: string): string[] {
  if (!existsSync(directorio)) return [];
  const entradas = readdirSync(directorio, { withFileTypes: true });
  return entradas.flatMap((entrada) => {
    const rutaCompleta = join(directorio, entrada.name);
    if (entrada.isDirectory()) return listarArchivosFuenteRecursivo(rutaCompleta);
    if (!/\.(ts|tsx|css)$/.test(entrada.name)) return [];
    if (entrada.name.includes('.spec.')) return [];
    return [rutaCompleta];
  });
}

const archivosProduccionSrc = listarArchivosFuenteRecursivo(directorioActual).map(
  (ruta) => [ruta, readFileSync(ruta, 'utf-8')] as const,
);

describe('src/index.css declara los tokens del design system (@theme)', () => {
  it('existe con contenido', () => {
    expect(contenidoIndexCss.length).toBeGreaterThan(0);
  });

  it('--color-primary resuelve a #000066 (institution-blue)', () => {
    expect(contenidoIndexCss).toMatch(/--color-primary:\s*#000066/);
  });

  it.each([
    '--text-display-lg',
    '--text-headline-lg',
    '--text-title-md',
    '--text-body-lg',
    '--text-body-md',
    '--text-label-md',
    '--text-caption',
  ])('declara la variante tipográfica %s', (variante) => {
    expect(contenidoIndexCss).toMatch(new RegExp(`${variante}:\\s*\\d`));
  });

  it('--shadow-elevation contiene "0 4px 20px"', () => {
    expect(contenidoIndexCss).toMatch(/--shadow-elevation:[^;]*0 4px 20px/);
  });

  it("--font-sans empieza por 'Hanken Grotesk'", () => {
    expect(contenidoIndexCss).toMatch(/--font-sans:\s*'Hanken Grotesk'/);
  });
});

describe('Hanken Grotesk es self-hosted, cero CDN externo (adversarial)', () => {
  const PATRONES_PROHIBIDOS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /@import url\(http/];

  it('recorre al menos un archivo de producción de src/ (sanity check del propio test)', () => {
    expect(archivosProduccionSrc.length).toBeGreaterThan(0);
  });

  it.each(archivosProduccionSrc)('%s no referencia un CDN de fuentes externo', (_ruta, contenido) => {
    for (const patron of PATRONES_PROHIBIDOS) {
      expect(contenido).not.toMatch(patron);
    }
  });

  it('index.html no referencia un CDN de fuentes externo', () => {
    expect(contenidoIndexHtml.length).toBeGreaterThan(0);
    for (const patron of PATRONES_PROHIBIDOS) {
      expect(contenidoIndexHtml).not.toMatch(patron);
    }
  });

  it('el @font-face apunta a una ruta relativa ./assets/fonts/', () => {
    expect(contenidoIndexCss).toMatch(/@font-face/);
    expect(contenidoIndexCss).toMatch(/url\(['"]?\.\/assets\/fonts\//);
  });

  it('el .woff2 referenciado existe en disco', () => {
    const rutaWoff2 = join(directorioActual, 'assets', 'fonts', 'HankenGrotesk-Variable.woff2');
    expect(existsSync(rutaWoff2)).toBe(true);
  });

  it('el @font-face declara font-weight: 100 900 (cubre 400/500/600/700)', () => {
    expect(contenidoIndexCss).toMatch(/font-weight:\s*100\s+900/);
  });
});
