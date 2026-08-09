import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Grado, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMICO_ERROR_CODES } from './academico.errors';
import type { GradoRespuestaDto } from './dto/grado-respuesta.dto';
import { esP2002, esP2003, relacionDesdeFieldName, traducirRestriccion } from './prisma-errores';

// administracion-academica, PR4 (design.md D3/D5, tarea 14.10). Forma mínima que `crear()` necesita
// de un alta de `Grado`.
export interface DatosGrado {
  nombre: string;
  nivel_id: string;
}

// PR4 (design.md D3, tarea 12.2). `PATCH /grados/:id` acepta solo `nombre` — `nivel_id` NUNCA
// aparece aquí a propósito (D3, "sin re-parentado").
export type DatosActualizarGrado = Partial<Pick<DatosGrado, 'nombre'>>;

export interface FiltroListadoGrados {
  nivel_id?: string;
}

// UUID v4 no es un requisito estricto de este proyecto (`@db.Uuid` de Postgres acepta cualquier
// UUID válido, no solo v4) — mismo criterio laxo que `ParseUUIDPipe` de Nest, que valida contra
// cualquier versión de UUID por defecto.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapearGradoRespuesta(grado: Grado): GradoRespuestaDto {
  return {
    id: grado.id,
    nombre: grado.nombre,
    nivel_id: grado.nivel_id,
  };
}

/**
 * administracion-academica, PR4 (design.md D2/D3/D5, tareas 14.1-14.10). CRUD de `Grado` acotado a
 * un `Nivel` existente — mismo idioma que `AniosEscolaresService`/`NivelesService`, con la
 * precomprobación adicional de existencia del `Nivel` referenciado (D2, "FK saliente").
 */
@Injectable()
export class GradosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * design.md "Contratos HTTP", tarea 14.4, spec "GET /grados?nivel_id=". `nivel_id` no-UUID ->
   * `400 CAMPO_INVALIDO`, nunca un `500` de Prisma sobre un filtro malformado.
   */
  async listar(filtro: FiltroListadoGrados): Promise<GradoRespuestaDto[]> {
    if (filtro.nivel_id !== undefined && !UUID_REGEX.test(filtro.nivel_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'nivel_id',
        motivo: 'formato',
      });
    }

    const grados = await this.prisma.grado.findMany({
      where: filtro.nivel_id !== undefined ? { nivel_id: filtro.nivel_id } : undefined,
      orderBy: { nombre: 'asc' },
    });

    return grados.map(mapearGradoRespuesta);
  }

  /** GET /grados/:id — spec "CRUD de Grado". */
  async obtenerPorId(id: string): Promise<GradoRespuestaDto> {
    const grado = await this.prisma.grado.findUnique({ where: { id } });
    if (!grado) {
      throw new NotFoundException('Grado no encontrado');
    }
    return mapearGradoRespuesta(grado);
  }

  /**
   * D2/D5: precomprobación de existencia del `Nivel` referenciado, precomprobación de unicidad de
   * `(nivel_id, nombre)`, más `catch P2002`/`P2003` residuales como red de seguridad.
   */
  async crear(datos: DatosGrado, actorId: string): Promise<GradoRespuestaDto> {
    try {
      const grado = await this.prisma.$transaction(async (tx) => {
        const nivel = await tx.nivel.findUnique({ where: { id: datos.nivel_id } });
        if (!nivel) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Nivel',
            campo: 'nivel_id',
            valor: datos.nivel_id,
          });
        }

        const existente = await tx.grado.findFirst({
          where: { nivel_id: datos.nivel_id, nombre: datos.nombre },
        });
        if (existente) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Grado',
            campos: ['nivel_id', 'nombre'],
          });
        }

        const creado = await tx.grado.create({
          data: { nombre: datos.nombre, nivel_id: datos.nivel_id },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.GRADO_CREADO,
          actorId,
          'Grado',
          creado.id,
          { nivel_id: creado.nivel_id, nombre: creado.nombre } as Prisma.InputJsonValue,
        );

        return creado;
      });

      return mapearGradoRespuesta(grado);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Grado',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'Nivel',
          campo: 'nivel_id',
          valor: datos.nivel_id,
        });
      }
      throw error;
    }
  }

  /**
   * D3: sin `nivel_id` en el DTO de actualización — sin cambios efectivos de `nombre` es un no-op.
   */
  async actualizar(
    id: string,
    datos: DatosActualizarGrado,
    actorId: string,
  ): Promise<GradoRespuestaDto> {
    try {
      const grado = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.grado.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Grado no encontrado');
        }

        if (datos.nombre === undefined || datos.nombre === actual.nombre) {
          return actual;
        }

        const colision = await tx.grado.findFirst({
          where: { nivel_id: actual.nivel_id, nombre: datos.nombre, id: { not: id } },
        });
        if (colision) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Grado',
            campos: ['nivel_id', 'nombre'],
          });
        }

        const actualizado = await tx.grado.update({
          where: { id },
          data: { nombre: datos.nombre },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.GRADO_ACTUALIZADO,
          actorId,
          'Grado',
          actualizado.id,
          { campos: ['nombre'] } as Prisma.InputJsonValue,
        );

        return actualizado;
      });

      return mapearGradoRespuesta(grado);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Grado',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * design.md D2, tareas 14.7-14.9, spec "CRUD de Grado". Precomprobación explícita de `Seccion` y
   * `Aula` dependientes, en ese orden, más `catch P2003` residual como red de seguridad.
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.grado.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Grado no encontrado');
        }

        const [secciones, aulas] = await Promise.all([
          tx.seccion.count({ where: { grado_id: id } }),
          tx.aula.count({ where: { grado_id: id } }),
        ]);

        if (secciones > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Grado',
            relacion: 'Seccion',
          });
        }
        if (aulas > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Grado',
            relacion: 'Aula',
          });
        }

        await tx.grado.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.GRADO_ELIMINADO,
          actorId,
          'Grado',
          id,
          { nivel_id: actual.nivel_id, nombre: actual.nombre } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'Grado',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
