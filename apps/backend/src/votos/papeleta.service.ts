import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import type { PapeletaDto, PapeletaOpcionDto } from './dto/papeleta.dto';

// vote-casting, PR1 (design.md D13, tareas 3.1-3.4). Lectura de la papeleta — SEPARADA del
// camino de escritura (`VotosService.emitir()`, PR2): esto NO es la validación, es sólo UX y por
// eso nunca emite un evento `RECHAZO`. La misma regla de pertenencia de la causa 1 de rechazo
// (D9) aplica acá: `403` idéntico para derecho ajeno e inexistente, sin cuerpo discriminante, para
// no actuar de oráculo de enumeración de `derecho_voto_id` (Threat Matrix "IDOR / enumeración").
@Injectable()
export class PapeletaService {
  constructor(private readonly prisma: PrismaService) {}

  async obtener(derechoVotoId: string, sesion: SesionUsuario): Promise<PapeletaDto> {
    const dv = await this.prisma.derechoVoto.findUnique({
      where: { id: derechoVotoId },
      include: { proceso: true },
    });

    if (!dv || dv.usuario_id !== sesion.userId) {
      throw new ForbiddenException();
    }

    const [voto, opciones] = await Promise.all([
      this.prisma.voto.findUnique({
        where: {
          proceso_id_derecho_voto_id: { proceso_id: dv.proceso_id, derecho_voto_id: dv.id },
        },
      }),
      this.obtenerOpciones(dv.proceso_id, dv.proceso.tipo),
    ]);

    return {
      proceso: {
        id: dv.proceso.id,
        nombre: dv.proceso.nombre,
        descripcion: dv.proceso.descripcion,
        fecha_cierre_prevista: dv.proceso.fecha_cierre_prevista.toISOString(),
        tipo: dv.proceso.tipo,
      },
      en_calidad_de: dv.en_calidad_de,
      opciones,
      ya_voto: voto !== null,
      comprobante: voto
        ? { codigo_comprobante: voto.codigo_comprobante, hora_servidor: voto.hora_servidor.toISOString() }
        : null,
    };
  }

  // D13: opciones activas del tipo — `municipio` vota por `Lista` (D1 de #12: boleta cerrada por
  // lista), `consulta` vota por `OpcionConsulta` (sin columna `estado`, siempre vigente), y el
  // resto (`representante_aula`/`padres`) vota por `Candidato` sin lista asociada (D1 de #12).
  //
  // rediseno-boleta-votacion, PR1 (design.md D1/D2): pasa a `public` porque `PapeletaArchivosService`
  // (PR2) la reusa como fuente única de verdad de pertenencia — sigue sin auditar nada, es lectura
  // pura. Cada rama es una sola consulta con `select`/`orderBy` explícitos, nunca N+1: para
  // `municipio`, el candidato "cabeza de lista" es una convención de desempate determinística
  // (`nombres asc`, con `id asc` como segundo desempate porque `nombres` no es único) resuelta por
  // Prisma con `take: 1` en la relación anidada (compila a una función de ventana, no a una consulta
  // por lista) — NO es una designación real de "líder de lista" en el dominio. El `select` de las 3
  // ramas nunca pide las columnas `Bytes` (`foto`/`plan_trabajo`): solo los `*_mime` para derivar los
  // booleanos `*_presente` sin exponer bytes.
  async obtenerOpciones(procesoId: string, tipo: string): Promise<PapeletaOpcionDto[]> {
    if (tipo === 'municipio') {
      const listas = await this.prisma.lista.findMany({
        where: { proceso_id: procesoId, estado: 'activo' },
        orderBy: { numero: 'asc' },
        select: {
          id: true,
          nombre: true,
          simbolo: true,
          lema: true,
          propuesta: true,
          plan_trabajo_mime: true,
          candidatos: {
            where: { estado: 'activo' },
            orderBy: [{ nombres: 'asc' }, { id: 'asc' }],
            take: 1,
            select: { id: true, nombres: true, cargo: true, foto_mime: true },
          },
        },
      });

      return listas.map((l) => {
        const cabeza = l.candidatos[0];
        return {
          id: l.id,
          etiqueta: l.nombre,
          ...(l.simbolo !== null && { simbolo: l.simbolo }),
          ...(l.lema !== null && { lema: l.lema }),
          ...(l.propuesta !== null && { propuesta: l.propuesta }),
          plan_trabajo_presente: l.plan_trabajo_mime !== null,
          ...(cabeza && this.mapearCandidatoDeOpcion(cabeza)),
        };
      });
    }

    if (tipo === 'consulta') {
      const opciones = await this.prisma.opcionConsulta.findMany({
        where: { proceso_id: procesoId },
        orderBy: { etiqueta: 'asc' },
        select: { id: true, etiqueta: true, descripcion: true },
      });
      return opciones.map((o) => ({
        id: o.id,
        etiqueta: o.etiqueta,
        ...(o.descripcion !== null && { descripcion: o.descripcion }),
      }));
    }

    const candidatos = await this.prisma.candidato.findMany({
      where: { proceso_id: procesoId, estado: 'activo' },
      orderBy: { nombres: 'asc' },
      select: { id: true, nombres: true, cargo: true, foto_mime: true },
    });
    return candidatos.map((c) => ({
      id: c.id,
      etiqueta: c.nombres,
      ...this.mapearCandidatoDeOpcion(c),
    }));
  }

  // Regla homogénea del mapper, sin ramas por tipo: los cuatro campos de candidato se emiten
  // juntos siempre que exista un `Candidato` resuelto; `cargo` se omite si es `null` (mismo
  // criterio que `simbolo`/`lema`/`propuesta`/`descripcion` arriba).
  private mapearCandidatoDeOpcion(candidato: {
    id: string;
    nombres: string;
    cargo: string | null;
    foto_mime: string | null;
  }): Pick<PapeletaOpcionDto, 'candidato_id' | 'candidato_nombres' | 'cargo' | 'foto_presente'> {
    return {
      candidato_id: candidato.id,
      candidato_nombres: candidato.nombres,
      ...(candidato.cargo !== null && { cargo: candidato.cargo }),
      foto_presente: candidato.foto_mime !== null,
    };
  }
}
