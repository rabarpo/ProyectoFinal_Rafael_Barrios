import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { Prisma, TipoProceso } from '@prisma/client';
import { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';
import { PrismaService } from '../prisma/prisma.service';
import type { PadronAulaDto, PadronRespuestaDto } from './dto/padron-respuesta.dto';
import type { SegmentacionDto } from './dto/segmentacion.dto';
import { PROCESOS_ERROR_CODES } from './procesos.errors';

const PUBLICOS_VALIDOS = ['estudiantes', 'padres', 'comunidad'] as const;
const ALCANCES_VALIDOS = ['institucion', 'nivel', 'grados', 'aulas'] as const;

type PrismaAulasGradosNivel = Pick<PrismaService, 'aula' | 'grado' | 'nivel'>;

/**
 * design.md D5, tarea 12.2/13.1. Valida forma y presencia condicional (`nivel_id`/`grado_ids`/
 * `aula_ids` según `alcance`) — Jest puro, sin base, reutilizado por `PadronService.calcular()` y
 * por `ProcesosService` (PR6). Lanza `400 CAMPO_INVALIDO` en vez de dejar propagar un valor
 * arbitrario hasta Prisma.
 */
export function validarSegmentacion(dto: SegmentacionDto): void {
  if (!(PUBLICOS_VALIDOS as readonly string[]).includes(dto.publico_objetivo)) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'publico_objetivo',
      motivo: 'formato',
    });
  }
  if (!(ALCANCES_VALIDOS as readonly string[]).includes(dto.alcance)) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'alcance', motivo: 'formato' });
  }
  if (dto.alcance === 'nivel' && !dto.nivel_id) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'nivel_id', motivo: 'requerido' });
  }
  if (dto.alcance === 'grados' && (!dto.grado_ids || dto.grado_ids.length === 0)) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'grado_ids', motivo: 'requerido' });
  }
  if (dto.alcance === 'aulas' && (!dto.aula_ids || dto.aula_ids.length === 0)) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'aula_ids', motivo: 'requerido' });
  }
}

/**
 * design.md D3, tareas 13.1/13.6. Resolución del conjunto de aulas según `alcance`, siempre
 * acotada al año activo. `tipo` es opcional: `POST /procesos/padron` no lo envía (D4, body =
 * `SegmentacionDto` exacto); `ProcesosService.crear()`/`editar()` (PR6/PR7) sí lo pasan para hacer
 * cumplir la prohibición de `alcance = institucion` sobre `representante_aula` (D3).
 *
 * `alcance = aulas`: cada `aula_id` DEBE existir y pertenecer al año activo, o `409
 * REFERENCIA_INEXISTENTE` de inmediato — nunca se filtra en silencio (D5, tarea 13.6: "nunca
 * contadas").
 */
export async function resolverAulas(
  prisma: PrismaAulasGradosNivel,
  anioEscolarId: string,
  dto: SegmentacionDto,
  tipo?: TipoProceso,
): Promise<string[]> {
  if (dto.alcance === 'institucion') {
    if (tipo === 'representante_aula') {
      throw new ConflictException({
        codigo: PROCESOS_ERROR_CODES.SEGMENTACION_INVALIDA,
        tipo,
        alcance: dto.alcance,
      });
    }
    const aulas = await prisma.aula.findMany({ where: { anio_escolar_id: anioEscolarId }, select: { id: true } });
    return aulas.map((a) => a.id);
  }

  if (dto.alcance === 'aulas') {
    const aulaIds = dto.aula_ids ?? [];
    const encontradas = await prisma.aula.findMany({
      where: { id: { in: aulaIds } },
      select: { id: true, anio_escolar_id: true },
    });
    const porId = new Map(encontradas.map((a) => [a.id, a]));
    for (const id of aulaIds) {
      const aula = porId.get(id);
      if (!aula || aula.anio_escolar_id !== anioEscolarId) {
        throw new ConflictException({
          codigo: PROCESOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'Aula',
          campo: 'aula_ids',
          valor: id,
        });
      }
    }
    return aulaIds;
  }

  if (dto.alcance === 'grados') {
    const gradoIds = dto.grado_ids ?? [];
    const aulas = await prisma.aula.findMany({
      where: { grado_id: { in: gradoIds }, anio_escolar_id: anioEscolarId },
      select: { id: true },
    });
    return aulas.map((a) => a.id);
  }

  // alcance === 'nivel'
  const nivelId = dto.nivel_id as string;
  const nivel = await prisma.nivel.findUnique({ where: { id: nivelId }, select: { id: true } });
  if (!nivel) {
    throw new ConflictException({
      codigo: PROCESOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
      entidad: 'Nivel',
      campo: 'nivel_id',
      valor: nivelId,
    });
  }
  const grados = await prisma.grado.findMany({ where: { nivel_id: nivelId }, select: { id: true } });
  const gradoIds = grados.map((g) => g.id);
  const aulas = await prisma.aula.findMany({
    where: { grado_id: { in: gradoIds }, anio_escolar_id: anioEscolarId },
    select: { id: true },
  });
  return aulas.map((a) => a.id);
}

/**
 * design.md D2. El conteo es de DERECHOS, no de personas ni de cuentas (ADR-0011: el padre no
 * tiene cuenta, vota con la del estudiante). `comunidad` suma doble derecho sobre la misma cuenta
 * (spec: "Consulta institucional cuenta doble derecho de estudiante con padre").
 */
export function derechosPorAula(
  publico: SegmentacionDto['publico_objetivo'],
  estudiantes: number,
  padres: number,
): number {
  if (publico === 'estudiantes') {
    return estudiantes;
  }
  if (publico === 'padres') {
    return padres;
  }
  return estudiantes + padres;
}

/**
 * administracion-procesos-electorales, PR5 (design.md D2/D2b/D3, tareas 13.1-13.8). Cálculo del
 * padrón en vivo: tres agregaciones sin SQL crudo dentro de un `$transaction` en lote, sin
 * materializar `DerechoVoto` (spec: "Cálculo de padrón en vivo sin materialización") y sin
 * auditoría (D6: es una lectura).
 */
@Injectable()
export class PadronService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracionLectura: ConfiguracionLecturaService,
  ) {}

  async calcular(dto: SegmentacionDto, tipo?: TipoProceso): Promise<PadronRespuestaDto> {
    validarSegmentacion(dto);

    const anioEscolarId = await this.configuracionLectura.anioEscolarActivoId();
    if (!anioEscolarId) {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.SIN_ANIO_ESCOLAR_ACTIVO });
    }

    const aulaIds = await resolverAulas(this.prisma, anioEscolarId, dto, tipo);

    if (aulaIds.length === 0) {
      return {
        derechos_totales: 0,
        estudiantes: 0,
        padres: 0,
        cuentas_distintas: 0,
        aulas: [],
        aulas_excluidas: [],
      };
    }

    const baseWhere: Prisma.MatriculaWhereInput = {
      anio_escolar_id: anioEscolarId,
      aula_id: { in: aulaIds },
      usuario: { estado: 'activo', rol: 'estudiante' },
    };

    // Cada consulta se liga a una variable propia antes del `$transaction` en lote: dentro de un
    // array literal, TS infiere los tres elementos como un tipo unión y pierde la forma exacta de
    // `_count` (termina viendo `_count: true` en vez de `{ _all: number }`). Ligarlas antes
    // conserva el tipo exacto de cada `PrismaPromise` sin cambiar el runtime (sigue siendo un solo
    // `$transaction([...])` en lote, D2).
    const consultaEstudiantesPorAula = this.prisma.matricula.groupBy({
      by: ['aula_id'],
      where: baseWhere,
      orderBy: { aula_id: 'asc' },
      _count: { _all: true },
    });
    const consultaConApoderadoPorAula = this.prisma.matricula.groupBy({
      by: ['aula_id'],
      where: { ...baseWhere, usuario: { estado: 'activo', rol: 'estudiante', apoderados: { some: {} } } },
      orderBy: { aula_id: 'asc' },
      _count: { _all: true },
    });
    const consultaCuentasDistintas = this.prisma.usuario.count({
      where: { estado: 'activo', rol: 'estudiante', matriculas: { some: baseWhere } },
    });

    const [porAula, conApoderadoPorAula, cuentasDistintas] = await this.prisma.$transaction([
      consultaEstudiantesPorAula,
      consultaConApoderadoPorAula,
      consultaCuentasDistintas,
    ]);

    const estudiantesPorAula = new Map(porAula.map((fila) => [fila.aula_id, fila._count._all]));
    const padresPorAula = new Map(conApoderadoPorAula.map((fila) => [fila.aula_id, fila._count._all]));

    const aulas: PadronAulaDto[] = [];
    const aulasExcluidas: string[] = [];

    for (const aulaId of aulaIds) {
      const estudiantes = estudiantesPorAula.get(aulaId) ?? 0;
      if (estudiantes === 0) {
        aulasExcluidas.push(aulaId);
        continue;
      }
      const padres = padresPorAula.get(aulaId) ?? 0;
      aulas.push({
        aula_id: aulaId,
        estudiantes,
        padres,
        derechos: derechosPorAula(dto.publico_objetivo, estudiantes, padres),
      });
    }

    const estudiantesTotal = aulas.reduce((acc, a) => acc + a.estudiantes, 0);
    const padresTotal = aulas.reduce((acc, a) => acc + a.padres, 0);
    const derechosTotal = aulas.reduce((acc, a) => acc + a.derechos, 0);

    const respuesta: PadronRespuestaDto = {
      derechos_totales: derechosTotal,
      estudiantes: estudiantesTotal,
      padres: padresTotal,
      cuentas_distintas: cuentasDistintas,
      aulas,
      aulas_excluidas: aulasExcluidas,
    };

    // D2: cuentasDistintas es la red de seguridad ante un estudiante con dos matrículas activas en
    // el mismo año escolar (el schema no lo impide). aviso: no bloquea, el asistente lo muestra.
    if (estudiantesTotal !== cuentasDistintas) {
      respuesta.aviso = 'MATRICULA_DUPLICADA';
    }

    return respuesta;
  }
}
