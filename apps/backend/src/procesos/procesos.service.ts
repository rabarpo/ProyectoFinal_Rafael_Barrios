import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, ProcesoElectoral } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CrearProcesoDto } from './dto/crear-proceso.dto';
import type { ProcesoRespuestaDto } from './dto/proceso-respuesta.dto';
import { resolverAulas, validarSegmentacion } from './padron.service';
import { PROCESOS_ERROR_CODES } from './procesos.errors';

const TIPOS_VALIDOS = ['municipio', 'representante_aula', 'padres', 'consulta'] as const;

type PrismaAulasGradosNivelMatricula = Pick<PrismaService, 'aula' | 'grado' | 'nivel' | 'matricula'>;

function mapearRespuesta(
  proceso: ProcesoElectoral,
  aulas: string[],
  aulasExcluidas: string[],
): ProcesoRespuestaDto {
  return {
    id: proceso.id,
    nombre: proceso.nombre,
    descripcion: proceso.descripcion ?? undefined,
    tipo: proceso.tipo,
    estado: proceso.estado,
    fecha_apertura_prevista: proceso.fecha_apertura_prevista.toISOString(),
    fecha_cierre_prevista: proceso.fecha_cierre_prevista.toISOString(),
    ocultar_resultados: proceso.ocultar_resultados,
    publico_objetivo: proceso.publico_objetivo,
    alcance: proceso.alcance,
    nivel_id_snapshot: proceso.nivel_id_snapshot ?? undefined,
    grado_ids_snapshot: proceso.grado_ids_snapshot,
    aulas,
    aulas_excluidas: aulasExcluidas,
  };
}

/**
 * design.md D5, tarea 16.2. `nombre`/`tipo`/fechas — mismos códigos que `validarSegmentacion()`
 * (D5 de #7/#8: `400 CAMPO_INVALIDO` cuando el valor es inaceptable por sí mismo).
 */
function validarDatos(dto: CrearProcesoDto): { apertura: Date; cierre: Date } {
  if (!dto.nombre) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'nombre', motivo: 'requerido' });
  }
  if (!(TIPOS_VALIDOS as readonly string[]).includes(dto.tipo)) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'tipo', motivo: 'formato' });
  }

  const apertura = new Date(dto.fecha_apertura_prevista);
  if (Number.isNaN(apertura.getTime())) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_apertura_prevista',
      motivo: 'formato',
    });
  }

  const cierre = new Date(dto.fecha_cierre_prevista);
  if (Number.isNaN(cierre.getTime())) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_cierre_prevista',
      motivo: 'formato',
    });
  }

  if (cierre.getTime() <= apertura.getTime()) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_cierre_prevista',
      motivo: 'rango',
    });
  }

  return { apertura, cierre };
}

/**
 * design.md D3, tarea 16.2. Aulas del conjunto resuelto que tienen al menos una `Matricula` de un
 * estudiante activo en el año escolar activo — misma condición de elegibilidad base que
 * `PadronService` (D2), pero acá solo importa la existencia (`> 0`), no el conteo: es la exclusión
 * de aulas de la spec ("Aula sin matrícula activa queda excluida del lote"), no un padrón.
 */
async function aulasConMatriculaActiva(
  prisma: PrismaAulasGradosNivelMatricula,
  anioEscolarId: string,
  aulaIds: string[],
): Promise<Set<string>> {
  if (aulaIds.length === 0) {
    return new Set();
  }
  const grupos = await prisma.matricula.groupBy({
    by: ['aula_id'],
    where: {
      anio_escolar_id: anioEscolarId,
      aula_id: { in: aulaIds },
      usuario: { estado: 'activo', rol: 'estudiante' },
    },
    orderBy: { aula_id: 'asc' },
    _count: { _all: true },
  });
  return new Set(grupos.filter((g) => g._count._all > 0).map((g) => g.aula_id));
}

/**
 * administracion-procesos-electorales, PR6 (design.md "Enfoque técnico"/D3/D6, tareas 16.2/17.8).
 * Creación de `ProcesoElectoral` en `borrador` + lote de `ProcesoAula` para los 4 tipos (D3), en
 * una sola `$transaction` junto con `AuditoriaService.log(tx, PROCESO_CREADO, ...)` (D6): si el
 * lote falla a mitad de camino (p. ej. `aula_ids` duplicado viola `@@unique([proceso_id, aula_id])`
 * en `procesoAula.createMany`), Postgres revierte el `create` del proceso y la fila de auditoría
 * junto con las filas de `ProcesoAula` ya insertadas — ninguna escritura sobrevive fuera de la
 * transacción (spec: "Auditoría de creación dentro de la misma transacción", tarea 17.7).
 *
 * Las lecturas (resolución de año activo, de aulas y de elegibilidad) corren fuera de la
 * transacción de escritura, mismo criterio que `PadronService.calcular()`: son consultas contra un
 * estado que puede seguir cambiando (`READ COMMITTED`), y el único requisito de atomicidad real es
 * sobre las escrituras (D2 de design.md).
 */
@Injectable()
export class ProcesosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracionLectura: ConfiguracionLecturaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(dto: CrearProcesoDto, actorId: string): Promise<ProcesoRespuestaDto> {
    const { apertura, cierre } = validarDatos(dto);
    validarSegmentacion(dto);

    const anioEscolarId = await this.configuracionLectura.anioEscolarActivoId();
    if (!anioEscolarId) {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.SIN_ANIO_ESCOLAR_ACTIVO });
    }

    // D3: tipo↔alcance (representante_aula + institucion) se rechaza dentro de resolverAulas(),
    // reusado sin duplicar la regla (PR5 dejó `tipo` opcional exactamente para esto).
    const aulaIds = await resolverAulas(this.prisma, anioEscolarId, dto, dto.tipo);

    const conMatricula = await aulasConMatriculaActiva(this.prisma, anioEscolarId, aulaIds);
    const elegibles = aulaIds.filter((id) => conMatricula.has(id));
    const aulasExcluidas = aulaIds.filter((id) => !conMatricula.has(id));

    if (elegibles.length === 0) {
      throw new ConflictException({
        codigo: PROCESOS_ERROR_CODES.SEGMENTACION_SIN_ELEGIBLES,
        aulas_evaluadas: aulaIds.length,
      });
    }

    const nivelIdSnapshot = dto.alcance === 'nivel' ? (dto.nivel_id ?? null) : null;
    const gradoIdsSnapshot = dto.alcance === 'grados' ? (dto.grado_ids ?? []) : [];

    const proceso = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.procesoElectoral.create({
        data: {
          nombre: dto.nombre,
          descripcion: dto.descripcion,
          tipo: dto.tipo,
          fecha_apertura_prevista: apertura,
          fecha_cierre_prevista: cierre,
          ocultar_resultados: dto.ocultar_resultados ?? false,
          publico_objetivo: dto.publico_objetivo,
          alcance: dto.alcance,
          nivel_id_snapshot: nivelIdSnapshot,
          grado_ids_snapshot: gradoIdsSnapshot,
        },
      });

      await tx.procesoAula.createMany({
        data: elegibles.map((aulaId) => ({ proceso_id: creado.id, aula_id: aulaId })),
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.PROCESO_CREADO,
        actorId,
        'ProcesoElectoral',
        creado.id,
        {
          tipo: creado.tipo,
          publico_objetivo: creado.publico_objetivo,
          alcance: creado.alcance,
          nivel_id_snapshot: creado.nivel_id_snapshot,
          grado_ids_snapshot: creado.grado_ids_snapshot,
          aulas: elegibles.length,
          ocultar_resultados: creado.ocultar_resultados,
        } as Prisma.InputJsonValue,
      );

      return creado;
    });

    return mapearRespuesta(proceso, elegibles, aulasExcluidas);
  }
}
