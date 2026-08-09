import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Nivel, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMICO_ERROR_CODES } from './academico.errors';
import type { NivelRespuestaDto } from './dto/nivel-respuesta.dto';
import { esP2002, esP2003, relacionDesdeFieldName, traducirRestriccion } from './prisma-errores';

// administracion-academica, PR4 (design.md D3/D5, tarea 13.10). Forma mínima que `crear()` necesita
// de un alta de `Nivel`.
export interface DatosNivel {
  nombre: string;
}

// PR4 (design.md D3, tarea 12.1). `PATCH /niveles/:id` acepta solo `nombre`.
export type DatosActualizarNivel = Partial<DatosNivel>;

function mapearNivelRespuesta(nivel: Nivel): NivelRespuestaDto {
  return {
    id: nivel.id,
    nombre: nivel.nombre,
  };
}

/**
 * administracion-academica, PR4 (design.md D2/D3/D5, tareas 13.1-13.10). CRUD de `Nivel` — mismo
 * idioma que `AniosEscolaresService` de PR2: precomprobación de unicidad más `catch P2002`
 * residual en `crear()`/`actualizar()`, precomprobación de dependientes (`Grado`) más `catch P2003`
 * residual en `eliminar()`.
 */
@Injectable()
export class NivelesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** design.md "Contratos HTTP", tarea 13.x, spec "CRUD de Nivel". Sin paginación, `orderBy nombre asc`. */
  async listar(): Promise<NivelRespuestaDto[]> {
    const niveles = await this.prisma.nivel.findMany({ orderBy: { nombre: 'asc' } });
    return niveles.map(mapearNivelRespuesta);
  }

  /** GET /niveles/:id — spec "CRUD de Nivel". */
  async obtenerPorId(id: string): Promise<NivelRespuestaDto> {
    const nivel = await this.prisma.nivel.findUnique({ where: { id } });
    if (!nivel) {
      throw new NotFoundException('Nivel no encontrado');
    }
    return mapearNivelRespuesta(nivel);
  }

  /**
   * D5: precomprobación de unicidad de `nombre` dentro de la misma `$transaction`, más `catch
   * P2002` residual como red de seguridad — mismo idioma que `AniosEscolaresService.crear()`.
   */
  async crear(datos: DatosNivel, actorId: string): Promise<NivelRespuestaDto> {
    try {
      const nivel = await this.prisma.$transaction(async (tx) => {
        const existente = await tx.nivel.findFirst({ where: { nombre: datos.nombre } });
        if (existente) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Nivel',
            campos: ['nombre'],
          });
        }

        const creado = await tx.nivel.create({ data: { nombre: datos.nombre } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.NIVEL_CREADO,
          actorId,
          'Nivel',
          creado.id,
          { nombre: creado.nombre } as Prisma.InputJsonValue,
        );

        return creado;
      });

      return mapearNivelRespuesta(nivel);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Nivel',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * D3: sin cambios efectivos es un no-op: no dispara el chequeo de unicidad ni audita — mismo
   * criterio de "sin cambio, sin efecto" que `AniosEscolaresService.actualizar()`.
   */
  async actualizar(
    id: string,
    datos: DatosActualizarNivel,
    actorId: string,
  ): Promise<NivelRespuestaDto> {
    try {
      const nivel = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.nivel.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Nivel no encontrado');
        }

        const camposModificados = (['nombre'] as Array<keyof DatosNivel>).filter(
          (campo) => datos[campo] !== undefined && datos[campo] !== actual[campo],
        );

        if (camposModificados.length === 0) {
          return actual;
        }

        if (datos.nombre !== undefined) {
          const colision = await tx.nivel.findFirst({
            where: { nombre: datos.nombre, id: { not: id } },
          });
          if (colision) {
            throw new ConflictException({
              codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
              entidad: 'Nivel',
              campos: ['nombre'],
            });
          }
        }

        const actualizado = await tx.nivel.update({
          where: { id },
          data: { nombre: datos.nombre },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.NIVEL_ACTUALIZADO,
          actorId,
          'Nivel',
          actualizado.id,
          { campos: camposModificados } as Prisma.InputJsonValue,
        );

        return actualizado;
      });

      return mapearNivelRespuesta(nivel);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Nivel',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      throw error;
    }
  }

  /**
   * design.md D2, tareas 13.6-13.9, spec "Eliminación rechazada por Grado dependiente".
   * Precomprobación explícita de `Grado` dependiente dentro de la misma `$transaction`, más `catch
   * P2003` residual como red de seguridad para la carrera `SELECT COUNT`<->`DELETE`.
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.nivel.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Nivel no encontrado');
        }

        const grados = await tx.grado.count({ where: { nivel_id: id } });
        if (grados > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Nivel',
            relacion: 'Grado',
          });
        }

        await tx.nivel.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.NIVEL_ELIMINADO,
          actorId,
          'Nivel',
          id,
          { nombre: actual.nombre } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'Nivel',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
