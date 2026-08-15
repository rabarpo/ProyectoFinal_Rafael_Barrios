import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';
import type { ResultadoOpcionDto, ResultadosRespuestaDto } from './dto/resultados-respuesta.dto';
import { claveResultados, deserializar, serializar, TTL_RESULTADOS_SEGUNDOS } from './resultados-cache';

type Dimension = 'lista' | 'candidato' | 'opcion';
type CampoVoto = 'lista_id' | 'candidato_id' | 'opcion_id';

interface Catalogo {
  dimension: Dimension;
  campo: CampoVoto;
}

// design.md, flujo de datos: tipo del proceso -> dimensión/campo de Voto/catálogo/gráfico.
function catalogoDe(tipo: string): Catalogo {
  if (tipo === 'municipio') {
    return { dimension: 'lista', campo: 'lista_id' };
  }
  if (tipo === 'consulta') {
    return { dimension: 'opcion', campo: 'opcion_id' };
  }
  // representante_aula | padres
  return { dimension: 'candidato', campo: 'candidato_id' };
}

/**
 * resultados-en-vivo (#16, PR1; design.md D2/D3/D4/D6/D7/D8, tareas 3.1-3.15). Orden de
 * operaciones NO negociable (D2): la autorización es lo primero y NUNCA se cachea;
 * `ProcesoElectoral` no se lee antes de ella (no-oráculo, threat: IDOR/enumeración). Ningún guard
 * explícito de `estado = 'borrador'` (D3): `borrador` nunca tiene `DerechoVoto`, así que cae por
 * la misma comprobación de pertenencia, con el mismo `403` opaco.
 */
@Injectable()
export class ResultadosService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async obtener(procesoId: string, sesion: SesionUsuario): Promise<ResultadosRespuestaDto> {
    // 1. AUTORIZACIÓN — siempre, nunca cacheada (D2). Mismo 403 opaco para ajeno, inexistente y
    // borrador (D3).
    const derechos = await this.prisma.derechoVoto.count({
      where: { proceso_id: procesoId, usuario_id: sesion.userId },
    });
    if (derechos === 0) {
      throw new ForbiddenException();
    }

    // 2. CACHÉ (D7/D8) — catch acotado sólo a get/setex; los errores de Prisma burbujean.
    let cacheado: ResultadosRespuestaDto | null = null;
    try {
      const crudo = await this.redis.get(claveResultados(procesoId));
      cacheado = deserializar(procesoId, crudo);
    } catch {
      cacheado = null; // degrada a MISS, nunca a 500 (D8)
    }
    if (cacheado) {
      return cacheado;
    }

    // 3. CÁLCULO (sólo en miss) — transacción interactiva RepeatableRead (D4).
    const payload = await this.prisma.$transaction(
      (tx) => this.calcular(tx, procesoId),
      { isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel },
    );

    // 4. SETEX — igual acotado a setex; si falla, responder igual (D8).
    try {
      await this.redis.setex(claveResultados(procesoId), TTL_RESULTADOS_SEGUNDOS, serializar(procesoId, payload));
    } catch {
      // degrada: la próxima lectura recalculará (D8)
    }

    return payload;
  }

  private async calcular(tx: Prisma.TransactionClient, procesoId: string): Promise<ResultadosRespuestaDto> {
    // Tras autorizar, `findUnique` no puede devolver null: `DerechoVoto.proceso_id` es FK con
    // `onDelete: Restrict`, así que la existencia de un derecho ya prueba la del proceso.
    const proceso = await tx.procesoElectoral.findUnique({
      where: { id: procesoId },
      select: { tipo: true, ocultar_resultados: true },
    });
    if (!proceso) {
      throw new ForbiddenException();
    }

    const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT now() AS ahora`;
    const padronTotal = await tx.derechoVoto.count({ where: { proceso_id: procesoId } });
    const votosEmitidos = await tx.voto.count({ where: { proceso_id: procesoId } });

    const base: ResultadosRespuestaDto = {
      estado_visibilidad: proceso.ocultar_resultados ? 'oculto' : 'visible',
      resultados_ocultos_por_configuracion: proceso.ocultar_resultados,
      votos_emitidos: votosEmitidos,
      padron_total: padronTotal,
      hora_servidor: ahora.toISOString(),
    };

    if (proceso.ocultar_resultados) {
      return base;
    }

    const { dimension, campo } = catalogoDe(proceso.tipo);
    const blancos = await tx.voto.count({ where: { proceso_id: procesoId, blanco: true } });

    const grupos = await tx.voto.groupBy({
      by: [campo],
      where: { proceso_id: procesoId, [campo]: { not: null } },
      _count: { _all: true },
    });
    const votosPorId = new Map<string, number>(
      grupos
        .map((fila) => {
          const id = (fila as Record<CampoVoto, string | null>)[campo];
          const cuenta = (fila as { _count: { _all: number } })._count._all;
          return id ? ([id, cuenta] as const) : null;
        })
        .filter((par): par is [string, number] => par !== null),
    );

    // Catálogo completo, SIN filtrar estado: 'activo' (D4) — el resultado es "qué se eligió", no
    // "qué se podía elegir".
    const desglose: ResultadoOpcionDto[] = await this.catalogoCompleto(tx, dimension, procesoId, votosPorId);
    desglose.sort((a, b) => b.votos - a.votos || a.etiqueta.localeCompare(b.etiqueta));

    return {
      ...base,
      dimension,
      desglose,
      blancos,
    };
  }

  private async catalogoCompleto(
    tx: Prisma.TransactionClient,
    dimension: Dimension,
    procesoId: string,
    votosPorId: Map<string, number>,
  ): Promise<ResultadoOpcionDto[]> {
    if (dimension === 'lista') {
      const listas = await tx.lista.findMany({ where: { proceso_id: procesoId } });
      return listas.map((lista) => ({
        id: lista.id,
        etiqueta: lista.nombre,
        votos: votosPorId.get(lista.id) ?? 0,
        estado: lista.estado,
      }));
    }
    if (dimension === 'candidato') {
      const candidatos = await tx.candidato.findMany({ where: { proceso_id: procesoId } });
      return candidatos.map((candidato) => ({
        id: candidato.id,
        etiqueta: candidato.nombres,
        votos: votosPorId.get(candidato.id) ?? 0,
        estado: candidato.estado,
      }));
    }
    // dimension === 'opcion' — OpcionConsulta no tiene columna estado: siempre 'activo'.
    const opciones = await tx.opcionConsulta.findMany({ where: { proceso_id: procesoId } });
    return opciones.map((opcion) => ({
      id: opcion.id,
      etiqueta: opcion.etiqueta,
      votos: votosPorId.get(opcion.id) ?? 0,
      estado: 'activo' as const,
    }));
  }
}
