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
  private async obtenerOpciones(procesoId: string, tipo: string): Promise<PapeletaOpcionDto[]> {
    if (tipo === 'municipio') {
      const listas = await this.prisma.lista.findMany({
        where: { proceso_id: procesoId, estado: 'activo' },
      });
      return listas.map((l) => ({ id: l.id, etiqueta: l.nombre }));
    }

    if (tipo === 'consulta') {
      const opciones = await this.prisma.opcionConsulta.findMany({
        where: { proceso_id: procesoId },
      });
      return opciones.map((o) => ({ id: o.id, etiqueta: o.etiqueta }));
    }

    const candidatos = await this.prisma.candidato.findMany({
      where: { proceso_id: procesoId, estado: 'activo' },
    });
    return candidatos.map((c) => ({ id: c.id, etiqueta: c.nombres }));
  }
}
