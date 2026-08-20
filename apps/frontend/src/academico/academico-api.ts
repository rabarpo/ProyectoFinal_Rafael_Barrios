import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';
import type { CodigoAcademico } from './mensajes-error';

export type NivelRespuestaDto = components['schemas']['NivelRespuestaDto'];
export type GradoRespuestaDto = components['schemas']['GradoRespuestaDto'];
export type AulaRespuestaDto = components['schemas']['AulaRespuestaDto'];
export type AnioEscolarRespuestaDto = components['schemas']['AnioEscolarRespuestaDto'];
export type SeccionRespuestaDto = components['schemas']['SeccionRespuestaDto'];
export type MatriculaRespuestaDto = components['schemas']['MatriculaRespuestaDto'];

/**
 * Wrappers tipados sobre `createSeeiClient('/api')`, mismo estilo que
 * `procesos/procesos-api.ts` y `auth/auth-api.ts`. Consumidos por
 * `procesos/useOpcionesSegmentacion.ts` para poblar los selectores de
 * nivel/grados/aulas del paso 2 del asistente de creación de procesos.
 */
function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function listarNiveles(signal?: AbortSignal) {
  return client().GET('/niveles', { signal });
}

export async function listarGrados(filtros?: { nivel_id?: string }, signal?: AbortSignal) {
  return client().GET('/grados', { params: { query: filtros }, signal });
}

export async function listarAulas(
  filtros?: { grado_id?: string; seccion_id?: string; anio_escolar_id?: string; turno?: string },
  signal?: AbortSignal,
) {
  return client().GET('/aulas', { params: { query: filtros } as never, signal });
}

/**
 * `activo: 'true'` filtra al único AnioEscolar activo (invariante del
 * backend: a lo sumo uno activo a la vez). Usado para acotar `/aulas` al
 * año escolar vigente cuando no hay un `grado_id` elegido.
 */
export async function listarAniosEscolares(filtros?: { activo?: string }, signal?: AbortSignal) {
  return client().GET('/anios-escolares', { params: { query: filtros }, signal });
}

/**
 * D6/tasks.md 9.1-9.4. `academico-api.ts` combina dos estilos deliberadamente en el mismo módulo:
 * las 4 lecturas de arriba (preexistentes, sin tocar) devuelven el `{ data, response }` crudo de
 * `openapi-fetch`; estas 2 lecturas nuevas siguen ese mismo estilo crudo por consistencia con las
 * anteriores (no hay motivo para migrarlas a `ResultadoApi`); las 15 escrituras de abajo sí usan
 * `ResultadoApi<T>`/`resolver`/`resolverVacio`, copiados de `candidatos-api.ts`, porque necesitan
 * distinguir éxito/error de negocio para la UI de formularios/diálogos.
 */
export async function listarSecciones(
  filtros?: { grado_id?: string; anio_escolar_id?: string },
  signal?: AbortSignal,
) {
  return client().GET('/secciones', { params: { query: filtros } as never, signal });
}

export async function listarMatriculas(
  filtros?: { usuario_id?: string; aula_id?: string; anio_escolar_id?: string },
  signal?: AbortSignal,
) {
  return client().GET('/matriculas', { params: { query: filtros } as never, signal });
}

/**
 * DTOs de entrada espejados a mano de `apps/backend/src/academico/dto/*.dto.ts` (tasks.md 9.5),
 * mismo criterio que `candidatos-api.ts`: los controladores de académica no usan
 * `@ApiBody`/`@ApiParam`/`@ApiQuery`, así que el contrato generado marca `requestBody?: never` /
 * `path?: never` para las 24 operaciones — los inputs se declaran localmente y se pasan al cliente
 * tipado con `as never` en cada punto que el contrato bloquea.
 */
export interface CrearAnioEscolarInput {
  nombre: string;
}

export interface ActualizarAnioEscolarInput {
  nombre?: string;
}

export interface CrearNivelInput {
  nombre: string;
}

export interface ActualizarNivelInput {
  nombre?: string;
}

export interface CrearGradoInput {
  nombre: string;
  nivel_id: string;
}

export interface ActualizarGradoInput {
  nombre?: string;
}

export interface CrearSeccionInput {
  nombre: string;
  grado_id: string;
  anio_escolar_id: string;
}

export interface ActualizarSeccionInput {
  nombre?: string;
}

export interface CrearAulaInput {
  turno: string;
  grado_id: string;
  seccion_id: string;
  anio_escolar_id: string;
}

export interface ActualizarAulaInput {
  turno?: string;
}

export interface CrearMatriculaInput {
  usuario_id: string;
  aula_id: string;
  anio_escolar_id: string;
}

// academico.errors.ts, reusa el union total de `mensajes-error.ts` (D6/D7 — una sola fuente de
// verdad para los 7 códigos, en vez de redeclararlos aquí).
export type CodigoErrorNegocio = CodigoAcademico;

export interface ResultadoApi<T> {
  ok: boolean;
  data?: T;
  status?: number;
  codigo?: CodigoErrorNegocio;
  relacion?: string;
}

/**
 * `PATCH /anios-escolares/:id/activar` no declara `type` en su `@ApiResponse` (design.md D6) ⇒ el
 * contrato genera `content?: never` para esa operación. `ResultadoActivacion` se espeja a mano
 * contra `ResultadoActivacionAnioEscolar` (`apps/backend/src/academico/anios-escolares.service.ts`).
 */
export interface ResultadoActivacion {
  id: string;
  activo: true;
  cambio: boolean;
}

function extraerCodigo(error: unknown): CodigoErrorNegocio | undefined {
  if (error && typeof error === 'object' && 'codigo' in error) {
    return (error as { codigo?: CodigoErrorNegocio }).codigo;
  }
  return undefined;
}

/**
 * `ENTIDAD_CON_DEPENDIENTES` (`niveles.service.ts` y sus cinco pares) manda `relacion` en el body
 * del 409 (p. ej. `'Grado'`), que `mensajeDeError` (D7) interpola en el mensaje legible. `resolver`/
 * `resolverVacio` la propagan igual que `codigo` — design.md D6 ya documentaba `relacion?` en
 * `ResultadoApi<T>`.
 */
function extraerRelacion(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'relacion' in error) {
    return (error as { relacion?: string }).relacion;
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
      relacion: extraerRelacion(error),
    };
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
    return {
      ok: false,
      status: response.status,
      codigo: extraerCodigo(error),
      relacion: extraerRelacion(error),
    };
  } catch {
    return { ok: false };
  }
}

export async function crearAnioEscolar(input: CrearAnioEscolarInput) {
  return resolver<AnioEscolarRespuestaDto>(
    client().POST('/anios-escolares', { body: input as never }),
  );
}

export async function actualizarAnioEscolar(id: string, input: ActualizarAnioEscolarInput) {
  return resolver<AnioEscolarRespuestaDto>(
    client().PATCH('/anios-escolares/{id}', {
      params: { path: { id } } as never,
      body: input as never,
    }),
  );
}

export async function eliminarAnioEscolar(id: string) {
  return resolverVacio(
    client().DELETE('/anios-escolares/{id}', { params: { path: { id } } as never }),
  );
}

export async function activarAnioEscolar(id: string) {
  return resolver<ResultadoActivacion>(
    client().PATCH('/anios-escolares/{id}/activar', { params: { path: { id } } as never }),
  );
}

export async function crearNivel(input: CrearNivelInput) {
  return resolver<NivelRespuestaDto>(client().POST('/niveles', { body: input as never }));
}

export async function actualizarNivel(id: string, input: ActualizarNivelInput) {
  return resolver<NivelRespuestaDto>(
    client().PATCH('/niveles/{id}', { params: { path: { id } } as never, body: input as never }),
  );
}

export async function eliminarNivel(id: string) {
  return resolverVacio(client().DELETE('/niveles/{id}', { params: { path: { id } } as never }));
}

export async function crearGrado(input: CrearGradoInput) {
  return resolver<GradoRespuestaDto>(client().POST('/grados', { body: input as never }));
}

export async function actualizarGrado(id: string, input: ActualizarGradoInput) {
  return resolver<GradoRespuestaDto>(
    client().PATCH('/grados/{id}', { params: { path: { id } } as never, body: input as never }),
  );
}

export async function eliminarGrado(id: string) {
  return resolverVacio(client().DELETE('/grados/{id}', { params: { path: { id } } as never }));
}

export async function crearSeccion(input: CrearSeccionInput) {
  return resolver<SeccionRespuestaDto>(client().POST('/secciones', { body: input as never }));
}

export async function actualizarSeccion(id: string, input: ActualizarSeccionInput) {
  return resolver<SeccionRespuestaDto>(
    client().PATCH('/secciones/{id}', {
      params: { path: { id } } as never,
      body: input as never,
    }),
  );
}

export async function eliminarSeccion(id: string) {
  return resolverVacio(client().DELETE('/secciones/{id}', { params: { path: { id } } as never }));
}

export async function crearAula(input: CrearAulaInput) {
  return resolver<AulaRespuestaDto>(client().POST('/aulas', { body: input as never }));
}

export async function actualizarAula(id: string, input: ActualizarAulaInput) {
  return resolver<AulaRespuestaDto>(
    client().PATCH('/aulas/{id}', { params: { path: { id } } as never, body: input as never }),
  );
}

export async function eliminarAula(id: string) {
  return resolverVacio(client().DELETE('/aulas/{id}', { params: { path: { id } } as never }));
}

export async function crearMatricula(input: CrearMatriculaInput) {
  return resolver<MatriculaRespuestaDto>(client().POST('/matriculas', { body: input as never }));
}

export async function eliminarMatricula(id: string) {
  return resolverVacio(client().DELETE('/matriculas/{id}', { params: { path: { id } } as never }));
}
