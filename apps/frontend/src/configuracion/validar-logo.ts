/**
 * frontend-configuracion-general, PR4 (#28; design.md D8, tasks.md 13.1-13.7). Función pura que
 * espeja `filtroArchivoLogo` de `apps/backend/src/configuracion/configuracion.controller.ts`:
 * extensión REAL (no un primer match ingenuo — `logo.png.svg` se evalúa por `.svg`), pareada con
 * el MIME esperado, más el límite de tamaño (`<= 2 MB`, backend `limits.fileSize`) y el rechazo de
 * archivos de 0 bytes. Es sólo feedback inmediato: el backend sigue siendo la autoridad
 * (threat matrix "Clasificación de archivo activo") — este helper nunca reemplaza esa barrera.
 */
const EXTENSION_PERMITIDA_REGEX = /\.(png|jpe?g|svg)$/i;
const TAMANIO_MAXIMO_LOGO_BYTES = 2 * 1024 * 1024;

const MIME_ESPERADO_POR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

const MENSAJE_FORMATO_NO_PERMITIDO = 'El formato del archivo no está permitido (usa PNG, JPG o SVG).';
const MENSAJE_TAMANIO_EXCEDIDO = 'El archivo supera el tamaño máximo permitido (2 MB).';
const MENSAJE_ARCHIVO_VACIO = 'El archivo está vacío.';

export function validarArchivoLogo(archivo: File): string | null {
  const coincidencia = EXTENSION_PERMITIDA_REGEX.exec(archivo.name);
  if (!coincidencia) {
    return MENSAJE_FORMATO_NO_PERMITIDO;
  }

  const extension = coincidencia[1].toLowerCase();
  if (archivo.type !== MIME_ESPERADO_POR_EXTENSION[extension]) {
    return MENSAJE_FORMATO_NO_PERMITIDO;
  }

  if (archivo.size <= 0) {
    return MENSAJE_ARCHIVO_VACIO;
  }

  if (archivo.size > TAMANIO_MAXIMO_LOGO_BYTES) {
    return MENSAJE_TAMANIO_EXCEDIDO;
  }

  return null;
}
