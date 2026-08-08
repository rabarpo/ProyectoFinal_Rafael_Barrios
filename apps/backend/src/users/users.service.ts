import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EstadoUsuario, Prisma, RolUsuario, Usuario } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { SessionService } from '../auth/session.service';
import { PrismaService } from '../prisma/prisma.service';
import type { UsuarioRespuestaDto } from './dto/usuario-respuesta.dto';
import { USERS_ERROR_CODES } from './users.errors';

// administracion-usuarios-apoderados, PR1 (design.md D5, tarea 5.4). Forma mínima que
// `clasificarColision()`/`crear()`/`crearIdempotente()` necesitan de un alta de `Usuario`.
export interface DatosUsuario {
  nombres: string;
  dni: string;
  codigo: string;
  correo: string;
  rol: RolUsuario;
}

// administracion-usuarios-apoderados, PR2 (design.md D1, tarea 8.3). `PATCH /usuarios/:id` acepta
// cualquier subconjunto de estos cinco campos — `estado` NUNCA aparece aquí a propósito (D1: el
// DTO no lo declara, así que ni siquiera compila pasarlo por este camino).
export type DatosActualizarUsuario = Partial<DatosUsuario>;

// D5: núcleo compartido de unicidad. No lanza; clasifica.
export type Colision =
  | { tipo: 'sin_colision' }
  | { tipo: 'coincidencia_exacta'; usuario: Usuario }
  | { tipo: 'conflicto'; campo: 'dni' | 'codigo' | 'correo' };

const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DNI_MAX_LENGTH = 20;

// administracion-usuarios-apoderados, PR2 (design.md "Contratos HTTP", tarea 7.10). Valores
// válidos de filtro para `GET /usuarios?rol=&estado=` — cualquier otro valor es `400
// CAMPO_INVALIDO` (R5), nunca un `500` de Prisma sobre un enum desconocido.
const ROLES_VALIDOS: readonly RolUsuario[] = [
  'estudiante',
  'docente',
  'comite',
  'administrador',
  'director',
];
const ESTADOS_VALIDOS: readonly EstadoUsuario[] = ['activo', 'inactivo', 'bloqueado'];

export interface FiltroListadoUsuarios {
  rol?: string;
  estado?: string;
}

/**
 * R3: texto libre, sin validación de formato (decisión confirmada en proposal.md); solo el
 * máximo de 20 caracteres es una regla de aplicación.
 */
export function validarDni(dni: string): void {
  if (dni.length > DNI_MAX_LENGTH) {
    throw new BadRequestException({
      codigo: USERS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'dni',
      motivo: 'longitud_maxima',
    });
  }
}

/**
 * R4: solo formato y unicidad — nunca dominio institucional en la creación manual (esa exigencia
 * es exclusiva del login por Google OAuth de `google-oauth-y-recuperacion`).
 */
export function validarCorreo(correo: string): void {
  if (!CORREO_REGEX.test(correo)) {
    throw new BadRequestException({
      codigo: USERS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'correo',
      motivo: 'formato',
    });
  }
}

/**
 * D2: deriva el campo en conflicto desde `error.meta.target` de un `P2002` residual — mismo
 * precedente que `crearSesionOAuth()` de `google-oauth-y-recuperacion`, sin dejar escapar la
 * violación de constraint como `500`.
 */
export function campoDesdeTarget(target: unknown): 'dni' | 'codigo' | 'correo' {
  const columnas = Array.isArray(target)
    ? (target as unknown[]).map(String)
    : typeof target === 'string'
      ? [target]
      : [];
  const contiene = (nombre: string) => columnas.some((c) => c.toLowerCase().includes(nombre));

  if (contiene('dni')) return 'dni';
  if (contiene('codigo')) return 'codigo';
  return 'correo';
}

function esP2002(error: unknown): error is { code: 'P2002'; meta?: { target?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * D5: única fuente de verdad de la unicidad de `dni`/`codigo`/`correo`, compartida por `crear()`
 * (siempre 409, incluida la exacta) y `crearIdempotente()` (la exacta es no-op). Exportada como
 * función pura sobre `tx` — mismo precedente que `bloqueoVigente()`/`sanarBloqueoVencido()` de
 * `bloqueo-desbloqueo-cuentas` — en vez del método `private` del snippet literal de design.md, para
 * quedar unit-testeable sin instanciar `UsersService` (deviación declarada, mismo comportamiento y
 * firma).
 */
export async function clasificarColision(
  tx: Prisma.TransactionClient,
  datos: Pick<DatosUsuario, 'dni' | 'codigo' | 'correo'>,
  excluirId?: string,
): Promise<Colision> {
  const idFilter = excluirId ? { not: excluirId } : undefined;

  const [porDni, porCodigo, porCorreo] = await Promise.all([
    tx.usuario.findFirst({ where: { dni: datos.dni, ...(idFilter ? { id: idFilter } : {}) } }),
    tx.usuario.findFirst({ where: { codigo: datos.codigo, ...(idFilter ? { id: idFilter } : {}) } }),
    tx.usuario.findFirst({ where: { correo: datos.correo, ...(idFilter ? { id: idFilter } : {}) } }),
  ]);

  if (!porDni && !porCodigo && !porCorreo) {
    return { tipo: 'sin_colision' };
  }

  // Coincidencia exacta: dni Y codigo apuntan a la MISMA fila (y el correo, si coincide con
  // alguna fila, es esa misma). Nunca reasigna identidad (D5, garantía 2).
  if (porDni && porCodigo && porDni.id === porCodigo.id && (!porCorreo || porCorreo.id === porDni.id)) {
    return { tipo: 'coincidencia_exacta', usuario: porDni };
  }

  if (porDni) return { tipo: 'conflicto', campo: 'dni' };
  if (porCodigo) return { tipo: 'conflicto', campo: 'codigo' };
  return { tipo: 'conflicto', campo: 'correo' };
}

function mapearUsuarioRespuesta(usuario: Usuario): UsuarioRespuestaDto {
  return {
    id: usuario.id,
    nombres: usuario.nombres,
    dni: usuario.dni,
    codigo: usuario.codigo,
    correo: usuario.correo,
    rol: usuario.rol,
    estado: usuario.estado,
    creado_en: usuario.creado_en.toISOString(),
  };
}

/**
 * administracion-usuarios-apoderados, PR1 (design.md D3/D5). PR1 deja únicamente el núcleo de
 * unicidad y las dos entradas de creación (`crear()`/`crearIdempotente()`, gancho de
 * `importacion-de-usuarios-por-excel`, #9); `UsersController` y el resto del CRUD (actualizar,
 * cambiarEstado) llegan en PR2.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * administracion-usuarios-apoderados, PR2 (design.md "Contratos HTTP", tarea 7.10, spec
   * "Consulta y listado de Usuario"). Sin paginación (pregunta abierta declarada en design.md);
   * `orderBy codigo asc`, arreglo desnudo — mismo criterio que `listarBloqueados()` de
   * `bloqueo-desbloqueo-cuentas`.
   */
  async listar(filtro: FiltroListadoUsuarios): Promise<UsuarioRespuestaDto[]> {
    if (filtro.rol !== undefined && !ROLES_VALIDOS.includes(filtro.rol as RolUsuario)) {
      throw new BadRequestException({
        codigo: USERS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'rol',
        motivo: 'formato',
      });
    }
    if (filtro.estado !== undefined && !ESTADOS_VALIDOS.includes(filtro.estado as EstadoUsuario)) {
      throw new BadRequestException({
        codigo: USERS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'estado',
        motivo: 'formato',
      });
    }

    const usuarios = await this.prisma.usuario.findMany({
      where: {
        ...(filtro.rol ? { rol: filtro.rol as RolUsuario } : {}),
        ...(filtro.estado ? { estado: filtro.estado as EstadoUsuario } : {}),
      },
      orderBy: { codigo: 'asc' },
    });

    return usuarios.map(mapearUsuarioRespuesta);
  }

  /** GET /usuarios/:id — spec "Consulta y listado de Usuario". */
  async obtenerPorId(id: string): Promise<UsuarioRespuestaDto> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return mapearUsuarioRespuesta(usuario);
  }

  /**
   * Camino HTTP (`POST /usuarios`): cualquier colisión, incluida la exacta, es
   * `409 CAMPO_DUPLICADO` (D5). `password_hash = null` y `estado = 'activo'` siempre en la
   * creación manual (spec "Creación de Usuario para cualquiera de los cinco roles").
   */
  async crear(datos: DatosUsuario, actorId: string): Promise<UsuarioRespuestaDto> {
    validarDni(datos.dni);
    validarCorreo(datos.correo);

    try {
      const usuario = await this.prisma.$transaction(async (tx) => {
        const colision = await clasificarColision(tx, datos);
        if (colision.tipo !== 'sin_colision') {
          const campo = colision.tipo === 'coincidencia_exacta' ? 'dni' : colision.campo;
          throw new ConflictException({ codigo: USERS_ERROR_CODES.CAMPO_DUPLICADO, campo });
        }

        const creado = await tx.usuario.create({
          data: {
            nombres: datos.nombres,
            dni: datos.dni,
            codigo: datos.codigo,
            correo: datos.correo,
            rol: datos.rol,
            password_hash: null,
            estado: 'activo',
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.USUARIO_CREADO,
          actorId,
          'Usuario',
          creado.id,
          { rol: creado.rol, origen: 'manual' } as Prisma.InputJsonValue,
        );

        return creado;
      });

      return mapearUsuarioRespuesta(usuario);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: USERS_ERROR_CODES.CAMPO_DUPLICADO,
          campo: campoDesdeTarget(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * Gancho de `importacion-de-usuarios-por-excel` (#9, sin implementarlo hoy): idempotente por el
   * par (`dni`, `codigo`) (D5, garantía 1). `tx` opcional — si llega, participa de la transacción
   * del llamador y NO abre `this.prisma.$transaction` propia (R13); si no llega, abre la suya,
   * como `desbloquearManual()` de `bloqueo-desbloqueo-cuentas`.
   */
  async crearIdempotente(
    datos: DatosUsuario,
    actorId: string,
    txExterno?: Prisma.TransactionClient,
  ): Promise<{ usuario: UsuarioRespuestaDto; creado: boolean }> {
    validarDni(datos.dni);
    validarCorreo(datos.correo);

    const ejecutar = async (tx: Prisma.TransactionClient) => {
      const colision = await clasificarColision(tx, datos);

      if (colision.tipo === 'coincidencia_exacta') {
        return { usuario: mapearUsuarioRespuesta(colision.usuario), creado: false };
      }

      if (colision.tipo === 'conflicto') {
        throw new ConflictException({ codigo: USERS_ERROR_CODES.CAMPO_DUPLICADO, campo: colision.campo });
      }

      const creado = await tx.usuario.create({
        data: {
          nombres: datos.nombres,
          dni: datos.dni,
          codigo: datos.codigo,
          correo: datos.correo,
          rol: datos.rol,
          password_hash: null,
          estado: 'activo',
        },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.USUARIO_CREADO,
        actorId,
        'Usuario',
        creado.id,
        { rol: creado.rol, origen: 'idempotente' } as Prisma.InputJsonValue,
      );

      return { usuario: mapearUsuarioRespuesta(creado), creado: true };
    };

    try {
      if (txExterno) {
        return await ejecutar(txExterno);
      }
      return await this.prisma.$transaction(ejecutar);
    } catch (error) {
      if (esP2002(error)) {
        // P2002 residual (D5, garantía 4): se reclasifica solo por el campo derivado del target —
        // convergencia bajo carrera nunca es 500. La reclasificación fina (coincidencia_exacta vs
        // conflicto real) queda para cuando #9 ejercite este camino con Postgres real.
        throw new ConflictException({
          codigo: USERS_ERROR_CODES.CAMPO_DUPLICADO,
          campo: campoDesdeTarget(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * administracion-usuarios-apoderados, PR2 (design.md D1, tarea 8.3). `datos` viene de
   * `ActualizarUsuarioDto`, que deliberadamente NO declara `estado` — "editar datos básicos no
   * puede mover el estado" es una propiedad del tipo, no una validación en tiempo de ejecución.
   * Sin cambios efectivos (todos los campos enviados coinciden con los actuales), es un no-op:
   * no se dispara `clasificarColision` ni se audita (mismo criterio de "sin cambio, sin efecto"
   * de D1/D6 para `cambiarEstado`).
   */
  async actualizar(
    id: string,
    datos: DatosActualizarUsuario,
    actorId: string,
  ): Promise<UsuarioRespuestaDto> {
    if (datos.dni !== undefined) validarDni(datos.dni);
    if (datos.correo !== undefined) validarCorreo(datos.correo);

    try {
      const usuario = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.usuario.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Usuario no encontrado');
        }

        const camposModificados = (
          ['nombres', 'dni', 'codigo', 'correo', 'rol'] as Array<keyof DatosUsuario>
        ).filter((campo) => datos[campo] !== undefined && datos[campo] !== actual[campo]);

        if (camposModificados.length === 0) {
          return actual;
        }

        const fusionado: Pick<DatosUsuario, 'dni' | 'codigo' | 'correo'> = {
          dni: datos.dni ?? actual.dni,
          codigo: datos.codigo ?? actual.codigo,
          correo: datos.correo ?? actual.correo,
        };
        const colision = await clasificarColision(tx, fusionado, id);
        if (colision.tipo !== 'sin_colision') {
          const campo = colision.tipo === 'coincidencia_exacta' ? 'dni' : colision.campo;
          throw new ConflictException({ codigo: USERS_ERROR_CODES.CAMPO_DUPLICADO, campo });
        }

        const actualizado = await tx.usuario.update({
          where: { id },
          data: {
            nombres: datos.nombres,
            dni: datos.dni,
            codigo: datos.codigo,
            correo: datos.correo,
            rol: datos.rol,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.USUARIO_ACTUALIZADO,
          actorId,
          'Usuario',
          actualizado.id,
          { campos: camposModificados } as Prisma.InputJsonValue,
        );

        return actualizado;
      });

      return mapearUsuarioRespuesta(usuario);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: USERS_ERROR_CODES.CAMPO_DUPLICADO,
          campo: campoDesdeTarget(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * administracion-usuarios-apoderados, PR2 (design.md D1/D2/D6, tarea 9.8). `destino` expresa el
   * ESTADO DESTINO, nunca una acción — repetir el request es idempotente (D1): si la fila ya está
   * en `destino`, no escribe fila de auditoría ni invoca `revokeAllForUser` (adversarial 9.7).
   * `bloqueado` nunca es un destino válido de este módulo (`400 ESTADO_DESTINO_NO_PERMITIDO`,
   * chequeo por valor, sin mirar la fila); una fila ya `bloqueada` rechaza cualquier destino con
   * `409 TRANSICION_DESDE_BLOQUEADO` (chequeo por estado actual) — esa transición pertenece
   * exclusivamente al flujo de `bloqueo-desbloqueo-cuentas`. `revokeAllForUser` corre después del
   * commit, solo cuando la fila cambió a `inactivo` (D6, mismo patrón D7 de `#4`/`#6`).
   */
  async cambiarEstado(
    id: string,
    destino: string,
    actorId: string,
  ): Promise<{ id: string; estado: EstadoUsuario }> {
    if (destino !== 'activo' && destino !== 'inactivo') {
      throw new BadRequestException({
        codigo: USERS_ERROR_CODES.ESTADO_DESTINO_NO_PERMITIDO,
        valor_recibido: destino,
      });
    }

    const resultado = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.usuario.findUnique({ where: { id } });
      if (!actual) {
        return { found: false as const, cambio: false };
      }

      if (actual.estado === 'bloqueado') {
        throw new ConflictException({
          codigo: USERS_ERROR_CODES.TRANSICION_DESDE_BLOQUEADO,
          estado_actual: 'bloqueado',
        });
      }

      if (actual.estado === destino) {
        return { found: true as const, cambio: false };
      }

      const { count } = await tx.usuario.updateMany({
        where: { id, estado: { in: ['activo', 'inactivo'] } },
        data: { estado: destino },
      });

      if (count === 1) {
        await this.auditoria.log(
          tx,
          destino === 'inactivo'
            ? AUDIT_EVENT_TYPES.USUARIO_DESACTIVADO
            : AUDIT_EVENT_TYPES.USUARIO_REACTIVADO,
          actorId,
          'Usuario',
          id,
          { estado_anterior: actual.estado } as Prisma.InputJsonValue,
        );
      }

      return { found: true as const, cambio: count === 1 };
    });

    if (!resultado.found) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (resultado.cambio && destino === 'inactivo') {
      await this.sessionService.revokeAllForUser(id);
    }

    return { id, estado: destino };
  }
}
