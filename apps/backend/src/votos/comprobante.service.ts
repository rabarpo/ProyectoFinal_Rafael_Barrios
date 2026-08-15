import { ForbiddenException, Injectable } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import type { ComprobanteDto } from './dto/comprobante.dto';
import { VotosService } from './votos.service';

/**
 * outbox-correo-comprobante-autenticado (#15, PR3; design.md D11, tareas 10.1-10.4). Lectura
 * autenticada de un comprobante YA emitido, por `voto_id` (opaco, no el `codigo_comprobante` — el
 * código está pensado para dictarse/imprimirse y en una URL se filtraría al historial del
 * navegador, `Referer` y logs de acceso de Caddy). Delega el armado del `ComprobanteDto` en
 * `VotosService.construirComprobante()` (ya construido en `#14`/PR3) en vez de duplicarlo — misma
 * dirección de dependencia de una vía (lectura -> escritura), sin ciclo.
 *
 * La autorización NO depende del secreto de la URL, sino de la pertenencia
 * (`Voto -> DerechoVoto.usuario_id === sesion.userId`), verificada en el servidor. Mismo criterio
 * de no-oráculo de `PapeletaService`/`VotosService` (`#14` D9/D13): `403` idéntico para voto ajeno
 * e inexistente, sin cuerpo discriminante.
 */
@Injectable()
export class ComprobanteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly votosService: VotosService,
  ) {}

  async obtener(votoId: string, sesion: SesionUsuario): Promise<ComprobanteDto> {
    const voto = await this.prisma.voto.findUnique({
      where: { id: votoId },
      include: { derechoVoto: true },
    });

    if (!voto || voto.derechoVoto.usuario_id !== sesion.userId) {
      throw new ForbiddenException();
    }

    return this.votosService.construirComprobante({
      creado: false,
      codigo_comprobante: voto.codigo_comprobante,
      hora_servidor: voto.hora_servidor.toISOString(),
      proceso_id: voto.proceso_id,
      derecho_voto_id: voto.derecho_voto_id,
    });
  }
}
