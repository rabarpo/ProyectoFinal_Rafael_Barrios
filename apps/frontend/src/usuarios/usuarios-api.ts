import { createSeeiClient } from '@seei/contracts/src/client';
import type { components } from '@seei/contracts/src/generated/api';
import type { CodigoUsuarios } from './mensajes-error';

/**
 * `listarUsuarios` es la semilla de #26 (D11, tasks.md 10.1-10.2): `PanelMatriculas` la consume
 * para resolver `usuario_id → nombres`, su firma no cambia acá. PR3 (#27, D5/D6, tasks.md
 * 7.1-9.3) expande este mismo módulo con `ResultadoApi<T>` + `resolver`/`resolverVacio` (copiados
 * de `academico-api.ts`) y las 9 funciones nuevas de `Usuario`/`Apoderado`/bloqueo.
 */
export type UsuarioRespuestaDto = components['schemas']['UsuarioRespuestaDto'];
export type ApoderadoRespuestaDto = components['schemas']['ApoderadoRespuestaDto'];
export type UsuarioBloqueadoDto = components['schemas']['UsuarioBloqueadoDto'];

function client() {
  return createSeeiClient(import.meta.env.VITE_API_BASE_URL ?? '/api');
}

export async function listarUsuarios(
  filtros?: { rol?: string; estado?: string },
  signal?: AbortSignal,
) {
  return client().GET('/usuarios', { params: { query: filtros } as never, signal });
}

/**
 * DTOs de entrada espejados a mano de `apps/backend/src/users/dto/*.dto.ts` y
 * `apps/backend/src/users/dto/apoderado*.dto.ts` (tasks.md 7.5/8.5): el contrato generado marca
 * `requestBody?: never`/`parameters?: never` en estas 7 rutas (los controladores no usan
 * `@ApiBody`/`@ApiParam`), mismo criterio que `academico-api.ts` (D6).
 */
export interface CrearUsuarioInput {
  nombres: string;
  dni: string;
  codigo: string;
  correo: string;
  rol: 'estudiante' | 'docente' | 'comite' | 'administrador' | 'director';
}

// `rol` omitido a propósito (D8: "editar rol" no es una operación de este formulario) — la
// omisión es una decisión de UI, `ActualizarUsuarioDto` en el backend sí sigue aceptándolo.
export interface ActualizarUsuarioInput {
  nombres?: string;
  dni?: string;
  codigo?: string;
  correo?: string;
}

export interface CrearApoderadoInput {
  nombres: string;
  dni: string;
  correo?: string;
}

export interface ActualizarApoderadoInput {
  nombres?: string;
  dni?: string;
  correo?: string;
}

/**
 * `PATCH /usuarios/:id/estado` no declara `type` en su `@ApiResponse` (design.md D6) ⇒ el
 * contrato genera `content?: never` ⇒ se espeja a mano contra el retorno de
 * `UsersController.cambiarEstado()`.
 */
export interface CambioEstadoUsuario {
  id: string;
  estado: string;
}

/**
 * `POST /auth/usuarios/:id/desbloquear` tampoco declara `type` (mismo criterio) ⇒ se espeja a
 * mano contra `AuthController.desbloquear()` / `BloqueoService.desbloquearManual()`.
 * `desbloqueado: false` es el caso idempotente (cuenta ya recuperada) — sigue siendo `ok: true`,
 * no un fallo (design.md D11).
 */
export interface ResultadoDesbloqueo {
  desbloqueado: boolean;
}

export interface ResultadoApi<T> {
  ok: boolean;
  data?: T;
  status?: number;
  codigo?: CodigoUsuarios;
  campo?: string;
}

function extraerCodigo(error: unknown): CodigoUsuarios | undefined {
  if (error && typeof error === 'object' && 'codigo' in error) {
    return (error as { codigo?: CodigoUsuarios }).codigo;
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
      campo: extraerCampo(error),
    };
  } catch {
    return { ok: false };
  }
}

// -- Usuario --------------------------------------------------------------

export async function crearUsuario(input: CrearUsuarioInput) {
  return resolver<UsuarioRespuestaDto>(client().POST('/usuarios', { body: input as never }));
}

export async function actualizarUsuario(id: string, input: ActualizarUsuarioInput) {
  return resolver<UsuarioRespuestaDto>(
    client().PATCH('/usuarios/{id}', {
      params: { path: { id } } as never,
      body: input as never,
    }),
  );
}

export async function cambiarEstadoUsuario(id: string, estado: 'activo' | 'inactivo') {
  return resolver<CambioEstadoUsuario>(
    client().PATCH('/usuarios/{id}/estado', {
      params: { path: { id } } as never,
      body: { estado } as never,
    }),
  );
}

// -- Apoderado --------------------------------------------------------------

export async function listarApoderados(usuarioId: string, signal?: AbortSignal) {
  return resolver<ApoderadoRespuestaDto[]>(
    client().GET('/usuarios/{usuarioId}/apoderados', {
      params: { path: { usuarioId } } as never,
      signal,
    }),
  );
}

export async function crearApoderado(usuarioId: string, input: CrearApoderadoInput) {
  return resolver<ApoderadoRespuestaDto>(
    client().POST('/usuarios/{usuarioId}/apoderados', {
      params: { path: { usuarioId } } as never,
      body: input as never,
    }),
  );
}

export async function actualizarApoderado(
  usuarioId: string,
  apoderadoId: string,
  input: ActualizarApoderadoInput,
) {
  return resolver<ApoderadoRespuestaDto>(
    client().PATCH('/usuarios/{usuarioId}/apoderados/{apoderadoId}', {
      params: { path: { usuarioId, apoderadoId } } as never,
      body: input as never,
    }),
  );
}

export async function eliminarApoderado(usuarioId: string, apoderadoId: string) {
  return resolverVacio(
    client().DELETE('/usuarios/{usuarioId}/apoderados/{apoderadoId}', {
      params: { path: { usuarioId, apoderadoId } } as never,
    }),
  );
}

// -- Bloqueo --------------------------------------------------------------

export async function listarCuentasBloqueadas(signal?: AbortSignal) {
  return resolver<UsuarioBloqueadoDto[]>(client().GET('/auth/usuarios/bloqueados', { signal }));
}

export async function desbloquearCuenta(id: string) {
  return resolver<ResultadoDesbloqueo>(
    client().POST('/auth/usuarios/{id}/desbloquear', {
      params: { path: { id } } as never,
    }),
  );
}
