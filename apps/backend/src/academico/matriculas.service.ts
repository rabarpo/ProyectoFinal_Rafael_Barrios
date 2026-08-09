import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Matricula, Prisma, Turno } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ACADEMICO_ERROR_CODES } from './academico.errors';
import type { MatriculaRespuestaDto } from './dto/matricula-respuesta.dto';
import { esP2002, esP2003, traducirRestriccion } from './prisma-errores';

// administracion-academica, PR7 (design.md D3/SE1, tarea 24.1). Forma mínima que `crear()`
// necesita de un alta de `Matricula`. Sin `DatosActualizarMatricula`: la spec no define `PATCH`
// para `Matricula` (D3, "sin re-parentado" — un traslado es DELETE + POST).
export interface DatosMatricula {
  usuario_id: string;
  aula_id: string;
  anio_escolar_id: string;
}

export interface FiltroListadoMatriculas {
  usuario_id?: string;
  aula_id?: string;
  anio_escolar_id?: string;
}

// importacion-excel (#9), student-enrollment delta (tarea 1.1-1.2). Forma que `crearIdempotente()`
// necesita: referencias legibles (`grado_nombre`/`seccion_nombre`/`turno`/`anio_escolar_codigo`),
// nunca UUID — la fila de origen de un Excel/CSV no trae ids internos.
export interface DatosMatriculaIdempotente {
  usuario_id: string;
  grado_nombre: string;
  seccion_nombre: string;
  turno: Turno;
  anio_escolar_codigo: string;
}

// UUID v4 no es un requisito estricto de este proyecto (`@db.Uuid` de Postgres acepta cualquier
// UUID válido, no solo v4) — mismo criterio laxo que `ParseUUIDPipe` de Nest y que el resto de
// filtros del módulo (D5).
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mapearMatriculaRespuesta(matricula: Matricula): MatriculaRespuestaDto {
  return {
    id: matricula.id,
    usuario_id: matricula.usuario_id,
    aula_id: matricula.aula_id,
    anio_escolar_id: matricula.anio_escolar_id,
  };
}

/**
 * administracion-academica, PR7 (design.md D2/D3/D5/D6, tareas 25.6, 26.1-26.2, 27.2). CRUD de
 * `Matricula` acotado a un `Usuario` con `rol = 'estudiante'`, un `Aula` y un `AnioEscolar`
 * existentes, con la guarda de coherencia jerárquica (D6): `anio_escolar_id` DEBE coincidir con el
 * `anio_escolar_id` del `Aula` referenciada. Sin `PATCH` (D3): un traslado es `DELETE` + `POST`.
 */
@Injectable()
export class MatriculasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * design.md "Contratos HTTP", tarea 26.2, spec "GET /matriculas?usuario_id=&aula_id=&anio_escolar_id=".
   * Filtro no-UUID -> `400 CAMPO_INVALIDO`, nunca un `500` de Prisma sobre un filtro malformado.
   */
  async listar(filtro: FiltroListadoMatriculas): Promise<MatriculaRespuestaDto[]> {
    if (filtro.usuario_id !== undefined && !UUID_REGEX.test(filtro.usuario_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'usuario_id',
        motivo: 'formato',
      });
    }
    if (filtro.aula_id !== undefined && !UUID_REGEX.test(filtro.aula_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'aula_id',
        motivo: 'formato',
      });
    }
    if (filtro.anio_escolar_id !== undefined && !UUID_REGEX.test(filtro.anio_escolar_id)) {
      throw new BadRequestException({
        codigo: ACADEMICO_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'anio_escolar_id',
        motivo: 'formato',
      });
    }

    const where: Prisma.MatriculaWhereInput = {};
    if (filtro.usuario_id !== undefined) {
      where.usuario_id = filtro.usuario_id;
    }
    if (filtro.aula_id !== undefined) {
      where.aula_id = filtro.aula_id;
    }
    if (filtro.anio_escolar_id !== undefined) {
      where.anio_escolar_id = filtro.anio_escolar_id;
    }

    const matriculas = await this.prisma.matricula.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { id: 'asc' },
    });

    return matriculas.map(mapearMatriculaRespuesta);
  }

  /** GET /matriculas/:id — spec "Consulta y listado de Matrícula". */
  async obtenerPorId(id: string): Promise<MatriculaRespuestaDto> {
    const matricula = await this.prisma.matricula.findUnique({ where: { id } });
    if (!matricula) {
      throw new NotFoundException('Matricula no encontrada');
    }
    return mapearMatriculaRespuesta(matricula);
  }

  /**
   * D2/D5/D6/SE1/SE2: precomprobación de existencia de `Usuario`/`Aula`/`AnioEscolar`
   * referenciados, restricción `Usuario.rol = 'estudiante'`, guarda de coherencia jerárquica
   * contra el `Aula` (D6), precomprobación de unicidad de `(usuario_id, aula_id,
   * anio_escolar_id)`, más `catch P2002`/`P2003` residuales como red de seguridad.
   */
  async crear(datos: DatosMatricula, actorId: string): Promise<MatriculaRespuestaDto> {
    try {
      const matricula = await this.prisma.$transaction(async (tx) => {
        const usuario = await tx.usuario.findUnique({ where: { id: datos.usuario_id } });
        if (!usuario) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Usuario',
            campo: 'usuario_id',
            valor: datos.usuario_id,
          });
        }

        const aula = await tx.aula.findUnique({ where: { id: datos.aula_id } });
        if (!aula) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'Aula',
            campo: 'aula_id',
            valor: datos.aula_id,
          });
        }

        const anioEscolar = await tx.anioEscolar.findUnique({ where: { id: datos.anio_escolar_id } });
        if (!anioEscolar) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: 'AnioEscolar',
            campo: 'anio_escolar_id',
            valor: datos.anio_escolar_id,
          });
        }

        // SE1: solo un Usuario con rol = 'estudiante' puede matricularse — mismo código
        // USUARIO_NO_ES_ESTUDIANTE que ApoderadosService.verificarEstudiante() de #7.
        if (usuario.rol !== 'estudiante') {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.USUARIO_NO_ES_ESTUDIANTE,
            rol_actual: usuario.rol,
          });
        }

        // D6/SE2: coherencia jerárquica — anio_escolar_id de la Matricula DEBE coincidir con el
        // del Aula referenciada. El esquema no lo garantiza (dos FK independientes).
        if (aula.anio_escolar_id !== datos.anio_escolar_id) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.COHERENCIA_JERARQUICA,
            campo: 'anio_escolar_id',
            esperado: aula.anio_escolar_id,
            recibido: datos.anio_escolar_id,
          });
        }

        const existente = await tx.matricula.findFirst({
          where: {
            usuario_id: datos.usuario_id,
            aula_id: datos.aula_id,
            anio_escolar_id: datos.anio_escolar_id,
          },
        });
        if (existente) {
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
            entidad: 'Matricula',
            campos: ['usuario_id', 'aula_id', 'anio_escolar_id'],
          });
        }

        const creada = await tx.matricula.create({
          data: {
            usuario_id: datos.usuario_id,
            aula_id: datos.aula_id,
            anio_escolar_id: datos.anio_escolar_id,
          },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.MATRICULA_CREADA,
          actorId,
          'Matricula',
          creada.id,
          {
            usuario_id: creada.usuario_id,
            aula_id: creada.aula_id,
            anio_escolar_id: creada.anio_escolar_id,
          } as Prisma.InputJsonValue,
        );

        return creada;
      });

      return mapearMatriculaRespuesta(matricula);
    } catch (error) {
      if (esP2002(error)) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.RESTRICCION_UNICA,
          entidad: 'Matricula',
          campos: traducirRestriccion(error.meta?.target),
        });
      }
      if (esP2003(error)) {
        // Red de seguridad (carrera entre la precomprobación y el `create`) — mismo precedente
        // que `AulasService.crear()`: el `catch` residual reporta la primera FK verificada
        // (`usuario_id`), la precomprobación explícita ya cubrió las tres con mensaje preciso.
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'Usuario',
          campo: 'usuario_id',
          valor: datos.usuario_id,
        });
      }
      throw error;
    }
  }

  /**
   * importacion-excel (#9), student-enrollment delta (tareas 1.1-1.2). Gancho invocable fila a
   * fila sin depender de HTTP: reutiliza sin duplicar las mismas validaciones vigentes de
   * `crear()` (existencia de `Usuario`/`Aula`/`AnioEscolar`, `Usuario.rol = 'estudiante'`,
   * coherencia jerárquica D6), pero resuelve `Aula`/`AnioEscolar` desde referencias legibles
   * (`grado_nombre`, `seccion_nombre`, `turno`, `anio_escolar_codigo`) en vez de UUID, y devuelve
   * `creado: false` en la combinación ya existente en vez de `409 RESTRICCION_UNICA`. `tx` externo
   * opcional — mismo criterio que `UsersService.crearIdempotente()`: si llega, participa de la
   * transacción del llamador y no abre una propia.
   */
  async crearIdempotente(
    datos: DatosMatriculaIdempotente,
    actorId: string,
    txExterno?: Prisma.TransactionClient,
  ): Promise<{ matricula: MatriculaRespuestaDto; creado: boolean }> {
    const ejecutar = async (tx: Prisma.TransactionClient) => {
      const usuario = await tx.usuario.findUnique({ where: { id: datos.usuario_id } });
      if (!usuario) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'Usuario',
          campo: 'usuario_id',
          valor: datos.usuario_id,
        });
      }

      const anioEscolar = await tx.anioEscolar.findUnique({ where: { nombre: datos.anio_escolar_codigo } });
      if (!anioEscolar) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'AnioEscolar',
          campo: 'anio_escolar_codigo',
          valor: datos.anio_escolar_codigo,
        });
      }

      // Clave compuesta (grado.nombre, seccion.nombre, turno) — Aula no declara un campo `codigo`
      // propio (delta student-enrollment).
      const aula = await tx.aula.findFirst({
        where: {
          turno: datos.turno,
          grado: { nombre: datos.grado_nombre },
          seccion: { nombre: datos.seccion_nombre },
        },
      });
      if (!aula) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
          entidad: 'Aula',
          campo: 'aula',
          valor: `${datos.grado_nombre}/${datos.seccion_nombre}/${datos.turno}`,
        });
      }

      // SE1 reutilizada: solo un Usuario con rol = 'estudiante' puede matricularse.
      if (usuario.rol !== 'estudiante') {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.USUARIO_NO_ES_ESTUDIANTE,
          rol_actual: usuario.rol,
        });
      }

      // D6/SE2 reutilizada: el Aula resuelta desde (grado_nombre, seccion_nombre, turno) DEBE
      // coincidir en anio_escolar_id con el AnioEscolar resuelto desde anio_escolar_codigo.
      if (aula.anio_escolar_id !== anioEscolar.id) {
        throw new ConflictException({
          codigo: ACADEMICO_ERROR_CODES.COHERENCIA_JERARQUICA,
          campo: 'anio_escolar_id',
          esperado: aula.anio_escolar_id,
          recibido: anioEscolar.id,
        });
      }

      const existente = await tx.matricula.findFirst({
        where: { usuario_id: datos.usuario_id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      });
      if (existente) {
        return { matricula: mapearMatriculaRespuesta(existente), creado: false };
      }

      try {
        const creada = await tx.matricula.create({
          data: { usuario_id: datos.usuario_id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
        });

        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.MATRICULA_CREADA,
          actorId,
          'Matricula',
          creada.id,
          {
            usuario_id: creada.usuario_id,
            aula_id: creada.aula_id,
            anio_escolar_id: creada.anio_escolar_id,
            origen: 'idempotente',
          } as Prisma.InputJsonValue,
        );

        return { matricula: mapearMatriculaRespuesta(creada), creado: true };
      } catch (error) {
        if (esP2002(error)) {
          // P2002 residual (carrera entre la precomprobación y el `create`): converge a
          // `creado: false` en vez de `409` — mismo criterio D5 (garantía 4) que
          // `UsersService.crearIdempotente()`.
          const carrera = await tx.matricula.findFirst({
            where: { usuario_id: datos.usuario_id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
          });
          if (carrera) {
            return { matricula: mapearMatriculaRespuesta(carrera), creado: false };
          }
        }
        throw error;
      }
    };

    if (txExterno) {
      return ejecutar(txExterno);
    }
    return this.prisma.$transaction(ejecutar);
  }

  /**
   * importacion-excel (#9), corrección PR2 (spec "Idempotencia por fila reutilizando los servicios
   * existentes", escenario "Clave compuesta de Aula que no resuelve a ningún Aula existente se
   * reporta"). Lectura pura, SIN abrir transacción propia ni recibir `tx` externo: le permite a
   * `ImportacionService` decidir, ANTES de abrir su `prisma.$transaction` compartida por fila, si
   * esta fila cae en la excepción puntual de atomicidad (Aula/AnioEscolar inexistente — el Usuario,
   * si es válido, igual se crea) o si debe envolver Usuario+Matricula en la misma transacción (el
   * MUST "misma transacción por fila" cubre TODOS los demás fallos: rol inválido, coherencia
   * jerárquica, campo duplicado/formato de Usuario, etc.).
   *
   * Repite deliberadamente solo los dos `findFirst`/`findUnique` de EXISTENCIA de
   * `crearIdempotente()` — la coherencia jerárquica (D6/SE2) y el rol de Usuario (SE1) NO se
   * verifican aquí: esos fallos sí deben ser atómicos con el Usuario, así que quedan exclusivamente
   * para el camino normal dentro de la transacción compartida de `ImportacionService`.
   */
  async resolverReferenciasAula(
    datos: Pick<DatosMatriculaIdempotente, 'grado_nombre' | 'seccion_nombre' | 'turno' | 'anio_escolar_codigo'>,
  ): Promise<{ ok: true } | { ok: false; entidad: 'AnioEscolar' | 'Aula'; campo: string; valor: string }> {
    const anioEscolar = await this.prisma.anioEscolar.findUnique({ where: { nombre: datos.anio_escolar_codigo } });
    if (!anioEscolar) {
      return {
        ok: false,
        entidad: 'AnioEscolar',
        campo: 'anio_escolar_codigo',
        valor: datos.anio_escolar_codigo,
      };
    }

    const aula = await this.prisma.aula.findFirst({
      where: {
        turno: datos.turno,
        grado: { nombre: datos.grado_nombre },
        seccion: { nombre: datos.seccion_nombre },
      },
    });
    if (!aula) {
      return {
        ok: false,
        entidad: 'Aula',
        campo: 'aula',
        valor: `${datos.grado_nombre}/${datos.seccion_nombre}/${datos.turno}`,
      };
    }

    return { ok: true };
  }

  /**
   * design.md D2, tarea 27.2, spec "DELETE físico de Matrícula (retiro/traslado)". Borrado físico
   * real, sin precomprobación de dependientes: `Matricula` no tiene relaciones entrantes (D2, tabla
   * "Entidad | Relaciones dependientes verificadas" — "Matricula: ninguna").
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const actual = await tx.matricula.findUnique({ where: { id } });
      if (!actual) {
        throw new NotFoundException('Matricula no encontrada');
      }

      await tx.matricula.delete({ where: { id } });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.MATRICULA_ELIMINADA,
        actorId,
        'Matricula',
        id,
        {
          usuario_id: actual.usuario_id,
          aula_id: actual.aula_id,
          anio_escolar_id: actual.anio_escolar_id,
        } as Prisma.InputJsonValue,
      );
    });
  }
}
