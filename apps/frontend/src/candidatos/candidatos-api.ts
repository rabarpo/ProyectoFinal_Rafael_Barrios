import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';

export type ListaRespuestaDto = components['schemas']['ListaRespuestaDto'];
export type CandidatoRespuestaDto = components['schemas']['CandidatoRespuestaDto'];
export type OpcionRespuestaDto = components['schemas']['OpcionRespuestaDto'];
export type PlanTrabajoRespuestaDto = components['schemas']['PlanTrabajoRespuestaDto'];

/**
 * DTOs de entrada espejados a mano de `apps/backend/src/candidatos/dto/*.dto.ts`
 * (tasks.md 20.1). Ninguno de los tres controladores (`ListasController`,
 * `CandidatosController`, `OpcionesController`) usa `@ApiBody`/`@ApiParam`/
 * `@ApiQuery` (design.md, "DTO planos con @ApiProperty únicamente") — por eso
 * `packages/contracts/src/generated/api.d.ts` genera `requestBody?: never` y
 * `parameters.path?: never`/`query?: never` para estas rutas, a diferencia de
 * `/procesos` que sí los agregó (ver `procesos-api.ts`). Agregar esos
 * decoradores a los tres controladores es scope de backend fuera de PR7
 * (frontend-only); en su lugar, los DTOs de entrada se declaran localmente y
 * se pasan al cliente tipado con `as never` en los cuatro puntos donde el
 * contrato los bloquea.
 */
export interface CrearCandidatoInput {
  proceso_id: string;
  nombres: string;
  grado?: string;
  aula?: string;
  cargo?: string;
  lista_id?: string;
  foto: File;
}

export interface ActualizarCandidatoInput {
  nombres?: string;
  grado?: string;
  aula?: string;
  cargo?: string;
  lista_id?: string;
  foto?: File;
}

export interface CrearListaInput {
  proceso_id: string;
  nombre: string;
  numero: number;
  simbolo?: string;
  lema?: string;
  propuesta?: string;
}

export interface ActualizarListaInput {
  nombre?: string;
  numero?: number;
  simbolo?: string;
  lema?: string;
  propuesta?: string;
}

export interface CrearOpcionInput {
  proceso_id: string;
  etiqueta: string;
  descripcion?: string;
}

export interface ActualizarOpcionInput {
  etiqueta?: string;
  descripcion?: string;
}

// candidatos.errors.ts, copiado literal (mismo criterio que el `codigo` de
// `auth-api.ts` para VINCULACION_REQUERIDA).
export type CodigoErrorNegocio =
  | 'CAMPO_INVALIDO'
  | 'REFERENCIA_INEXISTENTE'
  | 'COHERENCIA_JERARQUICA'
  | 'RESTRICCION_UNICA'
  | 'ENTIDAD_CON_DEPENDIENTES'
  | 'ESTADO_INVALIDO'
  | 'FOTO_REQUERIDA'
  | 'ARCHIVO_VACIO'
  | 'FORMATO_NO_PERMITIDO'
  | 'ARCHIVO_DEMASIADO_GRANDE'
  | 'ARCHIVO_NO_ENCONTRADO';

export interface ResultadoApi<T> {
  ok: boolean;
  data?: T;
  status?: number;
  codigo?: CodigoErrorNegocio;
}

function baseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? '/api';
}

function client() {
  return createSeeiClient(baseUrl());
}

/**
 * Pieza de gestión (tasks.md 23.1/23.3): `TablaCandidatos` necesita el `src`
 * de la foto sin pasar por `resolver<T>` (es un `<img>`, no un `fetch`
 * tipado) — la cookie de sesión viaja igual porque el navegador la adjunta a
 * cualquier request same-origin, mismo criterio que el resto del cliente.
 */
export function urlFoto(candidatoId: string): string {
  return `${baseUrl()}/candidatos/${candidatoId}/foto`;
}

/**
 * `bodySerializer` NO se sobreescribe (desvío del ejemplo de design.md):
 * `openapi-fetch@0.17` ya detecta `body instanceof FormData` en su
 * `defaultBodySerializer` y devuelve el `FormData` tal cual sin fijar
 * `Content-Type` (el navegador agrega `multipart/form-data; boundary=…` solo)
 * — verificado leyendo `openapi-fetch/dist/index.cjs` antes de escribir este
 * módulo (tasks.md 20.1). Un `bodySerializer`/`headers` custom sería
 * redundante.
 */
function aFormData(campos: Record<string, string | number | File | undefined>): FormData {
  const formData = new FormData();
  for (const [clave, valor] of Object.entries(campos)) {
    if (valor === undefined) continue;
    formData.append(clave, valor instanceof File ? valor : String(valor));
  }
  return formData;
}

function extraerCodigo(error: unknown): CodigoErrorNegocio | undefined {
  if (error && typeof error === 'object' && 'codigo' in error) {
    return (error as { codigo?: CodigoErrorNegocio }).codigo;
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

async function resolverVacio(
  promesa: Promise<{ error?: unknown; response: Response }>,
): Promise<ResultadoApi<void>> {
  try {
    const { error, response } = await promesa;
    if (response.ok) return { ok: true };
    return { ok: false, status: response.status, codigo: extraerCodigo(error) };
  } catch {
    return { ok: false };
  }
}

export async function crearCandidato(input: CrearCandidatoInput) {
  const body = aFormData({ ...input });
  return resolver<CandidatoRespuestaDto>(client().POST('/candidatos', { body: body as never }));
}

export async function actualizarCandidato(id: string, input: ActualizarCandidatoInput) {
  const body = aFormData({ ...input });
  return resolver<CandidatoRespuestaDto>(
    client().PATCH('/candidatos/{id}', {
      params: { path: { id } } as never,
      body: body as never,
    }),
  );
}

export async function obtenerCandidato(id: string) {
  return resolver<CandidatoRespuestaDto>(
    client().GET('/candidatos/{id}', { params: { path: { id } } as never }),
  );
}

export async function eliminarCandidato(id: string) {
  return resolverVacio(
    client().DELETE('/candidatos/{id}', { params: { path: { id } } as never }),
  );
}

export async function listarListas(procesoId: string) {
  return resolver<ListaRespuestaDto[]>(
    client().GET('/listas', { params: { query: { proceso_id: procesoId } } as never }),
  );
}

export async function crearLista(input: CrearListaInput) {
  return resolver<ListaRespuestaDto>(client().POST('/listas', { body: input as never }));
}

export async function actualizarLista(id: string, input: ActualizarListaInput) {
  return resolver<ListaRespuestaDto>(
    client().PATCH('/listas/{id}', { params: { path: { id } } as never, body: input as never }),
  );
}

export async function eliminarLista(id: string) {
  return resolverVacio(client().DELETE('/listas/{id}', { params: { path: { id } } as never }));
}

export async function subirPlanTrabajo(listaId: string, archivo: File) {
  const body = aFormData({ plan_trabajo: archivo });
  return resolver<PlanTrabajoRespuestaDto>(
    client().PUT('/listas/{id}/plan-trabajo', {
      params: { path: { id: listaId } } as never,
      body: body as never,
    }),
  );
}

export async function listarCandidatos(procesoId: string) {
  return resolver<CandidatoRespuestaDto[]>(
    client().GET('/candidatos', { params: { query: { proceso_id: procesoId } } as never }),
  );
}

export async function cambiarEstadoCandidato(id: string, estado: 'activo' | 'baja') {
  return resolver<CandidatoRespuestaDto>(
    client().PATCH('/candidatos/{id}/estado', {
      params: { path: { id } } as never,
      body: { estado } as never,
    }),
  );
}

export async function cambiarEstadoLista(id: string, estado: 'activo' | 'baja') {
  return resolver<ListaRespuestaDto>(
    client().PATCH('/listas/{id}/estado', {
      params: { path: { id } } as never,
      body: { estado } as never,
    }),
  );
}

export async function listarOpciones(procesoId: string) {
  return resolver<OpcionRespuestaDto[]>(
    client().GET('/opciones', { params: { query: { proceso_id: procesoId } } as never }),
  );
}

export async function crearOpcion(input: CrearOpcionInput) {
  return resolver<OpcionRespuestaDto>(client().POST('/opciones', { body: input as never }));
}

export async function actualizarOpcion(id: string, input: ActualizarOpcionInput) {
  return resolver<OpcionRespuestaDto>(
    client().PATCH('/opciones/{id}', { params: { path: { id } } as never, body: input as never }),
  );
}

export async function eliminarOpcion(id: string) {
  return resolverVacio(client().DELETE('/opciones/{id}', { params: { path: { id } } as never }));
}
