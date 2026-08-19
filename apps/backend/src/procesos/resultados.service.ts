import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.provider';
import type { ResultadoOpcionDto, ResultadosRespuestaDto } from './dto/resultados-respuesta.dto';
import { calcularEscrutinio, calcularParticipacion } from './escrutinio';
import { claveResultados, deserializar, serializar, TTL_RESULTADOS_SEGUNDOS } from './resultados-cache';

/**
 * resultados-en-vivo (#16, PR1; design.md D2/D3/D4/D6/D7/D8, tareas 3.1-3.15). Orden de
 * operaciones NO negociable (D2): la autorización es lo primero y NUNCA se cachea;
 * `ProcesoElectoral` no se lee antes de ella (no-oráculo, threat: IDOR/enumeración). Ningún guard
 * explícito de `estado = 'borrador'` (D3): `borrador` nunca tiene `DerechoVoto`, así que cae por
 * la misma comprobación de pertenencia, con el mismo `403` opaco.
 *
 * cierre-escrutinio-actas (#17, PR2; design.md D5). El cálculo de agregación se extrajo a
 * `escrutinio.ts` (`calcularParticipacion`/`calcularEscrutinio`), compartido con el flujo de
 * cierre de `#17`. El modo oculto llama SÓLO a `calcularParticipacion()` — nunca calcula el
 * desglose, ni siquiera para descartarlo (Threat Matrix de `#16`). El mapeo a
 * `ResultadosRespuestaDto` es explícito, campo por campo, sin `spread`: `baja_en` de
 * `FilaEscrutinio` nunca llega al DTO público.
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

    if (proceso.ocultar_resultados) {
      // Modo oculto (D5/#17): SÓLO participación, jamás el desglose — ni siquiera para
      // descartarlo (Threat Matrix de #16, "Fuga de resultados en modo oculto").
      const participacion = await calcularParticipacion(tx, procesoId);
      return {
        estado_visibilidad: 'oculto',
        resultados_ocultos_por_configuracion: true,
        votos_emitidos: participacion.votos_emitidos,
        padron_total: participacion.padron_total,
        hora_servidor: participacion.ahora.toISOString(),
      };
    }

    const escrutinio = await calcularEscrutinio(tx, procesoId, proceso.tipo);
    // Mapeo explícito campo por campo, sin `spread` (D5): `baja_en` de `FilaEscrutinio` nunca
    // llega al DTO público de #16.
    const desglose: ResultadoOpcionDto[] = escrutinio.desglose.map((fila) => ({
      id: fila.id,
      etiqueta: fila.etiqueta,
      votos: fila.votos,
      estado: fila.estado,
    }));

    return {
      estado_visibilidad: 'visible',
      resultados_ocultos_por_configuracion: false,
      votos_emitidos: escrutinio.votos_emitidos,
      padron_total: escrutinio.padron_total,
      hora_servidor: escrutinio.ahora.toISOString(),
      dimension: escrutinio.dimension,
      desglose,
      blancos: escrutinio.blancos,
    };
  }
}
