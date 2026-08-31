/**
 * frontend-importacion-excel, PR2 (#29; design.md D6, tasks.md 2.1-2.2). Función pura que espeja
 * `filtroArchivoPadron` de `apps/backend/src/importacion`: extensión REAL (no un primer match
 * ingenuo — `padron.xlsx.xlsm` se evalúa por `.xlsm` y se rechaza) y el límite de tamaño
 * (`0 < size <= 5 MB`, backend `limits.fileSize`).
 *
 * DESVÍO CONSCIENTE de `#28` D6 (`validar-logo.ts`): NO se parea el MIME. El MIME de `.xlsx` que
 * reporta el navegador varía por plataforma (`application/vnd.openxmlformats-…`,
 * `application/octet-stream`, vacío) y el backend TAMPOCO lo usa para la allowlist
 * (`filtroArchivoPadron` mira sólo `originalname`) — parearlo produciría falsos rechazos de
 * archivos que el backend acepta. Es sólo feedback inmediato: el backend sigue siendo la autoridad
 * (threat matrix "Clasificación de archivo activo").
 */
const EXTENSION_PERMITIDA_REGEX = /\.(xlsx|csv)$/i;
const TAMANIO_MAXIMO_PADRON_BYTES = 5 * 1024 * 1024;

const MENSAJE_FORMATO_NO_PERMITIDO = 'El formato del archivo no está permitido (usa .xlsx o .csv).';
const MENSAJE_ARCHIVO_VACIO = 'El archivo está vacío.';
const MENSAJE_TAMANIO_EXCEDIDO = 'El archivo supera el tamaño máximo permitido (5 MB).';

export function validarArchivoPadron(archivo: File): string | null {
  if (!EXTENSION_PERMITIDA_REGEX.test(archivo.name)) {
    return MENSAJE_FORMATO_NO_PERMITIDO;
  }

  if (archivo.size <= 0) {
    return MENSAJE_ARCHIVO_VACIO;
  }

  if (archivo.size > TAMANIO_MAXIMO_PADRON_BYTES) {
    return MENSAJE_TAMANIO_EXCEDIDO;
  }

  return null;
}
