import { describe, expect, it } from 'vitest';
import { validarArchivoLogo } from './validar-logo';

// [design.md D8/D11; tasks.md Fase 13] Función pura, sin jsdom: espeja `filtroArchivoLogo` del
// backend (extensión .png/.jpg/.jpeg/.svg pareada con su MIME esperado, <= 2 MB, > 0 bytes).
// Threat matrix "Clasificación de archivo activo": doble extensión (`logo.png.svg`) evaluada por
// la extensión REAL (última), no por un primer match ingenuo.
function archivo(nombre: string, tipo: string, tamanio: number): File {
  return new File(['x'.repeat(Math.max(tamanio, 0))], nombre, { type: tipo });
}

describe('validarArchivoLogo', () => {
  it('[13.1] .png con MIME image/png dentro del límite es válido (null)', () => {
    expect(validarArchivoLogo(archivo('logo.png', 'image/png', 1024))).toBeNull();
  });

  it('[13.1] .jpg con MIME image/jpeg dentro del límite es válido (null)', () => {
    expect(validarArchivoLogo(archivo('logo.jpg', 'image/jpeg', 1024))).toBeNull();
  });

  it('[13.1] .jpeg con MIME image/jpeg dentro del límite es válido (null)', () => {
    expect(validarArchivoLogo(archivo('logo.jpeg', 'image/jpeg', 1024))).toBeNull();
  });

  it('[13.1] .svg con MIME image/svg+xml dentro del límite es válido (null)', () => {
    expect(validarArchivoLogo(archivo('logo.svg', 'image/svg+xml', 1024))).toBeNull();
  });

  it('[13.2] un .pdf se rechaza con un mensaje no vacío', () => {
    const mensaje = validarArchivoLogo(archivo('documento.pdf', 'application/pdf', 1024));
    expect(mensaje).toEqual(expect.any(String));
    expect(mensaje).not.toBe('');
  });

  it('[13.3] extensión .png con MIME application/pdf (descalce) se rechaza', () => {
    const mensaje = validarArchivoLogo(archivo('logo.png', 'application/pdf', 1024));
    expect(mensaje).toEqual(expect.any(String));
    expect(mensaje).not.toBe('');
  });

  it('[13.4] "logo.png.svg" se evalúa por su extensión real (.svg), no un primer match ingenuo', () => {
    // MIME correcto para .svg ⇒ válido, aunque el nombre contenga ".png" antes.
    expect(validarArchivoLogo(archivo('logo.png.svg', 'image/svg+xml', 1024))).toBeNull();
    // MIME de .png con nombre "logo.png.svg" ⇒ inválido (la extensión real es .svg, no .png).
    const mensaje = validarArchivoLogo(archivo('logo.png.svg', 'image/png', 1024));
    expect(mensaje).toEqual(expect.any(String));
    expect(mensaje).not.toBe('');
  });

  it('[13.5] exactamente 2 MB es válido (límite inclusive)', () => {
    expect(validarArchivoLogo(archivo('logo.png', 'image/png', 2 * 1024 * 1024))).toBeNull();
  });

  it('[13.5] 2 MB + 1 byte se rechaza', () => {
    const mensaje = validarArchivoLogo(archivo('logo.png', 'image/png', 2 * 1024 * 1024 + 1));
    expect(mensaje).toEqual(expect.any(String));
    expect(mensaje).not.toBe('');
  });

  it('[13.6] un archivo de 0 bytes se rechaza', () => {
    const mensaje = validarArchivoLogo(archivo('logo.png', 'image/png', 0));
    expect(mensaje).toEqual(expect.any(String));
    expect(mensaje).not.toBe('');
  });
});
