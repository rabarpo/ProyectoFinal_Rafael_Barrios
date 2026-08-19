import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { TipoActa } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActaResumenDto } from './dto/acta-resumen.dto';
import { PROCESOS_ERROR_CODES } from './procesos.errors';

const TIPOS_ACTA_VALIDOS: readonly TipoActa[] = ['apertura', 'cierre', 'escrutinio', 'oficial'];

function esTipoActaValido(tipo: string): tipo is TipoActa {
  return (TIPOS_ACTA_VALIDOS as readonly string[]).includes(tipo);
}

/**
 * cierre-escrutinio-actas (#17, PR4; design.md D13, tareas 16.6-16.7). Listado y descarga de
 * actas para el comité. `GET /:id/actas` nunca expone `pdf` ni `contenido` (D13/threat
 * "Denegación por polling / tamaño de payload"); `GET /:id/actas/:tipo/pdf` direcciona por
 * `@@unique([proceso_id, tipo])` (D2), sin exponer `acta_id` como IDOR adicional.
 */
@Injectable()
export class ActasService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(procesoId: string): Promise<ActaResumenDto[]> {
    const proceso = await this.prisma.procesoElectoral.findUnique({ where: { id: procesoId } });
    if (!proceso) {
      throw new NotFoundException();
    }

    const actas = await this.prisma.acta.findMany({
      where: { proceso_id: procesoId },
      select: { id: true, tipo: true, estado: true, creado_en: true, pdf: true },
      orderBy: { creado_en: 'asc' },
    });

    return actas.map((acta) => ({
      id: acta.id,
      tipo: acta.tipo,
      estado: acta.estado,
      creado_en: acta.creado_en.toISOString(),
      pdf_disponible: acta.pdf !== null,
    }));
  }

  async obtenerPdf(procesoId: string, tipo: string): Promise<{ buffer: Buffer; nombre: string }> {
    if (!esTipoActaValido(tipo)) {
      throw new BadRequestException({
        codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'tipo',
        motivo: 'formato',
      });
    }

    const proceso = await this.prisma.procesoElectoral.findUnique({ where: { id: procesoId } });
    if (!proceso) {
      throw new NotFoundException();
    }

    const acta = await this.prisma.acta.findUnique({
      where: { proceso_id_tipo: { proceso_id: procesoId, tipo } },
      select: { id: true, estado: true, pdf: true },
    });
    if (!acta || acta.pdf === null) {
      throw new ConflictException({
        codigo: PROCESOS_ERROR_CODES.ACTA_NO_EMITIDA,
        estado: acta?.estado ?? 'borrador',
      });
    }

    return { buffer: acta.pdf, nombre: `acta-${tipo}-${acta.id}.pdf` };
  }
}
