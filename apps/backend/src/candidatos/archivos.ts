import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { BadRequestException, Catch, PayloadTooLargeException } from '@nestjs/common';
import { CANDIDATOS_ERROR_CODES } from './candidatos.errors';

// candidatos-listas-opciones-consulta, PR4 (design.md D8, tarea 10.1). Infraestructura de archivos
// compartida entre `ListasController` (plan de trabajo en PDF, PR2) y `CandidatosController` (foto,
// PR4). Interfaz local `ArchivoMulter`, nunca `Express.Multer.File` (`tsconfig` acota `types` a
// `["node","jest"]`, mismo criterio que `configuracion.controller.ts`/`importacion.controller.ts`).
export interface ArchivoMulter {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

const EXTENSION_PDF_REGEX = /\.pdf$/i;
const EXTENSION_PDF_CON_PUNTO_INTERMEDIA_REGEX = /\.pdf\./i;
export const TAMANIO_MAXIMO_PLAN_TRABAJO_BYTES = 5 * 1024 * 1024;

/**
 * design.md D8, threat matrix "Clasificación de archivo activo". Allowlist doble (extensión +
 * MIME) evaluada antes de tocar la DB — doble extensión (`plan.pdf.exe`) se rechaza aunque la
 * extensión final también sea válida. Promovido desde `listas.controller.ts` (PR2, tarea 6.2) a
 * este módulo compartido en PR4 (tarea 10.2) sin cambio de comportamiento.
 */
export function filtroPlanTrabajo(
  _req: unknown,
  archivo: Pick<ArchivoMulter, 'originalname' | 'mimetype'>,
  callback: (error: Error | null, aceptar: boolean) => void,
): void {
  if (EXTENSION_PDF_CON_PUNTO_INTERMEDIA_REGEX.test(archivo.originalname)) {
    callback(
      new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  if (!EXTENSION_PDF_REGEX.test(archivo.originalname) || archivo.mimetype !== 'application/pdf') {
    callback(
      new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  callback(null, true);
}

const EXTENSION_FOTO_REGEX = /\.(png|jpe?g)$/i;
const EXTENSION_FOTO_CON_PUNTO_INTERMEDIA_REGEX = /\.(png|jpe?g)\./i;
export const TAMANIO_MAXIMO_FOTO_BYTES = 2 * 1024 * 1024;

const MIME_ESPERADO_POR_EXTENSION_FOTO: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/**
 * design.md D4/D8, tarea 10.1. Foto de `Candidato`: allowlist doble extensión+MIME (PNG/JPG),
 * evaluada antes de tocar la DB — mismo criterio que `filtroPlanTrabajo`/`filtroArchivoLogo`.
 */
export function filtroFoto(
  _req: unknown,
  archivo: Pick<ArchivoMulter, 'originalname' | 'mimetype'>,
  callback: (error: Error | null, aceptar: boolean) => void,
): void {
  if (EXTENSION_FOTO_CON_PUNTO_INTERMEDIA_REGEX.test(archivo.originalname)) {
    callback(
      new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  const coincidencia = EXTENSION_FOTO_REGEX.exec(archivo.originalname);
  if (!coincidencia) {
    callback(
      new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  const extension = coincidencia[1].toLowerCase();
  if (archivo.mimetype !== MIME_ESPERADO_POR_EXTENSION_FOTO[extension]) {
    callback(
      new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  callback(null, true);
}

/**
 * design.md D8, tarea 10.1. Traduce el 413 por defecto de `multer` (`PayloadTooLargeException`) a
 * `400 ARCHIVO_DEMASIADO_GRANDE`, genérico entre el subrecurso `plan-trabajo` de `Lista` y la foto
 * de `Candidato` (antes `PlanTrabajoTamanioExcedidoFilter`, acotado solo a `Lista` — PR4 lo
 * generaliza sin cambio de comportamiento para las rutas de PR2, tarea 10.2).
 */
@Catch(PayloadTooLargeException)
export class ArchivoTamanioExcedidoFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status(codigo: number): { json(cuerpo: unknown): void } }>();
    response.status(400).json({ codigo: CANDIDATOS_ERROR_CODES.ARCHIVO_DEMASIADO_GRANDE });
  }
}
