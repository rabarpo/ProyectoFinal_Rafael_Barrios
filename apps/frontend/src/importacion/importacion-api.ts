import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';
import type { CodigoImportacion } from './mensajes-error';

/**
 * frontend-importacion-excel, PR3 (#29; design.md D3, tasks.md 3.1-3.2). `importarPadron` reusa el
 * cliente tipado igual que `subirLogo`/`subirPlanTrabajo`: el contrato genera `requestBody?: never`
 * para `POST /importaciones/padron` (`api.d.ts:3597`), así que el `FormData` se pasa con `as never`.
 *
 * `ResultadoApi<T>`/`resolver`/`extraerCodigo` replicados de `candidatos-api.ts` (los catálogos de
 * código son locales a su módulo; `codigo` se tipa con `CodigoImportacion` de `mensajes-error.ts`).
 * `aFormData` local con una sola clave `archivo` — la que espera `FileInterceptor('archivo')`. NO se
 * sobreescribe `bodySerializer`: `openapi-fetch@0.17` detecta `body instanceof FormData` y no fija
 * `Content-Type`, dejando que el navegador ponga `multipart/form-data; boundary=…`.
 */
export type ResultadoImportacionDto = components['schemas']['ResultadoImportacionDto'];
export type ErrorFilaDto = components['schemas']['ErrorFilaDto'];

export interface ResultadoApi<T> {
  ok: boolean;
  data?: T;
  status?: number;
  codigo?: CodigoImportacion;
}

function baseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}

function client() {
  return createSeeiClient(baseUrl());
}

function aFormData(campos: Record<string, File | undefined>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    formData.append(clave, valor);
  }
  return formData;
}

function extraerCodigo(error: unknown): CodigoImportacion | undefined {
  if (error && typeof error === 'object' && 'codigo' in error) {
    return (error as { codigo?: CodigoImportacion }).codigo;
  }
  return undefined;
}

async function resolver<T>(
  promesa: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ResultadoApi<T>> {
  try {
    const { data, error, response } = await promesa;
    if (response.ok && data !== undefined) return { ok: true, data };
    return { ok: false, status: response.status, codigo: extraerCodigo(error) };
  } catch {
    return { ok: false };
  }
}

export async function importarPadron(archivo: File): Promise<ResultadoApi<ResultadoImportacionDto>> {
  const body = aFormData({ archivo });
  return resolver<ResultadoImportacionDto>(
    client().POST('/importaciones/padron', { body: body as never }),
  );
}

async function codigoDeRespuesta(res: Response): Promise<CodigoImportacion | undefined> {
  try {
    return extraerCodigo(await res.clone().json());
  } catch {
    return undefined;
  }
}

/**
 * frontend-importacion-excel, PR4 (#29; design.md D4, tasks.md 4.1-4.2; Threat Matrix
 * "Descarga / Content-Disposition"). `fetch` CRUDO: el contrato declara `content?: never` en las
 * cuatro respuestas de `GET /importaciones/{id}/errores.csv`, así que el cliente tipado no aporta
 * ningún tipo — sería `as never` en `params` y en el parseo, cero seguridad a cambio de ruido.
 *
 * El nombre del archivo se CONSTRUYE en el cliente (`importacion-${id}-errores.csv`): el header
 * `Content-Disposition` nunca se parsea, así ningún `filename` hostil del servidor llega al disco.
 * `encodeURIComponent(importacionId)` impide que un id manipulado escape del path.
 * `URL.revokeObjectURL` corre en `finally` (cierra la referencia siempre). Devuelve
 * `ResultadoApi<void>` para que el `404` por TTL vencido sea un dato, no una excepción.
 */
export async function descargarCsvErrores(importacionId: string): Promise<ResultadoApi<void>> {
  let url: string | undefined;
  try {
    const res = await fetch(
      `${baseUrl()}/importaciones/${encodeURIComponent(importacionId)}/errores.csv`,
    );
    if (!res.ok) {
      return { ok: false, status: res.status, codigo: await codigoDeRespuesta(res) };
    }
    url = URL.createObjectURL(await res.blob());
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `importacion-${importacionId}-errores.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
