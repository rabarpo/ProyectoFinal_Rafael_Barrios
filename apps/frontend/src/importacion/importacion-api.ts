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
