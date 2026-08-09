import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Seccion } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMICO_ERROR_CODES } from './academico.errors';
import type { SeccionRespuestaDto } from './dto/seccion-respuesta.dto';
import { esP2002, esP2003, relacionDesdeFieldName, traducirRestriccion } from './prisma-errores';

// administracion-academica, PR5 (design.md D3/D5, tarea 17.11). Forma mínima que `crear()` necesita
// de un alta de `Seccion`.
export interface DatosSeccion {
  nombre: string;
  grado_id: string;
  anio_escolar_id: string;
}

// PR5 (design.md D3, tarea 16.1). `PATCH /secciones/:id` acepta solo `nombre` — `grado_id` y
// `anio_escolar_id` NUNCA aparecen aquí a propósito (D3, "sin re-parentado").
export type DatosActualizarSeccion = Partial<Pick<DatosSeccion, 'nombre'>>;

export interface FiltroListadoSecciones {
  grado_id?: string;
  anio_escolar_id?: string;
}

// UUID v4 no es un requisito estricto de este proyecto (`@db.Uuid` de Postgres acepta cualquier
// UUID válido, no solo v4) — mismo criterio laxo que `ParseUUIDPipe` de Nest, que valida contra
// cualquier versión de UUID por defecto.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapearSeccionRespuesta(seccion: Seccion): SeccionRespuestaDto {
  return {
    id: seccion.id,
    nombre: seccion.nombre,
    grado_id: seccion.grado_id,
    anio_escolar_id: seccion.anio_escolar_id,
  };
}

/**
 * administracion-academica, PR5 (design.md D2/D3/D5, tareas 17.1-17.11). CRUD de `Seccion` acotada
 * a un `Grado` y un `AnioEscolar` existentes — mismo idioma que `GradosService`, con dos
 * precomprobaciones de existencia (D2, "FK saliente") en vez de una.
 */
@Injectable()
export class SeccionesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * design.md "Contratos HTTP", tarea 17.5, spec "GET /secciones?grado_id=&anio_escolar_id=".
   * Filtro no-UUID -> `400 CAMPO_INVALIDO`, nunca un `500` de Prisma sobre un filtro malformado.
   */
  async listar(filtro: FiltroListadoSecciones): Promise<SeccionRespuestaDto[]> {
    if (filtro.grado_id !== undefined && !UUID_REGEX.test(filtro.grado_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'grado_id',
        motivo: 'formato',
      });
    }
    if (filtro.anio_escolar_id !== undefined && !UUID_REGEX.test(filtro.anio_escolar_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'anio_escolar_id',
        motivo: 'formato',
      });
    }

    const where: Prisma.SeccionWhereInput = {};
    if (filtro.grado_id !== undefined) {
      where.grado_id = filtro.grado_id;
    }
    if (filtro.anio_escolar_id !== undefined) {
      where.anio_escolar_id = filtro.anio_escolar_id;
    }

    const secciones = await this.prisma.seccion.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { nombre: 'asc' },
    });

    return secciones.map(mapearSeccionRespuesta);
  }

  /** GET /secciones/:id — spec "CRUD de Sección". */
  async obtenerPorId(id: string): Promise<SeccionRespuestaDto> {
    const seccion = await this.prisma.seccion.findUnique({ where: { id } });
    if (!seccion) {
      throw new NotFoundException('Seccion no encontrada');
    }
    return mapearSeccionRespuesta(seccion);
  }

  /**
   * D2/D5: precomprobación de existencia del `Grado` y del `AnioEscolar` referenciados,
   * precomprobación de unicidad de `(grado_id, anio_escolar_id, nombre)`, más `catch
   * P2002`/`P2003` residuales como red de seguridad.
   */
  async crear(datos: DatosSeccion, actorId: string): Promise<SeccionRespuestaDto> {
    try {
      const seccion = await this.prisma.$transaction(async (tx) => {
        const grado = await tx.grado.findUnique({ where: { id: datos.grado_id } });
        if (!grado) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Grado',
            campo: 'grado_id',
            valor: datos.grado_id,
          });
        }

        const anioEscolar = await tx.anioEscolar.findUnique({ where: { id: datos.anio_escolar_id } });
        if (!anioEscolar) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'AnioEscolar',
            campo: 'anio_escolar_id',
            valor: datos.anio_escolar_id,
          });
        }

        const existente = await tx.seccion.findFirst({
          where: {
            grado_id: datos.grado_id,
            anio_escolar_id: datos.anio_escolar_id,
            nombre: datos.nombre,
          },
        });
        if (existente) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Seccion',
            campos: ['grado_id', 'anio_escolar_id', 'nombre'],
          });
        }

        const creada = await tx.seccion.create({
          data: {
            nombre: datos.nombre,
            grado_id: datos.grado_id,
            anio_escolar_id: datos.anio_escolar_id,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.SECCION_CREADA,
          actorId,
          'Seccion',
          creada.id,
          {
            grado_id: creada.grado_id,
            anio_escolar_id: creada.anio_escolar_id,
            nombre: creada.nombre,
          } as Prisma.InputJsonValue,
        );

        return creada;
      });

      return mapearSeccionRespuesta(seccion);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Seccion',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'Grado',
          campo: 'grado_id',
          valor: datos.grado_id,
        });
      }
      throw error;
    }
  }

  /**
   * D3: sin `grado_id`/`anio_escolar_id` en el DTO de actualización — sin cambios efectivos de
   * `nombre` es un no-op.
   */
  async actualizar(
    id: string,
    datos: DatosActualizarSeccion,
    actorId: string,
  ): Promise<SeccionRespuestaDto> {
    try {
      const seccion = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.seccion.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Seccion no encontrada');
        }

        if (datos.nombre === undefined || datos.nombre === actual.nombre) {
          return actual;
        }

        const colision = await tx.seccion.findFirst({
          where: {
            grado_id: actual.grado_id,
            anio_escolar_id: actual.anio_escolar_id,
            nombre: datos.nombre,
            id: { not: id },
          },
        });
        if (colision) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Seccion',
            campos: ['grado_id', 'anio_escolar_id', 'nombre'],
          });
        }

        const actualizada = await tx.seccion.update({
          where: { id },
          data: { nombre: datos.nombre },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.SECCION_ACTUALIZADA,
          actorId,
          'Seccion',
          actualizada.id,
          { campos: ['nombre'] } as Prisma.InputJsonValue,
        );

        return actualizada;
      });

      return mapearSeccionRespuesta(seccion);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Seccion',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * design.md D2, tarea 17.8-17.10, spec "CRUD de Sección". Precomprobación explícita de `Aula`
   * dependiente, más `catch P2003` residual como red de seguridad.
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.seccion.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Seccion no encontrada');
        }

        const aulas = await tx.aula.count({ where: { seccion_id: id } });
        if (aulas > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Seccion',
            relacion: 'Aula',
          });
        }

        await tx.seccion.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.SECCION_ELIMINADA,
          actorId,
          'Seccion',
          id,
          {
            grado_id: actual.grado_id,
            anio_escolar_id: actual.anio_escolar_id,
            nombre: actual.nombre,
          } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'Seccion',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
