import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { calcularEscrutinio, calcularParticipacion } from '../procesos/escrutinio';
import type { ResultadoOpcionDto } from '../procesos/dto/resultados-respuesta.dto';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { TTL_PANEL_AVANCE_AULAS_SEGUNDOS, TTL_PANEL_INSTITUCION_SEGUNDOS, TTL_PANEL_RESUMEN_SEGUNDOS, TTL_PANEL_VOTOS_HORA_SEGUNDOS, UMBRAL_REZAGO_PP } from './panel-jornada.constantes';
import { clavePanel, deserializar, serializar } from './panel-jornada-cache';
import type { AulaAvanceDto, AvanceAulasDto } from './dto/avance-aulas.dto';
import type { FranjaVotosPorHoraDto, VotosPorHoraDto } from './dto/votos-por-hora.dto';
import type { InstitucionDto } from './dto/institucion.dto';
import type { ProyeccionDto } from './dto/proyeccion.dto';
import type { ResumenJornadaDto } from './dto/resumen-jornada.dto';

interface ProcesoGuardado {
  estado: string;
  tipo: string;
  ocultar_resultados: boolean;
  apertura_real: Date | null;
  cierre_real: Date | null;
}

/**
 * dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/D3-D8/D11, tareas 3.1-3.12).
 * Una función pública por agregación (D2). `resumen()` valida existencia (404) y
 * `estado !== 'borrador'` (409, D11) ANTES de tocar la caché — mismo criterio de
 * `ResultadosService` (la autorización/validación nunca se cachea). El panel RESPETA
 * `ocultar_resultados` sin excepción para los 3 roles (D6, cerrado por el usuario): el modo
 * oculto de `resumen()` sólo llama `calcularParticipacion()`, nunca `calcularEscrutinio()`.
 *
 * `proyeccion()` compone `calcularParticipacion` + votos-por-hora + avance-aulas dentro de la
 * MISMA transacción, sin caché propia (D8): estructuralmente no existe un camino de código hacia
 * `calcularEscrutinio` desde este método, así que no puede filtrar mal un desglose que nunca
 * calculó (threat: Fuga de desglose por la puerta de proyección).
 */
@Injectable()
export class PanelJornadaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async institucion(): Promise<InstitucionDto> {
    const claveScope = clavePanel('institucion');
    return this.conCache(claveScope, TTL_PANEL_INSTITUCION_SEGUNDOS, () =>
      this.prisma.$transaction((tx) => this.calcularInstitucion(tx), {
        isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel,
      }),
    );
  }

  async resumen(procesoId: string): Promise<ResumenJornadaDto> {
    const proceso = await this.guardarProceso(procesoId);
    const claveScope = clavePanel('resumen', procesoId);
    return this.conCache(claveScope, TTL_PANEL_RESUMEN_SEGUNDOS, () =>
      this.prisma.$transaction((tx) => this.calcularResumen(tx, procesoId, proceso), {
        isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel,
      }),
    );
  }

  async votosPorHora(procesoId: string): Promise<VotosPorHoraDto> {
    const proceso = await this.guardarProceso(procesoId);
    const claveScope = clavePanel('votos-hora', procesoId);
    return this.conCache(claveScope, TTL_PANEL_VOTOS_HORA_SEGUNDOS, () =>
      this.prisma.$transaction(
        (tx) => this.calcularVotosPorHora(tx, procesoId, proceso.apertura_real, proceso.cierre_real),
        { isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel },
      ),
    );
  }

  async avanceAulas(procesoId: string): Promise<AvanceAulasDto> {
    await this.guardarProceso(procesoId);
    const claveScope = clavePanel('avance-aulas', procesoId);
    return this.conCache(claveScope, TTL_PANEL_AVANCE_AULAS_SEGUNDOS, () =>
      this.prisma.$transaction((tx) => this.calcularAvanceAulas(tx, procesoId), {
        isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel,
      }),
    );
  }

  async proyeccion(procesoId: string): Promise<ProyeccionDto> {
    const proceso = await this.guardarProceso(procesoId);
    return this.prisma.$transaction(
      async (tx) => {
        const participacion = await calcularParticipacion(tx, procesoId);
        const votosPorHora = await this.calcularVotosPorHora(tx, procesoId, proceso.apertura_real, proceso.cierre_real);
        const avanceAulas = await this.calcularAvanceAulas(tx, procesoId);

        return {
          hora_servidor: participacion.ahora.toISOString(),
          padron_total: participacion.padron_total,
          votos_emitidos: participacion.votos_emitidos,
          franjas: votosPorHora.franjas,
          aulas: avanceAulas.aulas,
        };
      },
      { isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel },
    );
  }

  // 404/409 (D11) — validación de existencia y estado, NUNCA cacheada (mismo criterio de
  // autorización de ResultadosService: siempre se relee, punto de lectura barato).
  private async guardarProceso(procesoId: string): Promise<ProcesoGuardado> {
    const proceso = await this.prisma.procesoElectoral.findUnique({
      where: { id: procesoId },
      select: { estado: true, tipo: true, ocultar_resultados: true, apertura_real: true, cierre_real: true },
    });
    if (!proceso) {
      throw new NotFoundException();
    }
    if (proceso.estado === 'borrador') {
      throw new ConflictException({ codigo: 'ESTADO_INVALIDO', estado: proceso.estado });
    }
    return proceso as ProcesoGuardado;
  }

  // Envoltorio genérico de caché: JSON corrupto, clave ajena o error de Redis degradan a MISS,
  // nunca a 500 (mismo criterio que ResultadosService/D7 de #16).
  private async conCache<T>(claveScope: string, ttlSegundos: number, calcular: () => Promise<T>): Promise<T> {
    let cacheado: T | null = null;
    try {
      const crudo = await this.redis.get(claveScope);
      cacheado = deserializar<T>(claveScope, crudo);
    } catch {
      cacheado = null;
    }
    if (cacheado) {
      return cacheado;
    }

    const payload = await calcular();

    try {
      await this.redis.setex(claveScope, ttlSegundos, serializar(claveScope, payload));
    } catch {
      // degrada: la próxima lectura recalcula
    }

    return payload;
  }

  private async calcularInstitucion(tx: Prisma.TransactionClient): Promise<InstitucionDto> {
    const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT now() AS ahora`;
    const estudiantes = await tx.usuario.count({ where: { rol: 'estudiante', estado: 'activo' } });
    const vinculos_apoderado = await tx.apoderado.count();
    return { estudiantes, vinculos_apoderado, hora_servidor: ahora.toISOString() };
  }

  private async calcularResumen(
    tx: Prisma.TransactionClient,
    procesoId: string,
    proceso: ProcesoGuardado,
  ): Promise<ResumenJornadaDto> {
    const participacion = await calcularParticipacion(tx, procesoId);
    const correos_fallidos = await tx.jobCorreo.count({ where: { proceso_id: procesoId, estado: 'fallido' } });

    if (proceso.ocultar_resultados) {
      // Modo oculto (D6, sin excepción): SÓLO participación, jamás el desglose — ni siquiera
      // para descartarlo.
      return {
        proceso_id: procesoId,
        estado: proceso.estado as ResumenJornadaDto['estado'],
        padron_total: participacion.padron_total,
        votos_emitidos: participacion.votos_emitidos,
        correos_fallidos,
        estado_visibilidad: 'oculto',
        hora_servidor: participacion.ahora.toISOString(),
      };
    }

    const escrutinio = await calcularEscrutinio(tx, procesoId, proceso.tipo);
    // Mapeo explícito campo por campo, sin `spread`: `baja_en` nunca llega al DTO público.
    const desglose: ResultadoOpcionDto[] = escrutinio.desglose.map((fila) => ({
      id: fila.id,
      etiqueta: fila.etiqueta,
      votos: fila.votos,
      estado: fila.estado,
    }));

    return {
      proceso_id: procesoId,
      estado: proceso.estado as ResumenJornadaDto['estado'],
      padron_total: escrutinio.padron_total,
      votos_emitidos: escrutinio.votos_emitidos,
      correos_fallidos,
      estado_visibilidad: 'visible',
      hora_servidor: escrutinio.ahora.toISOString(),
      dimension: escrutinio.dimension,
      desglose,
      blancos: escrutinio.blancos,
    };
  }

  private async calcularVotosPorHora(
    tx: Prisma.TransactionClient,
    procesoId: string,
    aperturaReal: Date | null,
    cierreReal: Date | null,
  ): Promise<VotosPorHoraDto> {
    const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT now() AS ahora`;
    const filas = await tx.$queryRaw<{ hora: Date; votos: number }[]>`
      SELECT date_trunc('hour', hora_servidor) AS hora, count(*)::int AS votos
      FROM "Voto"
      WHERE proceso_id = ${procesoId}::uuid
      GROUP BY 1
      ORDER BY 1
    `;

    const mapa = new Map<string, number>(filas.map((fila) => [new Date(fila.hora).toISOString(), Number(fila.votos)]));
    const hasta = cierreReal && cierreReal.getTime() < ahora.getTime() ? cierreReal : ahora;
    const franjas = rellenarFranjas(mapa, aperturaReal, hasta);

    return { hora_servidor: ahora.toISOString(), franjas };
  }

  private async calcularAvanceAulas(tx: Prisma.TransactionClient, procesoId: string): Promise<AvanceAulasDto> {
    const participacion = await calcularParticipacion(tx, procesoId);
    const participacionGlobalPp = participacion.padron_total > 0 ? (participacion.votos_emitidos / participacion.padron_total) * 100 : 0;

    // Fuente de verdad de "qué aulas pertenecen al proceso" es `ProcesoAula`, no `DerechoVoto`:
    // un aula sin ningún `DerechoVoto` (padrón 0) no aparecería en el `groupBy` de abajo, pero
    // igual debe listarse con `padron: 0` (tarea 3.9, evita división por cero).
    const procesoAulas = await tx.procesoAula.findMany({ where: { proceso_id: procesoId }, select: { aula_id: true } });
    const idsAulas = procesoAulas.map((pa) => pa.aula_id);

    const padronPorAula = await tx.derechoVoto.groupBy({
      by: ['aula_snapshot'],
      where: { proceso_id: procesoId },
      _count: { _all: true },
    });
    // `votos: { some: {} }` — el `@@unique([proceso_id, derecho_voto_id])` de `Voto` garantiza
    // ≤1 voto por derecho, así que este conteo es "cuántos derechos de esta aula ya votaron".
    const votadoPorAula = await tx.derechoVoto.groupBy({
      by: ['aula_snapshot'],
      where: { proceso_id: procesoId, votos: { some: {} } },
      _count: { _all: true },
    });

    const mapaPadron = new Map<string, number>(
      padronPorAula.map((fila) => [fila.aula_snapshot as string, (fila._count as { _all: number })._all]),
    );
    const mapaVotado = new Map<string, number>(
      votadoPorAula.map((fila) => [fila.aula_snapshot as string, (fila._count as { _all: number })._all]),
    );

    const aulasInfo =
      idsAulas.length > 0
        ? await tx.aula.findMany({
            where: { id: { in: idsAulas } },
            select: { id: true, turno: true, grado: { select: { nombre: true } }, seccion: { select: { nombre: true } } },
          })
        : [];

    const aulas: AulaAvanceDto[] = aulasInfo.map((aula) => {
      const padron = mapaPadron.get(aula.id) ?? 0;
      const votos = mapaVotado.get(aula.id) ?? 0;
      const porcentaje = padron > 0 ? (votos / padron) * 100 : 0;
      // D7: umbral RELATIVO en puntos porcentuales, evaluado en el servidor. `padron === 0`
      // nunca es rezagada (tarea 3.9).
      const rezagada = padron > 0 && porcentaje <= participacionGlobalPp - UMBRAL_REZAGO_PP;

      return {
        aula_id: aula.id,
        etiqueta: `${aula.turno} - ${aula.grado.nombre} ${aula.seccion.nombre}`,
        padron,
        votos,
        porcentaje,
        rezagada,
      };
    });

    return {
      hora_servidor: participacion.ahora.toISOString(),
      participacion_global_pp: participacionGlobalPp,
      umbral_rezago_pp: UMBRAL_REZAGO_PP,
      aulas,
    };
  }
}

/**
 * Pura: rellena franjas horarias vacías entre `apertura` y `hasta` (ambas truncadas a la hora,
 * inclusive), sin huecos (spec: "Votos por hora"). Sin apertura registrada, no hay franjas.
 */
function rellenarFranjas(mapa: Map<string, number>, apertura: Date | null, hasta: Date): FranjaVotosPorHoraDto[] {
  if (!apertura) {
    return [];
  }

  const cursor = new Date(apertura);
  cursor.setUTCMinutes(0, 0, 0);
  const limite = new Date(hasta);
  limite.setUTCMinutes(0, 0, 0);

  const franjas: FranjaVotosPorHoraDto[] = [];
  while (cursor.getTime() <= limite.getTime()) {
    const iso = cursor.toISOString();
    franjas.push({ hora_inicio: iso, votos: mapa.get(iso) ?? 0 });
    cursor.setUTCHours(cursor.getUTCHours() + 1);
  }

  return franjas;
}
