import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { OpcionConsulta, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { CANDIDATOS_ERROR_CODES } from './candidatos.errors';
import type { OpcionRespuestaDto } from './dto/opcion-respuesta.dto';

// candidatos-listas-opciones-consulta, PR3 (design.md D5, tarea 8.7). Forma mínima que `crear()`
// necesita de un alta de `OpcionConsulta`.
export interface DatosOpcion {
  proceso_id: string;
  etiqueta: string;
  descripcion?: string;
}

// design.md D5, tarea 8.7. `PATCH /opciones/:id` acepta cualquier subconjunto de estos campos —
// `proceso_id` NUNCA aparece acá a propósito (sin re-parentado, mismo criterio que `ListasService`).
export type DatosActualizarOpcion = Partial<Omit<DatosOpcion, 'proceso_id'>>;

export interface FiltroListadoOpciones {
  proceso_id?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// candidatos-listas-opciones-consulta, PR3 (mismo criterio module-local que `ListasService`: cada
// módulo declara sus propios traductores de error de Prisma, sin importar entre módulos de
// dominio).
function esP2002(error: unknown): error is { code: 'P2002'; meta?: { target?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

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

/** design.md D5, tarea 8.7. `etiqueta` es obligatoria y texto libre (spec: sin restricción A/B/C). */
function validarDatosOpcion(datos: Pick<DatosOpcion, 'etiqueta'>): void {
  if (!datos.etiqueta) {
    throw new BadRequestException({
      codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'etiqueta',
      motivo: 'requerido',
    });
  }
}

function mapearOpcionRespuesta(opcion: OpcionConsulta): OpcionRespuestaDto {
  return {
    id: opcion.id,
    proceso_id: opcion.proceso_id,
    etiqueta: opcion.etiqueta,
    descripcion: opcion.descripcion ?? undefined,
  };
}

/**
 * candidatos-listas-opciones-consulta, PR3 (design.md D5/D7/D9, tarea 8.7). CRUD de
 * `OpcionConsulta` acotada a un `ProcesoElectoral` existente. `OpcionConsulta` no tiene
 * `estado`/`baja_en` en el schema ⇒ sin baja lógica (design.md "Contratos HTTP"), solo borrado
 * guardado con precomprobación de `Voto` dependiente (D7).
 */
@Injectable()
export class OpcionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * D5/D9: precomprobación explícita de existencia de `ProcesoElectoral` y de unicidad de
   * `(proceso_id, etiqueta)`, más `catch P2002`/`P2003` residuales como red de seguridad (mismo
   * patrón que `ListasService.crear()`).
   */
  async crear(datos: DatosOpcion, actorId: string): Promise<OpcionRespuestaDto> {
    validarDatosOpcion(datos);

    try {
      const opcion = await this.prisma.$transaction(async (tx) => {
        const proceso = await tx.procesoElectoral.findUnique({ where: { id: datos.proceso_id } });
        if (!proceso) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'ProcesoElectoral',
            campo: 'proceso_id',
            valor: datos.proceso_id,
          });
        }

        const existente = await tx.opcionConsulta.findFirst({
          where: { proceso_id: datos.proceso_id, etiqueta: datos.etiqueta },
        });
        if (existente) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'OpcionConsulta',
            campos: ['proceso_id', 'etiqueta'],
          });
        }

        const creada = await tx.opcionConsulta.create({
          data: {
            proceso_id: datos.proceso_id,
            etiqueta: datos.etiqueta,
            descripcion: datos.descripcion,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.OPCION_CONSULTA_CREADA,
          actorId,
          'OpcionConsulta',
          creada.id,
          {
            proceso_id: creada.proceso_id,
            etiqueta: creada.etiqueta,
          } as Prisma.InputJsonValue,
        );

        return creada;
      });

      return mapearOpcionRespuesta(opcion);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'OpcionConsulta',
          campos: ['proceso_id', 'etiqueta'],
        });
      }
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

  /** design.md "Contratos HTTP", tarea 8.7. Filtro no-UUID -> `400 CAMPO_INVALIDO`. */
  async listar(filtro: FiltroListadoOpciones): Promise<OpcionRespuestaDto[]> {
    if (filtro.proceso_id !== undefined && !UUID_REGEX.test(filtro.proceso_id)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'proceso_id',
        motivo: 'formato',
      });
    }

    const where: Prisma.OpcionConsultaWhereInput = {};
    if (filtro.proceso_id !== undefined) {
      where.proceso_id = filtro.proceso_id;
    }

    const opciones = await this.prisma.opcionConsulta.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { etiqueta: 'asc' },
    });

    return opciones.map(mapearOpcionRespuesta);
  }

  async obtenerPorId(id: string): Promise<OpcionConsulta> {
    const opcion = await this.prisma.opcionConsulta.findUnique({ where: { id } });
    if (!opcion) {
      throw new NotFoundException('OpcionConsulta no encontrada');
    }
    return opcion;
  }

  /** GET /opciones/:id — spec "CRUD de Lista/Candidato/OpciónConsulta". */
  async detalle(id: string): Promise<OpcionRespuestaDto> {
    return mapearOpcionRespuesta(await this.obtenerPorId(id));
  }

  /**
   * D5/D9: sin re-parentado (`proceso_id` no está en `DatosActualizarOpcion`). `etiqueta` sigue
   * siendo única si cambia — misma precomprobación + `catch P2002` residual que `crear()`.
   */
  async actualizar(id: string, datos: DatosActualizarOpcion, actorId: string): Promise<OpcionRespuestaDto> {
    if (datos.etiqueta !== undefined && !datos.etiqueta) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'etiqueta',
        motivo: 'requerido',
      });
    }

    try {
      const opcion = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.opcionConsulta.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('OpcionConsulta no encontrada');
        }

        if (datos.etiqueta !== undefined && datos.etiqueta !== actual.etiqueta) {
          const existente = await tx.opcionConsulta.findFirst({
            where: { proceso_id: actual.proceso_id, etiqueta: datos.etiqueta, NOT: { id } },
          });
          if (existente) {
            throw new ConflictException({
              codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
              entidad: 'OpcionConsulta',
              campos: ['proceso_id', 'etiqueta'],
            });
          }
        }

        const actualizada = await tx.opcionConsulta.update({
          where: { id },
          data: {
            etiqueta: datos.etiqueta ?? undefined,
            descripcion: datos.descripcion ?? undefined,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.OPCION_CONSULTA_ACTUALIZADA,
          actorId,
          'OpcionConsulta',
          actualizada.id,
          { campos: Object.keys(datos) } as Prisma.InputJsonValue,
        );

        return actualizada;
      });

      return mapearOpcionRespuesta(opcion);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'OpcionConsulta',
          campos: ['proceso_id', 'etiqueta'],
        });
      }
      throw error;
    }
  }

  /**
   * D7, tarea 8.7, spec "Borrado físico rechazado con votos asociados, aplicado a OpciónConsulta".
   * Precomprobación explícita de `Voto` dependiente, más `catch P2003` residual como red de
   * seguridad (patrón literal de `ListasService.eliminar()`/`AulasService.eliminar()`).
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.opcionConsulta.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('OpcionConsulta no encontrada');
        }

        const votos = await tx.voto.count({ where: { opcion_id: id } });
        if (votos > 0) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'OpcionConsulta',
            relacion: 'Voto',
          });
        }

        await tx.opcionConsulta.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.OPCION_CONSULTA_ELIMINADA,
          actorId,
          'OpcionConsulta',
          id,
          {
            proceso_id: actual.proceso_id,
            etiqueta: actual.etiqueta,
          } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'OpcionConsulta',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
