import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import type { PapeletaOpcionDto } from './dto/papeleta.dto';
import { PapeletaService } from './papeleta.service';
import { VOTOS_ERROR_CODES } from './votos.errors';

/**
 * rediseno-boleta-votacion, PR2 (design.md D3, tareas 6.1). Autorización por pertenencia de los 2
 * endpoints de binario de la papeleta (`foto`/`plan-trabajo`), delegada en
 * `PapeletaService.obtenerOpciones()` como fuente ÚNICA de verdad de "opción de esta papeleta" —
 * la misma lista que ya se renderiza en `GET /votos/papeleta/:derechoVotoId` nunca puede divergir
 * de la que autoriza estos dos endpoints (alternativa rechazada: escribir a mano una segunda
 * consulta de pertenencia, ver design.md D3).
 *
 * Algoritmo (idéntico hasta el paso de resolución de la opción, design.md D3):
 * 1. `derechoVoto.findUnique` + `dv.usuario_id !== sesion.userId` -> `ForbiddenException()` SIN
 *    cuerpo, literalmente el mismo objeto que `PapeletaService.obtener()`/`ComprobanteService`
 *    (D9/D13 de #14) — mismo criterio para derecho ajeno e inexistente.
 * 2. `obtenerOpciones(dv.proceso_id, dv.proceso.tipo)` — la opción debe estar presente ahí; si no,
 *    mismo `ForbiddenException()`. Esto cubre con una misma respuesta: id inexistente, id de otro
 *    proceso, lista/candidato dado de baja y `tipo === 'consulta'` (ninguna opción lleva
 *    `candidato_id`/`plan_trabajo_presente`, así que cae acá sin rama especial).
 * 3. Sólo si la opción existe pero el booleano `*_presente` es `false` -> `404`
 *    `ARCHIVO_NO_ENCONTRADO` (no es un oráculo: el cliente ya recibió ese booleano en la papeleta
 *    que tiene derecho a leer).
 * 4. Autorizar primero, cargar bytes después: los `findUnique` con `select: foto/plan_trabajo`
 *    sólo se ejecutan tras superar los pasos 1-3 — una petición denegada nunca materializa un
 *    binario en memoria (tarea 5.10).
 */
@Injectable()
export class PapeletaArchivosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly papeletaService: PapeletaService,
  ) {}

  private async resolverOpciones(
    derechoVotoId: string,
    sesion: SesionUsuario,
  ): Promise<PapeletaOpcionDto[]> {
    const dv = await this.prisma.derechoVoto.findUnique({
      where: { id: derechoVotoId },
      include: { proceso: true },
    });

    if (!dv || dv.usuario_id !== sesion.userId) {
      throw new ForbiddenException();
    }

    return this.papeletaService.obtenerOpciones(dv.proceso_id, dv.proceso.tipo);
  }

  async obtenerFoto(
    derechoVotoId: string,
    id: string,
    sesion: SesionUsuario,
  ): Promise<{ buffer: Buffer; mime: string }> {
    const opciones = await this.resolverOpciones(derechoVotoId, sesion);

    const opcion = opciones.find((o) => o.candidato_id === id);
    if (!opcion) {
      throw new ForbiddenException();
    }
    if (!opcion.foto_presente) {
      throw new NotFoundException({ codigo: VOTOS_ERROR_CODES.ARCHIVO_NO_ENCONTRADO });
    }

    const candidato = await this.prisma.candidato.findUnique({
      where: { id },
      select: { foto: true, foto_mime: true },
    });
    if (!candidato?.foto) {
      throw new NotFoundException({ codigo: VOTOS_ERROR_CODES.ARCHIVO_NO_ENCONTRADO });
    }

    return { buffer: candidato.foto, mime: candidato.foto_mime ?? 'image/png' };
  }

  async obtenerPlanTrabajo(
    derechoVotoId: string,
    id: string,
    sesion: SesionUsuario,
  ): Promise<{ buffer: Buffer; mime: string; nombre: string }> {
    const opciones = await this.resolverOpciones(derechoVotoId, sesion);

    const opcion = opciones.find((o) => o.id === id && o.plan_trabajo_presente !== undefined);
    if (!opcion) {
      throw new ForbiddenException();
    }
    if (!opcion.plan_trabajo_presente) {
      throw new NotFoundException({ codigo: VOTOS_ERROR_CODES.ARCHIVO_NO_ENCONTRADO });
    }

    const lista = await this.prisma.lista.findUnique({
      where: { id },
      select: { plan_trabajo: true, plan_trabajo_mime: true, plan_trabajo_nombre: true },
    });
    if (!lista?.plan_trabajo) {
      throw new NotFoundException({ codigo: VOTOS_ERROR_CODES.ARCHIVO_NO_ENCONTRADO });
    }

    return {
      buffer: lista.plan_trabajo,
      mime: lista.plan_trabajo_mime ?? 'application/pdf',
      nombre: lista.plan_trabajo_nombre ?? 'plan-trabajo.pdf',
    };
  }
}
