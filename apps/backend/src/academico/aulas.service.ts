import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Aula, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMICO_ERROR_CODES } from './academico.errors';
import type { AulaRespuestaDto } from './dto/aula-respuesta.dto';
import { esP2002, esP2003, relacionDesdeFieldName, traducirRestriccion } from './prisma-errores';

// administracion-academica, PR6 (design.md D3/D5, tarea 19.1). Forma mínima que `crear()` necesita
// de un alta de `Aula`.
export interface DatosAula {
  turno: string;
  grado_id: string;
  seccion_id: string;
  anio_escolar_id: string;
}

// PR6 (design.md D3, tarea 19.1). `PATCH /aulas/:id` acepta solo `turno` — ninguna FK NUNCA
// aparece aquí a propósito (D3, "sin re-parentado").
export type DatosActualizarAula = Partial<Pick<DatosAula, 'turno'>>;

export interface FiltroListadoAulas {
  grado_id?: string;
  seccion_id?: string;
  anio_escolar_id?: string;
  turno?: string;
}

// UUID v4 no es un requisito estricto de este proyecto (`@db.Uuid` de Postgres acepta cualquier
// UUID válido, no solo v4) — mismo criterio laxo que `ParseUUIDPipe` de Nest, que valida contra
// cualquier versión de UUID por defecto.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TURNOS_VALIDOS = ['manana', 'tarde'] as const;

/**
 * design.md D5, tarea 20.1-20.2. Valida que `turno` sea uno de `{manana, tarde}` — Jest puro, sin
 * base, reutilizado por `crear()`, `actualizar()` y el filtro de `listar()`. Lanza `400
 * CAMPO_INVALIDO` en vez de dejar propagar un valor arbitrario hasta Prisma.
 */
export function validarTurno(turno: unknown): void {
  if (typeof turno !== 'string' || !(TURNOS_VALIDOS as readonly string[]).includes(turno)) {
    throw new BadRequestException({
      codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'turno',
      motivo: 'formato',
    });
  }
}

function mapearAulaRespuesta(aula: Aula): AulaRespuestaDto {
  return {
    id: aula.id,
    turno: aula.turno,
    grado_id: aula.grado_id,
    seccion_id: aula.seccion_id,
    anio_escolar_id: aula.anio_escolar_id,
  };
}

/**
 * administracion-academica, PR6 (design.md D2/D3/D5/D6, tareas 21.1-21.10, 22.1-22.3). CRUD de
 * `Aula` acotada a un `Grado`, una `Seccion` y un `AnioEscolar` existentes, con la guarda de
 * coherencia jerárquica (D6): tras resolver los tres padres dentro de la misma `$transaction`, se
 * compara `grado_id`/`anio_escolar_id` contra los de la `Seccion` referenciada antes de crear.
 */
@Injectable()
export class AulasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * design.md "Contratos HTTP", tarea 21.5, spec "GET /aulas?grado_id=&seccion_id=&anio_escolar_id=&turno=".
   * Filtro no-UUID -> `400 CAMPO_INVALIDO`; `turno` fuera de `{manana, tarde}` -> `400
   * CAMPO_INVALIDO`, nunca un `500` de Prisma sobre un filtro malformado.
   */
  async listar(filtro: FiltroListadoAulas): Promise<AulaRespuestaDto[]> {
    if (filtro.grado_id !== undefined && !UUID_REGEX.test(filtro.grado_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'grado_id',
        motivo: 'formato',
      });
    }
    if (filtro.seccion_id !== undefined && !UUID_REGEX.test(filtro.seccion_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'seccion_id',
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
    if (filtro.turno !== undefined) {
      validarTurno(filtro.turno);
    }

    const where: Prisma.AulaWhereInput = {};
    if (filtro.grado_id !== undefined) {
      where.grado_id = filtro.grado_id;
    }
    if (filtro.seccion_id !== undefined) {
      where.seccion_id = filtro.seccion_id;
    }
    if (filtro.anio_escolar_id !== undefined) {
      where.anio_escolar_id = filtro.anio_escolar_id;
    }
    if (filtro.turno !== undefined) {
      where.turno = filtro.turno as Aula['turno'];
    }

    const aulas = await this.prisma.aula.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { id: 'asc' },
    });

    return aulas.map(mapearAulaRespuesta);
  }

  /** GET /aulas/:id — spec "CRUD de Aula". */
  async obtenerPorId(id: string): Promise<AulaRespuestaDto> {
    const aula = await this.prisma.aula.findUnique({ where: { id } });
    if (!aula) {
      throw new NotFoundException('Aula no encontrada');
    }
    return mapearAulaRespuesta(aula);
  }

  /**
   * D2/D5/D6: precomprobación de existencia de `Grado`/`Seccion`/`AnioEscolar` referenciados,
   * guarda de coherencia jerárquica contra la `Seccion` (D6), precomprobación de unicidad de
   * `(grado_id, seccion_id, anio_escolar_id)`, más `catch P2002`/`P2003` residuales como red de
   * seguridad.
   */
  async crear(datos: DatosAula, actorId: string): Promise<AulaRespuestaDto> {
    validarTurno(datos.turno);

    try {
      const aula = await this.prisma.$transaction(async (tx) => {
        const grado = await tx.grado.findUnique({ where: { id: datos.grado_id } });
        if (!grado) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Grado',
            campo: 'grado_id',
            valor: datos.grado_id,
          });
        }

        const seccion = await tx.seccion.findUnique({ where: { id: datos.seccion_id } });
        if (!seccion) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Seccion',
            campo: 'seccion_id',
            valor: datos.seccion_id,
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

        // D6: coherencia jerárquica — grado_id y anio_escolar_id del Aula DEBEN coincidir con los
        // de la Seccion referenciada. El esquema no lo garantiza (tres FK independientes).
        if (seccion.grado_id !== datos.grado_id) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.COHERENCIA_JERARQUICA,
            campo: 'grado_id',
            esperado: seccion.grado_id,
            recibido: datos.grado_id,
          });
        }
        if (seccion.anio_escolar_id !== datos.anio_escolar_id) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.COHERENCIA_JERARQUICA,
            campo: 'anio_escolar_id',
            esperado: seccion.anio_escolar_id,
            recibido: datos.anio_escolar_id,
          });
        }

        const existente = await tx.aula.findFirst({
          where: {
            grado_id: datos.grado_id,
            seccion_id: datos.seccion_id,
            anio_escolar_id: datos.anio_escolar_id,
          },
        });
        if (existente) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Aula',
            campos: ['grado_id', 'seccion_id', 'anio_escolar_id'],
          });
        }

        const creada = await tx.aula.create({
          data: {
            turno: datos.turno as Aula['turno'],
            grado_id: datos.grado_id,
            seccion_id: datos.seccion_id,
            anio_escolar_id: datos.anio_escolar_id,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.AULA_CREADA,
          actorId,
          'Aula',
          creada.id,
          {
            grado_id: creada.grado_id,
            seccion_id: creada.seccion_id,
            anio_escolar_id: creada.anio_escolar_id,
            turno: creada.turno,
          } as Prisma.InputJsonValue,
        );

        return creada;
      });

      return mapearAulaRespuesta(aula);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Aula',
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
   * D3: sin ninguna FK en el DTO de actualización — sin cambios efectivos de `turno` es un no-op.
   * `turno` inválido en el `PATCH` es `400 CAMPO_INVALIDO`, validado antes de tocar la base.
   */
  async actualizar(
    id: string,
    datos: DatosActualizarAula,
    actorId: string,
  ): Promise<AulaRespuestaDto> {
    if (datos.turno !== undefined) {
      validarTurno(datos.turno);
    }

    const aula = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.aula.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Aula no encontrada');
      }

      if (datos.turno === undefined || datos.turno === actual.turno) {
        return actual;
      }

      const actualizada = await tx.aula.update({
        where: { id },
        data: { turno: datos.turno as Aula['turno'] },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.AULA_ACTUALIZADA,
        actorId,
        'Aula',
        actualizada.id,
        { campos: ['turno'] } as Prisma.InputJsonValue,
      );

      return actualizada;
    });

    return mapearAulaRespuesta(aula);
  }

  /**
   * design.md D2, tareas 21.8-21.10, spec "CRUD de Aula". Precomprobación explícita de
   * `Matricula` y `ProcesoAula` dependientes, en ese orden, más `catch P2003` residual como red de
   * seguridad. `ProcesoAula` se verifica desde ahora aunque `#11` todavía no crea filas (design.md
   * D2, "Nota sobre Aula -> ProcesoAula").
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.aula.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Aula no encontrada');
        }

        const [matriculas, procesoAulas] = await Promise.all([
          tx.matricula.count({ where: { aula_id: id } }),
          tx.procesoAula.count({ where: { aula_id: id } }),
        ]);

        if (matriculas > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Aula',
            relacion: 'Matricula',
          });
        }
        if (procesoAulas > 0) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Aula',
            relacion: 'ProcesoAula',
          });
        }

        await tx.aula.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.AULA_ELIMINADA,
          actorId,
          'Aula',
          id,
          {
            grado_id: actual.grado_id,
            seccion_id: actual.seccion_id,
            anio_escolar_id: actual.anio_escolar_id,
            turno: actual.turno,
          } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'Aula',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }
}
