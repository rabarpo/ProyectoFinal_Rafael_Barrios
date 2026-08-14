import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Candidato, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { CANDIDATOS_ERROR_CODES } from './candidatos.errors';
import type { CandidatoRespuestaDto } from './dto/candidato-respuesta.dto';

// candidatos-listas-opciones-consulta, PR4 (design.md D4/D6, tarea 11.9). Forma mínima que
// `crear()`/`actualizar()` necesitan de un alta/edición de `Candidato`. Todos los escalares son
// `String` (D4) porque viajan como multipart/form-data — sin coerción manual.
export interface DatosCandidato {
  proceso_id: string;
  nombres: string;
  grado?: string;
  aula?: string;
  cargo?: string;
  lista_id?: string;
}

export type DatosActualizarCandidato = Partial<Omit<DatosCandidato, 'proceso_id'>>;

export interface FiltroListadoCandidatos {
  proceso_id?: string;
  lista_id?: string;
  estado?: string;
}

export interface ArchivoFoto {
  buffer: Buffer;
  mimetype: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_VALIDOS = ['activo', 'baja'] as const;

// candidatos-listas-opciones-consulta, PR4 (mismo criterio module-local que
// `ListasService`/`OpcionesService`: cada módulo declara sus propios traductores de error de
// Prisma, sin importar entre módulos de dominio).
function esP2003(error: unknown): error is { code: 'P2003'; meta?: { field_name?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}

function relacionDesdeFieldName(fieldName: unknown): string {
  if (typeof fieldName !== 'string' || fieldName.length === 0) {
    return 'desconocida';
  }
  const separador = fieldName.indexOf('_');
  const relacion = separador === -1 ? fieldName : fieldName.slice(0, separador);
  return relacion.length > 0 ? relacion : 'desconocida';
}

/** design.md D4, tarea 11.9. `nombres` es obligatorio en la creación. */
function validarDatosCandidato(datos: Pick<DatosCandidato, 'nombres'>): void {
  if (!datos.nombres) {
    throw new BadRequestException({
      codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'nombres',
      motivo: 'requerido',
    });
  }
}

function mapearCandidatoRespuesta(candidato: Candidato): CandidatoRespuestaDto {
  return {
    id: candidato.id,
    proceso_id: candidato.proceso_id,
    lista_id: candidato.lista_id ?? undefined,
    nombres: candidato.nombres,
    grado: candidato.grado ?? undefined,
    aula: candidato.aula ?? undefined,
    cargo: candidato.cargo ?? undefined,
    foto_presente: candidato.foto !== null,
    foto_mime: candidato.foto_mime ?? undefined,
    estado: candidato.estado,
    baja_en: candidato.baja_en ? candidato.baja_en.toISOString() : undefined,
  };
}

/**
 * candidatos-listas-opciones-consulta, PR4 (design.md D4/D6/D7/D9, tareas 11.9/12.5). CRUD de
 * `Candidato` acotado a un `ProcesoElectoral` existente, foto obligatoria al crear (D2/D4), baja
 * distinta del borrado físico (D6) y borrado guardado con precomprobación de `Voto` dependiente
 * (D7). Espeja `ListasService`; la foto viaja en el mismo request de alta/edición (multipart, D4).
 */
@Injectable()
export class CandidatosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * D4: `!archivo` ⇒ 400 FOTO_REQUERIDA (la foto ya pasó `filtroFoto` en el `fileFilter` antes de
   * llegar acá, así que solo queda comprobar ausencia/vacío, igual que `subirPlanTrabajo`).
   * D9: precomprobación explícita de `ProcesoElectoral` y, si aplica, de `Lista` (coherencia
   * jerárquica con `proceso_id`), más `catch P2003` residual como red de seguridad.
   */
  async crear(datos: DatosCandidato, archivo: ArchivoFoto | undefined, actorId: string): Promise<CandidatoRespuestaDto> {
    validarDatosCandidato(datos);

    if (!archivo) {
      throw new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.FOTO_REQUERIDA });
    }
    if (archivo.buffer.length === 0) {
      throw new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.ARCHIVO_VACIO });
    }

    try {
      const candidato = await this.prisma.$transaction(async (tx) => {
        const proceso = await tx.procesoElectoral.findUnique({ where: { id: datos.proceso_id } });
        if (!proceso) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'ProcesoElectoral',
            campo: 'proceso_id',
            valor: datos.proceso_id,
          });
        }

        if (datos.lista_id !== undefined) {
          const lista = await tx.lista.findUnique({ where: { id: datos.lista_id } });
          if (!lista) {
            throw new ConflictException({
              codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
              entidad: 'Lista',
              campo: 'lista_id',
              valor: datos.lista_id,
            });
          }
          if (lista.proceso_id !== datos.proceso_id) {
            throw new ConflictException({
              codigo: CANDIDATOS_ERROR_CODES.COHERENCIA_JERARQUICA,
              entidad: 'Lista',
              campo: 'lista_id',
            });
          }
        }

        const creado = await tx.candidato.create({
          data: {
            proceso_id: datos.proceso_id,
            lista_id: datos.lista_id,
            nombres: datos.nombres,
            grado: datos.grado,
            aula: datos.aula,
            cargo: datos.cargo,
            foto: archivo.buffer,
            foto_mime: archivo.mimetype,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.CANDIDATO_CREADO,
          actorId,
          'Candidato',
          creado.id,
          {
            proceso_id: creado.proceso_id,
            lista_id: creado.lista_id,
            nombres: creado.nombres,
          } as Prisma.InputJsonValue,
        );

        return creado;
      });

      return mapearCandidatoRespuesta(candidato);
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'ProcesoElectoral',
          campo: 'proceso_id',
          valor: datos.proceso_id,
        });
      }
      throw error;
    }
  }

  /** design.md "Contratos HTTP", tarea 11.9. Filtro no-UUID/estado fuera de enum -> `400 CAMPO_INVALIDO`. */
  async listar(filtro: FiltroListadoCandidatos): Promise<CandidatoRespuestaDto[]> {
    if (filtro.proceso_id !== undefined && !UUID_REGEX.test(filtro.proceso_id)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'proceso_id',
        motivo: 'formato',
      });
    }
    if (filtro.lista_id !== undefined && !UUID_REGEX.test(filtro.lista_id)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'lista_id',
        motivo: 'formato',
      });
    }
    if (filtro.estado !== undefined && !(ESTADOS_VALIDOS as readonly string[]).includes(filtro.estado)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'estado',
        motivo: 'formato',
      });
    }

    const where: Prisma.CandidatoWhereInput = {};
    if (filtro.proceso_id !== undefined) {
      where.proceso_id = filtro.proceso_id;
    }
    if (filtro.lista_id !== undefined) {
      where.lista_id = filtro.lista_id;
    }
    if (filtro.estado !== undefined) {
      where.estado = filtro.estado as Candidato['estado'];
    }

    const candidatos = await this.prisma.candidato.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { nombres: 'asc' },
    });

    return candidatos.map(mapearCandidatoRespuesta);
  }

  async obtenerPorId(id: string): Promise<Candidato> {
    const candidato = await this.prisma.candidato.findUnique({ where: { id } });
    if (!candidato) {
      throw new NotFoundException('Candidato no encontrado');
    }
    return candidato;
  }

  /** GET /candidatos/:id — spec "CRUD de Lista/Candidato/OpciónConsulta". */
  async detalle(id: string): Promise<CandidatoRespuestaDto> {
    return mapearCandidatoRespuesta(await this.obtenerPorId(id));
  }

  /**
   * D4/D9: sin re-parentado de `proceso_id`. `foto` es opcional en edición — si se omite, la foto
   * persistida no cambia (D4). Si se envía, reemplaza `foto`/`foto_mime` en la misma transacción y
   * se reporta como `CANDIDATO_ACTUALIZADO` con `campos` incluyendo `'foto'` (D9).
   */
  async actualizar(
    id: string,
    datos: DatosActualizarCandidato,
    archivo: ArchivoFoto | undefined,
    actorId: string,
  ): Promise<CandidatoRespuestaDto> {
    if (datos.nombres !== undefined && !datos.nombres) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'nombres',
        motivo: 'requerido',
      });
    }
    if (archivo !== undefined && archivo.buffer.length === 0) {
      throw new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.ARCHIVO_VACIO });
    }

    const candidato = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.candidato.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Candidato no encontrado');
      }

      const procesoDestino = actual.proceso_id;
      if (datos.lista_id !== undefined) {
        const lista = await tx.lista.findUnique({ where: { id: datos.lista_id } });
        if (!lista) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Lista',
            campo: 'lista_id',
            valor: datos.lista_id,
          });
        }
        if (lista.proceso_id !== procesoDestino) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.COHERENCIA_JERARQUICA,
            entidad: 'Lista',
            campo: 'lista_id',
          });
        }
      }

      const actualizado = await tx.candidato.update({
        where: { id },
        data: {
          nombres: datos.nombres ?? undefined,
          grado: datos.grado ?? undefined,
          aula: datos.aula ?? undefined,
          cargo: datos.cargo ?? undefined,
          lista_id: datos.lista_id ?? undefined,
          foto: archivo ? archivo.buffer : undefined,
          foto_mime: archivo ? archivo.mimetype : undefined,
        },
      });

      const campos = Object.keys(datos);
      if (archivo) {
        campos.push('foto');
      }

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.CANDIDATO_ACTUALIZADO,
        actorId,
        'Candidato',
        actualizado.id,
        { campos } as Prisma.InputJsonValue,
      );

      return actualizado;
    });

    return mapearCandidatoRespuesta(candidato);
  }

  /**
   * D6, tarea 12.5, spec "Baja de candidato con proceso abierto". `estado` expresa el ESTADO
   * DESTINO — `baja` fija `baja_en=now()`, `activo` (reactivación) lo limpia. Permitido en
   * cualquier `Proceso.estado` (D6): esta operación nunca consulta `Proceso.estado`.
   */
  async cambiarEstado(id: string, destino: string, actorId: string): Promise<CandidatoRespuestaDto> {
    if (!(ESTADOS_VALIDOS as readonly string[]).includes(destino)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.ESTADO_INVALIDO,
        valor_recibido: destino,
      });
    }

    const candidato = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.candidato.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Candidato no encontrado');
      }

      if (actual.estado === destino) {
        return actual;
      }

      const actualizado = await tx.candidato.update({
        where: { id },
        data: {
          estado: destino as Candidato['estado'],
          baja_en: destino === 'baja' ? new Date() : null,
        },
      });

      await this.auditoria.log(
        tx,
        destino === 'baja' ? AUDIT_EVENT_TYPES.CANDIDATO_DADO_DE_BAJA : AUDIT_EVENT_TYPES.CANDIDATO_REACTIVADO,
        actorId,
        'Candidato',
        id,
        { estado_anterior: actual.estado } as Prisma.InputJsonValue,
      );

      return actualizado;
    });

    return mapearCandidatoRespuesta(candidato);
  }

  /**
   * D8, tarea 14.4, spec "Foto válida se almacena y se sirve". `candidato.foto` es nullable en la
   * DB (D2) aunque el servicio la exige al crear (D4) — precomprobación defensiva por si el dato
   * quedó ausente (p. ej. fila creada directamente contra la DB, como en los fixtures e2e). Mismo
   * criterio que `ListasService.obtenerPlanTrabajo()`, con `codigo: ARCHIVO_NO_ENCONTRADO` acorde a
   * tarea 14.1.
   */
  async obtenerFoto(id: string): Promise<{ buffer: Buffer; mime: string }> {
    const candidato = await this.obtenerPorId(id);
    if (!candidato.foto) {
      throw new NotFoundException({ codigo: CANDIDATOS_ERROR_CODES.ARCHIVO_NO_ENCONTRADO });
    }
    return { buffer: candidato.foto, mime: candidato.foto_mime ?? 'image/png' };
  }

  /**
   * D7, tarea 12.5, spec "Borrado físico rechazado con votos asociados". Precomprobación explícita
   * de `Voto` dependiente, más `catch P2003` residual como red de seguridad (patrón literal de
   * `ListasService.eliminar()`/`OpcionesService.eliminar()`).
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.candidato.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Candidato no encontrado');
        }

        const votos = await tx.voto.count({ where: { candidato_id: id } });
        if (votos > 0) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Candidato',
            relacion: 'Voto',
          });
        }

        await tx.candidato.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.CANDIDATO_ELIMINADO,
          actorId,
          'Candidato',
          id,
          {
            proceso_id: actual.proceso_id,
            nombres: actual.nombres,
          } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'Candidato',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
