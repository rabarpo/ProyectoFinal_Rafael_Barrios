import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { AnioEscolar, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMICO_ERROR_CODES } from './academico.errors';
import type { AnioEscolarRespuestaDto } from './dto/anio-escolar-respuesta.dto';
import { esP2002, esP2003, relacionDesdeFieldName, traducirRestriccion } from './prisma-errores';

// administracion-academica, PR2 (design.md D3/D5, tarea 7.8). Forma mínima que `crear()` necesita
// de un alta de `AnioEscolar`.
export interface DatosAnioEscolar {
  nombre: string;
}

// PR2 (design.md D3, tarea 6.1/7.7). `PATCH /anios-escolares/:id` acepta solo `nombre` — `activo`
// NUNCA aparece aquí a propósito: el DTO (`ActualizarAnioEscolarDto`) no lo declara, así que mover
// el estado de activación exige el endpoint dedicado de PR3.
export type DatosActualizarAnioEscolar = Partial<DatosAnioEscolar>;

export interface FiltroListadoAniosEscolares {
  activo?: string;
}

function mapearAnioEscolarRespuesta(anioEscolar: AnioEscolar): AnioEscolarRespuestaDto {
  return {
    id: anioEscolar.id,
    nombre: anioEscolar.nombre,
    activo: anioEscolar.activo,
  };
}

/**
 * administracion-academica, PR2 (design.md D2/D3/D5, tareas 7.8/8.6). CRUD de `AnioEscolar` sin la
 * activación exclusiva (`PATCH :id/activar` llega en PR3, design.md "Corte de PR recomendado").
 */
@Injectable()
export class AniosEscolaresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * design.md "Contratos HTTP", tarea 7.8, spec "CRUD de AñoEscolar". Sin paginación, `orderBy
   * nombre asc`, arreglo desnudo — mismo criterio que `UsersService.listar()`.
   */
  async listar(filtro: FiltroListadoAniosEscolares): Promise<AnioEscolarRespuestaDto[]> {
    let activo: boolean | undefined;
    if (filtro.activo !== undefined) {
      if (filtro.activo !== 'true' && filtro.activo !== 'false') {
        throw new BadRequestException({
          codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
          campo: 'activo',
          motivo: 'formato',
        });
      }
      activo = filtro.activo === 'true';
    }

    const aniosEscolares = await this.prisma.anioEscolar.findMany({
      where: activo !== undefined ? { activo } : undefined,
      orderBy: { nombre: 'asc' },
    });

    return aniosEscolares.map(mapearAnioEscolarRespuesta);
  }

  /** GET /anios-escolares/:id — spec "CRUD de AñoEscolar". */
  async obtenerPorId(id: string): Promise<AnioEscolarRespuestaDto> {
    const anioEscolar = await this.prisma.anioEscolar.findUnique({ where: { id } });
    if (!anioEscolar) {
      throw new NotFoundException('Año escolar no encontrado');
    }
    return mapearAnioEscolarRespuesta(anioEscolar);
  }

  /**
   * D5: precomprobación de unicidad de `nombre` dentro de la misma `$transaction`, más `catch
   * P2002` residual como red de seguridad (carrera precheck<->create) — mismo idioma que
   * `UsersService.crear()`. `activo = false` siempre en la creación (spec "Creación exitosa").
   */
  async crear(datos: DatosAnioEscolar, actorId: string): Promise<AnioEscolarRespuestaDto> {
    try {
      const anioEscolar = await this.prisma.$transaction(async (tx) => {
        const existente = await tx.anioEscolar.findFirst({ where: { nombre: datos.nombre } });
        if (existente) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'AnioEscolar',
            campos: ['nombre'],
          });
        }

        const creado = await tx.anioEscolar.create({
          data: { nombre: datos.nombre, activo: false },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.ANIO_ESCOLAR_CREADO,
          actorId,
          'AnioEscolar',
          creado.id,
          { nombre: creado.nombre } as Prisma.InputJsonValue,
        );

        return creado;
      });

      return mapearAnioEscolarRespuesta(anioEscolar);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'AnioEscolar',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * D3: sin cambios efectivos (nombre enviado coincide con el actual, o no se envía) es un no-op:
   * no dispara el chequeo de unicidad ni audita — mismo criterio de "sin cambio, sin efecto" que
   * `UsersService.actualizar()`.
   */
  async actualizar(
    id: string,
    datos: DatosActualizarAnioEscolar,
    actorId: string,
  ): Promise<AnioEscolarRespuestaDto> {
    try {
      const anioEscolar = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.anioEscolar.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Año escolar no encontrado');
        }

        const camposModificados = (['nombre'] as Array<keyof DatosAnioEscolar>).filter(
          (campo) => datos[campo] !== undefined && datos[campo] !== actual[campo],
        );

        if (camposModificados.length === 0) {
          return actual;
        }

        if (datos.nombre !== undefined) {
          const colision = await tx.anioEscolar.findFirst({
            where: { nombre: datos.nombre, id: { not: id } },
          });
          if (colision) {
            throw new ConflictException({
              codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
              entidad: 'AnioEscolar',
              campos: ['nombre'],
            });
          }
        }

        const actualizado = await tx.anioEscolar.update({
          where: { id },
          data: { nombre: datos.nombre },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.ANIO_ESCOLAR_ACTUALIZADO,
          actorId,
          'AnioEscolar',
          actualizado.id,
          { campos: camposModificados } as Prisma.InputJsonValue,
        );

        return actualizado;
      });

      return mapearAnioEscolarRespuesta(anioEscolar);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'AnioEscolar',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * design.md D2, tareas 8.1-8.6, spec "DELETE físico de AñoEscolar con guarda de integridad
   * referencial". Precomprobación explícita de los 4 dependientes (`Seccion`, `Aula`, `Matricula`,
   * `Configuracion`) dentro de la misma `$transaction`, en ese orden, más `catch P2003` residual
   * como red de seguridad para la carrera `SELECT COUNT`<->`DELETE` — ninguna violación de FK
   * escapa como `500` (D2).
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.anioEscolar.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Año escolar no encontrado');
        }

        const [secciones, aulas, matriculas, configuraciones] = await Promise.all([
          tx.seccion.count({ where: { anio_escolar_id: id } }),
          tx.aula.count({ where: { anio_escolar_id: id } }),
          tx.matricula.count({ where: { anio_escolar_id: id } }),
          tx.configuracion.count({ where: { anio_escolar_id: id } }),
        ]);

        if (secciones > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'AnioEscolar',
            relacion: 'Seccion',
          });
        }
        if (aulas > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'AnioEscolar',
            relacion: 'Aula',
          });
        }
        if (matriculas > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'AnioEscolar',
            relacion: 'Matricula',
          });
        }
        if (configuraciones > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'AnioEscolar',
            relacion: 'Configuracion',
          });
        }

        await tx.anioEscolar.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.ANIO_ESCOLAR_ELIMINADO,
          actorId,
          'AnioEscolar',
          id,
          { nombre: actual.nombre } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'AnioEscolar',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
