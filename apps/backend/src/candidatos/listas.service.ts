import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Lista, Prisma } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { CANDIDATOS_ERROR_CODES } from './candidatos.errors';
import type { ListaRespuestaDto } from './dto/lista-respuesta.dto';
import type { PlanTrabajoRespuestaDto } from './dto/plan-trabajo-respuesta.dto';

// candidatos-listas-opciones-consulta, PR2 (design.md D5, tarea 5.7). Forma mínima que `crear()`
// necesita de un alta de `Lista`.
export interface DatosLista {
  proceso_id: string;
  nombre: string;
  numero: number;
  simbolo?: string;
  lema?: string;
  propuesta?: string;
}

// design.md D5, tarea 5.7. `PATCH /listas/:id` acepta cualquier subconjunto de estos campos —
// `proceso_id` NUNCA aparece aquí a propósito (sin re-parentado, mismo criterio D3 de
// `AulasService`).
export type DatosActualizarLista = Partial<Omit<DatosLista, 'proceso_id'>>;

export interface FiltroListadoListas {
  proceso_id?: string;
  estado?: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_VALIDOS = ['activo', 'baja'] as const;

// candidatos-listas-opciones-consulta, PR2 (mismo criterio module-local que `esP2002`/`esP2003` de
// `users.service.ts`: cada módulo declara sus propios traductores de error de Prisma, sin importar
// entre módulos de dominio).
function esP2002(error: unknown): error is { code: 'P2002'; meta?: { target?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function esP2003(error: unknown): error is { code: 'P2003'; meta?: { field_name?: unknown } } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2003'
  );
}

function relacionDesdeFieldName(fieldName: unknown): string {
  if (typeof fieldName !== 'string' || fieldName.length === 0) {
    return 'desconocida';
  }
  const separador = fieldName.indexOf('_');
  const relacion = separador === -1 ? fieldName : fieldName.slice(0, separador);
  return relacion.length > 0 ? relacion : 'desconocida';
}

/** design.md D5, tarea 5.7. `nombre` y `numero` son obligatorios en la creación. */
function validarDatosLista(datos: Pick<DatosLista, 'nombre' | 'numero'>): void {
  if (!datos.nombre) {
    throw new BadRequestException({
      codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'nombre',
      motivo: 'requerido',
    });
  }
  if (!Number.isInteger(datos.numero)) {
    throw new BadRequestException({
      codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'numero',
      motivo: 'formato',
    });
  }
}

function mapearListaRespuesta(lista: Lista): ListaRespuestaDto {
  return {
    id: lista.id,
    proceso_id: lista.proceso_id,
    nombre: lista.nombre,
    numero: lista.numero,
    simbolo: lista.simbolo ?? undefined,
    lema: lista.lema ?? undefined,
    propuesta: lista.propuesta ?? undefined,
    estado: lista.estado,
    baja_en: lista.baja_en ? lista.baja_en.toISOString() : undefined,
    plan_trabajo_presente: lista.plan_trabajo !== null,
    plan_trabajo_nombre: lista.plan_trabajo_nombre ?? undefined,
  };
}

function mapearPlanTrabajoRespuesta(lista: Lista): PlanTrabajoRespuestaDto {
  return {
    plan_trabajo_presente: lista.plan_trabajo !== null,
    plan_trabajo_nombre: lista.plan_trabajo_nombre ?? undefined,
  };
}

/**
 * candidatos-listas-opciones-consulta, PR2 (design.md D5-D9, tareas 5.7/6.8). CRUD de `Lista`
 * acotada a un `ProcesoElectoral` existente, baja/reactivación distinta del borrado físico (D6),
 * borrado guardado con precomprobación de `Voto` y `Candidato` dependientes en ese orden (D7), y
 * el subrecurso de plan de trabajo en PDF (D4/D8, espejo de `ConfiguracionService.actualizarLogo`).
 */
@Injectable()
export class ListasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * D5/D9: precomprobación explícita de existencia de `ProcesoElectoral` y de unicidad de
   * `(proceso_id, numero)`, más `catch P2002`/`P2003` residuales como red de seguridad (mismo
   * patrón que `AulasService.crear()`).
   */
  async crear(datos: DatosLista, actorId: string): Promise<ListaRespuestaDto> {
    validarDatosLista(datos);

    try {
      const lista = await this.prisma.$transaction(async (tx) => {
        const proceso = await tx.procesoElectoral.findUnique({ where: { id: datos.proceso_id } });
        if (!proceso) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'ProcesoElectoral',
            campo: 'proceso_id',
            valor: datos.proceso_id,
          });
        }

        const existente = await tx.lista.findFirst({
          where: { proceso_id: datos.proceso_id, numero: datos.numero },
        });
        if (existente) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Lista',
            campos: ['proceso_id', 'numero'],
          });
        }

        const creada = await tx.lista.create({
          data: {
            proceso_id: datos.proceso_id,
            nombre: datos.nombre,
            numero: datos.numero,
            simbolo: datos.simbolo,
            lema: datos.lema,
            propuesta: datos.propuesta,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.LISTA_CREADA,
          actorId,
          'Lista',
          creada.id,
          {
            proceso_id: creada.proceso_id,
            nombre: creada.nombre,
            numero: creada.numero,
          } as Prisma.InputJsonValue,
        );

        return creada;
      });

      return mapearListaRespuesta(lista);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Lista',
          campos: ['proceso_id', 'numero'],
        });
      }
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'ProcesoElectoral',
          campo: 'proceso_id',
          valor: datos.proceso_id,
        });
      }
      throw error;
    }
  }

  /**
   * design.md "Contratos HTTP", tarea 5.7, spec "GET /listas?proceso_id=&estado= nunca expone
   * bytes". Filtro no-UUID/estado fuera de enum -> `400 CAMPO_INVALIDO`.
   */
  async listar(filtro: FiltroListadoListas): Promise<ListaRespuestaDto[]> {
    if (filtro.proceso_id !== undefined && !UUID_REGEX.test(filtro.proceso_id)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'proceso_id',
        motivo: 'formato',
      });
    }
    if (filtro.estado !== undefined && !(ESTADOS_VALIDOS as readonly string[]).includes(filtro.estado)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'estado',
        motivo: 'formato',
      });
    }

    const where: Prisma.ListaWhereInput = {};
    if (filtro.proceso_id !== undefined) {
      where.proceso_id = filtro.proceso_id;
    }
    if (filtro.estado !== undefined) {
      where.estado = filtro.estado as Lista['estado'];
    }

    const listas = await this.prisma.lista.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { numero: 'asc' },
    });

    return listas.map(mapearListaRespuesta);
  }

  async obtenerPorId(id: string): Promise<Lista> {
    const lista = await this.prisma.lista.findUnique({ where: { id } });
    if (!lista) {
      throw new NotFoundException('Lista no encontrada');
    }
    return lista;
  }

  /** GET /listas/:id — spec "CRUD de Lista/Candidato/OpciónConsulta". */
  async detalle(id: string): Promise<ListaRespuestaDto> {
    return mapearListaRespuesta(await this.obtenerPorId(id));
  }

  /**
   * D5/D9: sin re-parentado (`proceso_id` no está en `DatosActualizarLista`). `numero` sigue
   * siendo único si cambia — misma precomprobación + `catch P2002` residual que `crear()`.
   */
  async actualizar(id: string, datos: DatosActualizarLista, actorId: string): Promise<ListaRespuestaDto> {
    if (datos.nombre !== undefined && !datos.nombre) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'nombre',
        motivo: 'requerido',
      });
    }
    if (datos.numero !== undefined && !Number.isInteger(datos.numero)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'numero',
        motivo: 'formato',
      });
    }

    try {
      const lista = await this.prisma.$transaction(async (tx) => {
        const actual = await tx.lista.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Lista no encontrada');
        }

        if (datos.numero !== undefined && datos.numero !== actual.numero) {
          const existente = await tx.lista.findFirst({
            where: { proceso_id: actual.proceso_id, numero: datos.numero, NOT: { id } },
          });
          if (existente) {
            throw new ConflictException({
              codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
              entidad: 'Lista',
              campos: ['proceso_id', 'numero'],
            });
          }
        }

        const actualizada = await tx.lista.update({
          where: { id },
          data: {
            nombre: datos.nombre ?? undefined,
            numero: datos.numero ?? undefined,
            simbolo: datos.simbolo ?? undefined,
            lema: datos.lema ?? undefined,
            propuesta: datos.propuesta ?? undefined,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.LISTA_ACTUALIZADA,
          actorId,
          'Lista',
          actualizada.id,
          { campos: Object.keys(datos) } as Prisma.InputJsonValue,
        );

        return actualizada;
      });

      return mapearListaRespuesta(lista);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Lista',
          campos: ['proceso_id', 'numero'],
        });
      }
      throw error;
    }
  }

  /**
   * D6, tarea 5.7, spec "Baja de candidato con proceso abierto, aplicado a Lista". `estado`
   * expresa el ESTADO DESTINO — `baja` fija `baja_en=now()`, `activo` (reactivación) lo limpia.
   * Permitido en cualquier `Proceso.estado` (D6): esta operación nunca consulta `Proceso.estado`.
   */
  async cambiarEstado(id: string, destino: string, actorId: string): Promise<ListaRespuestaDto> {
    if (!(ESTADOS_VALIDOS as readonly string[]).includes(destino)) {
      throw new BadRequestException({
        codigo: CANDIDATOS_ERROR_CODES.ESTADO_INVALIDO,
        valor_recibido: destino,
      });
    }

    const lista = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.lista.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Lista no encontrada');
      }

      if (actual.estado === destino) {
        return actual;
      }

      const actualizada = await tx.lista.update({
        where: { id },
        data: {
          estado: destino as Lista['estado'],
          baja_en: destino === 'baja' ? new Date() : null,
        },
      });

      await this.auditoria.log(
        tx,
        destino === 'baja' ? AUDIT_EVENT_TYPES.LISTA_DADA_DE_BAJA : AUDIT_EVENT_TYPES.LISTA_REACTIVADA,
        actorId,
        'Lista',
        id,
        { estado_anterior: actual.estado } as Prisma.InputJsonValue,
      );

      return actualizada;
    });

    return mapearListaRespuesta(lista);
  }

  /**
   * D7, tarea 5.7, spec "Borrado físico rechazado con votos asociados, aplicado a Lista".
   * Precomprobación explícita de `Voto` y `Candidato` dependientes, en ese orden, más `catch
   * P2003` residual como red de seguridad (patrón literal de `AulasService.eliminar()`).
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const actual = await tx.lista.findUnique({ where: { id } });
        if (!actual) {
          throw new NotFoundException('Lista no encontrada');
        }

        const votos = await tx.voto.count({ where: { lista_id: id } });
        if (votos > 0) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Lista',
            relacion: 'Voto',
          });
        }

        const candidatos = await tx.candidato.count({ where: { lista_id: id } });
        if (candidatos > 0) {
          throw new ConflictException({
            codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
            entidad: 'Lista',
            relacion: 'Candidato',
          });
        }

        await tx.lista.delete({ where: { id } });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.LISTA_ELIMINADA,
          actorId,
          'Lista',
          id,
          {
            proceso_id: actual.proceso_id,
            nombre: actual.nombre,
            numero: actual.numero,
          } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (esP2003(error)) {
        throw new ConflictException({
          codigo: CANDIDATOS_ERROR_CODES.ENTIDAD_CON_DEPENDIENTES,
          entidad: 'Lista',
          relacion: relacionDesdeFieldName(error.meta?.field_name),
        });
      }
      throw error;
    }
  }

  /**
   * D4/D8, tarea 6.8, espejo de `ConfiguracionService.actualizarLogo()`. `archivo` ya pasó el
   * `fileFilter`/`limits` de `filtroPlanTrabajo` (allowlist + 5MB) antes de llegar acá; solo queda
   * la comprobación de contenido vacío, que `fileFilter` no puede hacer (el tamaño del stream no se
   * conoce hasta terminar de leerlo).
   */
  async subirPlanTrabajo(
    id: string,
    archivo: { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    actorId: string,
  ): Promise<PlanTrabajoRespuestaDto> {
    if (!archivo || archivo.buffer.length === 0) {
      throw new BadRequestException({ codigo: CANDIDATOS_ERROR_CODES.ARCHIVO_VACIO });
    }

    const lista = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.lista.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Lista no encontrada');
      }

      const actualizada = await tx.lista.update({
        where: { id },
        data: {
          plan_trabajo: archivo.buffer,
          plan_trabajo_mime: archivo.mimetype,
          plan_trabajo_nombre: archivo.originalname,
        },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LISTA_PLAN_TRABAJO_ACTUALIZADO,
        actorId,
        'Lista',
        id,
        { presente: true, nombre: archivo.originalname } as Prisma.InputJsonValue,
      );

      return actualizada;
    });

    return mapearPlanTrabajoRespuesta(lista);
  }

  /** GET /listas/:id/plan-trabajo — 404 si no hay PDF almacenado (nunca `undefined`/`500`). */
  async obtenerPlanTrabajo(id: string): Promise<{ buffer: Buffer; mime: string; nombre: string }> {
    const lista = await this.obtenerPorId(id);
    if (!lista.plan_trabajo) {
      throw new NotFoundException('La lista no tiene plan de trabajo almacenado');
    }
    return {
      buffer: lista.plan_trabajo,
      mime: lista.plan_trabajo_mime ?? 'application/pdf',
      nombre: lista.plan_trabajo_nombre ?? 'plan-trabajo.pdf',
    };
  }

  /** DELETE /listas/:id/plan-trabajo — limpia las 3 columnas y audita `{presente:false}`. */
  async eliminarPlanTrabajo(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.lista.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Lista no encontrada');
      }

      await tx.lista.update({
        where: { id },
        data: { plan_trabajo: null, plan_trabajo_mime: null, plan_trabajo_nombre: null },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LISTA_PLAN_TRABAJO_ACTUALIZADO,
        actorId,
        'Lista',
        id,
        { presente: false } as Prisma.InputJsonValue,
      );
    });
  }
}
