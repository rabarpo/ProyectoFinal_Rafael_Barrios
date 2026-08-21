import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';
import type { CodigoConfiguracion } from './mensajes-error';

/**
 * frontend-configuracion-general, PR2 (#28; design.md D3, tasks.md 5.1-6.4). `ResultadoApi<T>`/
 * `resolver` copiados de `candidatos-api.ts`, incluidas las dos lecturas: a diferencia de `#26`
 * D6, `GET /configuracion` fallido no puede dejar montar el formulario con valores basura, y
 * `GET /configuracion/comite` vacío debe distinguirse de fallido (mismo criterio que `#27` D5
 * `listarApoderados`). `aFormData` replicado local (D8) — la firma sólo necesita `logo`, no la
 * variedad de tipos de `candidatos-api.ts`.
 */
export type ConfiguracionRespuestaDto = components['schemas']['ConfiguracionRespuestaDto'];
export type LogoRespuestaDto = components['schemas']['LogoRespuestaDto'];
export type UsuarioRespuestaDto = components['schemas']['UsuarioRespuestaDto'];

/**
 * Espejado a mano de `apps/backend/src/configuracion/dto/actualizar-configuracion.dto.ts`
 * (contrato: `requestBody?: never`, verificado en `api.d.ts`). `smtp_puerto` es `number`, NO
 * `string` — Prisma `Int?` y el proyecto no tiene `ValidationPipe` (D5): la coerción es
 * responsabilidad del contenedor, no de este cliente.
 */
export interface ActualizarConfiguracionInput {
  nombre?: string;
  director?: string;
  color_primario?: string;
  color_secundario?: string;
  zona_horaria?: string;
  dominios_google?: string[]; // `[]` es un valor válido, no "ausente"
  smtp_host?: string;
  smtp_puerto?: number;
  smtp_remitente?: string;
}

export interface ResultadoApi<T> {
  ok: boolean;
  data?: T;
  status?: number;
  codigo?: CodigoConfiguracion;
  campo?: string;
}

function baseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}

function client() {
  return createSeeiClient(baseUrl());
}

/**
 * `aFormData` replicado local (design.md D3: "`aFormData` replicado local"), acotado a lo que
 * `subirLogo` necesita — mismo criterio de `openapi-fetch` detectando `FormData` sin fijar
 * `Content-Type` manualmente que `candidatos-api.ts`'s `subirPlanTrabajo`.
 */
function aFormData(campos: Record<string, string | File>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    formData.append(clave, valor);
  }
  return formData;
}

function extraerCodigo(error: unknown): CodigoConfiguracion | undefined {
  if (error && typeof error === 'object' && 'codigo' in error) {
    return (error as { codigo?: CodigoConfiguracion }).codigo;
  }
  return undefined;
}

function extraerCampo(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'campo' in error) {
    return (error as { campo?: string }).campo;
  }
  return undefined;
}

async function resolver<T>(
  promesa: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<ResultadoApi<T>> {
  try {
    const { data, error, response } = await promesa;
    if (response.ok && data !== undefined) return { ok: true, data };
    return {
      ok: false,
      status: response.status,
      codigo: extraerCodigo(error),
      campo: extraerCampo(error),
    };
  } catch {
    return { ok: false };
  }
}

export async function obtenerConfiguracion(signal?: AbortSignal) {
  return resolver<ConfiguracionRespuestaDto>(client().GET('/configuracion', { signal }));
}

export async function actualizarConfiguracion(input: ActualizarConfiguracionInput) {
  return resolver<ConfiguracionRespuestaDto>(
    client().PUT('/configuracion', { body: input as never }),
  );
}

export async function listarComite(signal?: AbortSignal) {
  return resolver<UsuarioRespuestaDto[]>(client().GET('/configuracion/comite', { signal }));
}

export async function subirLogo(archivo: File) {
  const body = aFormData({ logo: archivo });
  return resolver<LogoRespuestaDto>(
    client().POST('/configuracion/logo', { body: body as never }),
  );
}

/**
 * `<img src>`, cache-bust por versión — espeja `urlFoto` de `#12`/`candidatos-api.ts`, pero acá
 * la versión (`logo_actualizado_en`) es necesaria porque el navegador cachearía el binario del
 * logo bajo la misma URL tras un reemplazo (design.md D8).
 */
export function urlLogo(version?: string): string {
  const base = `${baseUrl()}/configuracion/logo`;
  if (version === undefined) return base;
  return `${base}?v=${encodeURIComponent(version)}`;
}
