import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Apoderado, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import type { ApoderadoRespuestaDto } from './dto/apoderado-respuesta.dto';
import { USERS_ERROR_CODES } from './users.errors';

// administracion-usuarios-apoderados, PR3 (design.md D3, tarea 11.8). Forma mínima que
// `crear()`/`actualizar()` necesitan de un `Apoderado` (spec "CRUD de Apoderado restringido a
// estudiantes").
export interface DatosApoderado {
  nombres: string;
  dni: string;
  correo?: string;
}

export type DatosActualizarApoderado = Partial<DatosApoderado>;

function mapearApoderadoRespuesta(apoderado: Apoderado): ApoderadoRespuestaDto {
  return {
    id: apoderado.id,
    nombres: apoderado.nombres,
    dni: apoderado.dni,
    correo: apoderado.correo,
  };
}

/**
 * administracion-usuarios-apoderados, PR3 (design.md D3/D5, tarea 11.8). CRUD del sub-recurso
 * `Apoderado`, anidado bajo `Usuario` (`usuarios/:usuarioId/apoderados`), operando exclusivamente
 * cuando el `Usuario` referenciado tiene `rol = 'estudiante'` (spec "CRUD de Apoderado restringido
 * a estudiantes"). `DELETE` es un borrado físico real (ADR-0011: `Apoderado` no participa de la
 * cadena de auditoría append-only como actor ni entidad auditable independiente por sí mismo).
 */
@Injectable()
export class ApoderadosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Guarda compartida por las cuatro operaciones (spec "CRUD de Apoderado restringido a
   * estudiantes"): `:usuarioId` inexistente ⇒ `404`; existente con `rol ≠ estudiante` ⇒
   * `409 USUARIO_NO_ES_ESTUDIANTE`, sin tocar `Apoderado`.
   */
  private async verificarEstudiante(
    tx: Prisma.TransactionClient | PrismaService,
    usuarioId: string,
  ): Promise<void> {
    const usuario = await tx.usuario.findUnique({ where: { id: usuarioId } });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (usuario.rol !== 'estudiante') {
      throw new ConflictException({
        codigo: USERS_ERROR_CODES.USUARIO_NO_ES_ESTUDIANTE,
        rol_actual: usuario.rol,
      });
    }
  }

  /** POST /usuarios/:usuarioId/apoderados — spec "Alta de apoderado sobre un estudiante". */
  async crear(
    usuarioId: string,
    datos: DatosApoderado,
    actorId: string,
  ): Promise<ApoderadoRespuestaDto> {
    const apoderado = await this.prisma.$transaction(async (tx) => {
      await this.verificarEstudiante(tx, usuarioId);

      const creado = await tx.apoderado.create({
        data: {
          nombres: datos.nombres,
          dni: datos.dni,
          correo: datos.correo ?? null,
          usuario_id: usuarioId,
        },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.APODERADO_CREADO,
        actorId,
        'Apoderado',
        creado.id,
        { usuario_id: usuarioId } as Prisma.InputJsonValue,
      );

      return creado;
    });

    return mapearApoderadoRespuesta(apoderado);
  }

  /** GET /usuarios/:usuarioId/apoderados — arreglo vacío es válido (spec). */
  async listar(usuarioId: string): Promise<ApoderadoRespuestaDto[]> {
    await this.verificarEstudiante(this.prisma, usuarioId);

    const apoderados = await this.prisma.apoderado.findMany({ where: { usuario_id: usuarioId } });
    return apoderados.map(mapearApoderadoRespuesta);
  }

  /** PATCH /usuarios/:usuarioId/apoderados/:apoderadoId — datos básicos. */
  async actualizar(
    usuarioId: string,
    apoderadoId: string,
    datos: DatosActualizarApoderado,
    actorId: string,
  ): Promise<ApoderadoRespuestaDto> {
    const apoderado = await this.prisma.$transaction(async (tx) => {
      await this.verificarEstudiante(tx, usuarioId);

      const actual = await tx.apoderado.findFirst({
        where: { id: apoderadoId, usuario_id: usuarioId },
      });
      if (!actual) {
        throw new NotFoundException('Apoderado no encontrado');
      }

      const camposModificados = (Object.keys(datos) as Array<keyof DatosActualizarApoderado>).filter(
        (campo) => datos[campo] !== undefined,
      );

      const actualizado = await tx.apoderado.update({
        where: { id: apoderadoId },
        data: {
          nombres: datos.nombres,
          dni: datos.dni,
          correo: datos.correo,
        },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.APODERADO_ACTUALIZADO,
        actorId,
        'Apoderado',
        apoderadoId,
        { usuario_id: usuarioId, campos: camposModificados } as Prisma.InputJsonValue,
      );

      return actualizado;
    });

    return mapearApoderadoRespuesta(apoderado);
  }

  /**
   * DELETE /usuarios/:usuarioId/apoderados/:apoderadoId — borrado físico real (spec "Eliminación
   * de apoderado es un borrado físico"). El payload de auditoría lleva `nombres`/`dni` porque es
   * la única copia de esos datos que sobrevive al `DELETE` (design.md D4).
   */
  async eliminar(usuarioId: string, apoderadoId: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.verificarEstudiante(tx, usuarioId);

      const actual = await tx.apoderado.findFirst({
        where: { id: apoderadoId, usuario_id: usuarioId },
      });
      if (!actual) {
        throw new NotFoundException('Apoderado no encontrado');
      }

      await tx.apoderado.delete({ where: { id: apoderadoId } });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.APODERADO_ELIMINADO,
        actorId,
        'Apoderado',
        apoderadoId,
        {
          usuario_id: usuarioId,
          nombres: actual.nombres,
          dni: actual.dni,
        } as Prisma.InputJsonValue,
      );
    });
  }
}
