import { Injectable } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import type { MiDerechoVotoDto } from './dto/mi-derecho-voto.dto';

// descubrimiento-derechos-voto, PR1 (design.md D1/D2/D4/D6, "Contratos", tarea 2.1). Lectura de
// SOLO LECTURA, desacoplada de `VotosService.emitir()` (D3) — sin auditoría propia, es UX, no la
// validación (mismo criterio que `PapeletaService`). `POST /votos` sigue siendo la única autoridad
// de la ventana de vigencia (D2).
@Injectable()
export class MisDerechosService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(sesion: SesionUsuario): Promise<MiDerechoVotoDto[]> {
    const derechos = await this.prisma.derechoVoto.findMany({
      where: {
        usuario_id: sesion.userId,
        proceso: { estado: 'abierto', fecha_cierre_prevista: { gt: new Date() } },
      },
      select: {
        id: true,
        en_calidad_de: true,
        proceso: { select: { id: true, nombre: true, tipo: true, fecha_cierre_prevista: true } },
        votos: { select: { id: true }, take: 1 },
      },
      orderBy: { proceso: { fecha_cierre_prevista: 'asc' } },
    });

    // D6/ADR-0010: sólo `ya_voto` deriva de `votos.length` — ni el `voto.id` se serializa.
    return derechos.map((dv) => ({
      derecho_voto_id: dv.id,
      en_calidad_de: dv.en_calidad_de,
      ya_voto: dv.votos.length > 0,
      proceso: {
        id: dv.proceso.id,
        nombre: dv.proceso.nombre,
        tipo: dv.proceso.tipo as MiDerechoVotoDto['proceso']['tipo'],
        fecha_cierre_prevista: dv.proceso.fecha_cierre_prevista.toISOString(),
      },
    }));
  }
}
