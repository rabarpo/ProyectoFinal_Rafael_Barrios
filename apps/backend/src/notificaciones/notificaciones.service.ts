import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import type { ListarNotificacionesQueryDto } from './dto/listar-notificaciones.query';
import type { NotificacionDto } from './dto/notificacion-respuesta.dto';
import type { PaginaNotificacionesDto } from './dto/pagina-notificaciones.dto';
import { NOTIFICACIONES_ERROR_CODES } from './notificaciones.errors';

const PAGINA_DEFAULT = 1;
const TAMANO_DEFAULT = 20;
const TAMANO_MAXIMO = 100;

interface NotificacionRegistro {
  id: string;
  evento: string;
  proceso_id: string | null;
  titulo: string;
  cuerpo: string;
  creado_en: Date;
  leido_en: Date | null;
  job_correo_id: string | null;
}

function parseEnteroPositivo(valor: string | undefined, campo: string, maximo?: number): number {
  if (valor === undefined) {
    return campo === 'pagina' ? PAGINA_DEFAULT : TAMANO_DEFAULT;
  }
  if (!/^[0-9]+$/.test(valor)) {
    throw new BadRequestException({ codigo: NOTIFICACIONES_ERROR_CODES.CAMPO_INVALIDO, campo });
  }
  const entero = Number(valor);
  if (entero < 1 || (maximo !== undefined && entero > maximo)) {
    throw new BadRequestException({ codigo: NOTIFICACIONES_ERROR_CODES.CAMPO_INVALIDO, campo });
  }
  return entero;
}

function parseSoloNoLeidas(valor: string | undefined): boolean {
  if (valor === undefined) {
    return false;
  }
  if (valor !== 'true' && valor !== 'false') {
    throw new BadRequestException({ codigo: NOTIFICACIONES_ERROR_CODES.CAMPO_INVALIDO, campo: 'solo_no_leidas' });
  }
  return valor === 'true';
}

function mapearRespuesta(registro: NotificacionRegistro): NotificacionDto {
  return {
    id: registro.id,
    evento: registro.evento,
    proceso_id: registro.proceso_id,
    titulo: registro.titulo,
    cuerpo: registro.cuerpo,
    creado_en: registro.creado_en.toISOString(),
    leido_en: registro.leido_en ? registro.leido_en.toISOString() : null,
    tiene_correo: registro.job_correo_id !== null,
  };
}

/**
 * notificaciones (backlog #19), PR5 (design.md D9/D10). Scope SIEMPRE por
 * `usuario_id = sesion.userId`, nunca por un parámetro externo (mismo idioma que
 * `GET /votos/mis-derechos`). `403` idéntico para notificación ajena e inexistente —
 * `findFirst({ id, usuario_id })` nulo cierra ambos casos sin distinguirlos (threat:
 * oráculo de IDOR/enumeración de `id`).
 */
@Injectable()
export class NotificacionesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(query: ListarNotificacionesQueryDto, sesion: SesionUsuario): Promise<PaginaNotificacionesDto> {
    const pagina = parseEnteroPositivo(query.pagina, 'pagina');
    const tamano = parseEnteroPositivo(query.tamano, 'tamano', TAMANO_MAXIMO);
    const soloNoLeidas = parseSoloNoLeidas(query.solo_no_leidas);

    const where = {
      usuario_id: sesion.userId,
      ...(soloNoLeidas ? { leido_en: null } : {}),
    };

    const [registros, total, noLeidas] = await Promise.all([
      this.prisma.notificacion.findMany({
        where,
        orderBy: { creado_en: 'desc' },
        skip: (pagina - 1) * tamano,
        take: tamano,
      }),
      this.prisma.notificacion.count({ where }),
      this.prisma.notificacion.count({ where: { usuario_id: sesion.userId, leido_en: null } }),
    ]);

    return {
      datos: (registros as NotificacionRegistro[]).map(mapearRespuesta),
      pagina,
      tamano,
      total,
      no_leidas: noLeidas,
    };
  }

  async marcarLeido(id: string, sesion: SesionUsuario): Promise<NotificacionDto> {
    const registro = (await this.prisma.notificacion.findFirst({
      where: { id, usuario_id: sesion.userId },
    })) as NotificacionRegistro | null;
    if (!registro) {
      throw new ForbiddenException();
    }

    if (registro.leido_en === null) {
      const resultado = await this.prisma.notificacion.updateMany({
        where: { id, usuario_id: sesion.userId, leido_en: null },
        data: { leido_en: new Date() },
      });
      if (resultado.count === 1) {
        return mapearRespuesta({ ...registro, leido_en: new Date() });
      }
      const actual = (await this.prisma.notificacion.findFirst({
        where: { id, usuario_id: sesion.userId },
      })) as NotificacionRegistro;
      return mapearRespuesta(actual);
    }

    return mapearRespuesta(registro);
  }
}
