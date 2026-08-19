import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ProcesoElectoral } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';
import { PrismaService } from '../prisma/prisma.service';
import type { ActualizarProcesoDto } from './dto/actualizar-proceso.dto';
import type { CrearProcesoDto } from './dto/crear-proceso.dto';
import type { ListarProcesosQueryDto } from './dto/listar-procesos.query';
import type { ProcesoDetalleRespuestaDto } from './dto/proceso-detalle-respuesta.dto';
import type { ProcesoRespuestaDto } from './dto/proceso-respuesta.dto';
import type { AbrirProcesoDto } from './dto/abrir-proceso.dto';
import type { AperturaRespuestaDto } from './dto/apertura-respuesta.dto';
import type { CerrarProcesoDto, FirmanteDto } from './dto/cerrar-proceso.dto';
import type { CierreRespuestaDto } from './dto/cierre-respuesta.dto';
import { armarActas } from './actas-contenido';
import { calcularEscrutinio } from './escrutinio';
import { resolverAulas, validarSegmentacion } from './padron.service';
import { PROCESOS_ERROR_CODES } from './procesos.errors';

const TIPOS_VALIDOS = ['municipio', 'representante_aula', 'padres', 'consulta'] as const;
const ESTADOS_VALIDOS = ['borrador', 'abierto', 'cerrado', 'acta_emitida'] as const;

// apertura-proceso-congelamiento-padron (#13, PR2; design.md D6/D8). `en_calidad_de` sigue siendo
// `String` en el schema (sin enum `CalidadVotante`): los dos literales posibles se fijan acá porque
// PR2 ya los necesita para el conteo de `respuestaApertura()`; PR3 (D6/D8) reusa las mismas dos
// cadenas para escribir las filas reales de `DerechoVoto`.
const CALIDAD_ESTUDIANTE = 'estudiante';
const CALIDAD_PADRE = 'padre';

// apertura-proceso-congelamiento-padron (#13, PR3; design.md D7, tarea 9.7). `DerechoVoto` inserta
// 5 columnas por fila y Prisma genera el `id` uuid del lado del cliente, así que cada fila liga 5
// parámetros — el protocolo de Postgres tope en 65535 por sentencia (~13k filas). VERIFICADO en
// apply: el query builder de `@prisma/client` (`createMany`) arma un único `INSERT ... VALUES` con
// todas las filas del array de entrada — no trocea internamente sobre el límite de parámetros del
// protocolo. El troceado manual de abajo es, por lo tanto, necesario (no redundante); 5000 deja
// margen amplio sin acercarse al techo real de ~13k filas.
const LOTE_DERECHOS = 5000;

type PrismaAulasGradosNivelMatricula = Pick<PrismaService, 'aula' | 'grado' | 'nivel' | 'matricula'>;

function mapearRespuesta(
  proceso: ProcesoElectoral,
  aulas: string[],
  aulasExcluidas: string[],
): ProcesoRespuestaDto {
  return {
    id: proceso.id,
    nombre: proceso.nombre,
    descripcion: proceso.descripcion ?? undefined,
    tipo: proceso.tipo,
    estado: proceso.estado,
    fecha_apertura_prevista: proceso.fecha_apertura_prevista.toISOString(),
    fecha_cierre_prevista: proceso.fecha_cierre_prevista.toISOString(),
    ocultar_resultados: proceso.ocultar_resultados,
    publico_objetivo: proceso.publico_objetivo,
    alcance: proceso.alcance,
    nivel_id_snapshot: proceso.nivel_id_snapshot ?? undefined,
    grado_ids_snapshot: proceso.grado_ids_snapshot,
    aulas,
    aulas_excluidas: aulasExcluidas,
  };
}

/**
 * design.md D5, tarea 16.2. `nombre`/`tipo`/fechas — mismos códigos que `validarSegmentacion()`
 * (D5 de #7/#8: `400 CAMPO_INVALIDO` cuando el valor es inaceptable por sí mismo).
 */
function validarDatos(dto: CrearProcesoDto): { apertura: Date; cierre: Date } {
  if (!dto.nombre) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'nombre', motivo: 'requerido' });
  }
  if (!(TIPOS_VALIDOS as readonly string[]).includes(dto.tipo)) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'tipo', motivo: 'formato' });
  }

  const apertura = new Date(dto.fecha_apertura_prevista);
  if (Number.isNaN(apertura.getTime())) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_apertura_prevista',
      motivo: 'formato',
    });
  }

  const cierre = new Date(dto.fecha_cierre_prevista);
  if (Number.isNaN(cierre.getTime())) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_cierre_prevista',
      motivo: 'formato',
    });
  }

  if (cierre.getTime() <= apertura.getTime()) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_cierre_prevista',
      motivo: 'rango',
    });
  }

  return { apertura, cierre };
}

/**
 * design.md D3, tarea 16.2. Aulas del conjunto resuelto que tienen al menos una `Matricula` de un
 * estudiante activo en el año escolar activo — misma condición de elegibilidad base que
 * `PadronService` (D2), pero acá solo importa la existencia (`> 0`), no el conteo: es la exclusión
 * de aulas de la spec ("Aula sin matrícula activa queda excluida del lote"), no un padrón.
 */
async function aulasConMatriculaActiva(
  prisma: PrismaAulasGradosNivelMatricula,
  anioEscolarId: string,
  aulaIds: string[],
): Promise<Set<string>> {
  if (aulaIds.length === 0) {
    return new Set();
  }
  const grupos = await prisma.matricula.groupBy({
    by: ['aula_id'],
    where: {
      anio_escolar_id: anioEscolarId,
      aula_id: { in: aulaIds },
      usuario: { estado: 'activo', rol: 'estudiante' },
    },
    orderBy: { aula_id: 'asc' },
    _count: { _all: true },
  });
  return new Set(grupos.filter((g) => g._count._all > 0).map((g) => g.aula_id));
}

/**
 * design.md D5, tarea 20.1/20.7. Igual que `validarDatos()`, pero cada campo es opcional en
 * `ActualizarProcesoDto`: cuando el body lo omite, se conserva el valor persistido. `tipo`/`estado`
 * ni siquiera están en el tipo de `dto` (D3), así que no hay nada que "conservar por omisión" para
 * ellos — no compilan como parte del PATCH.
 */
function validarActualizacion(
  dto: ActualizarProcesoDto,
  existente: ProcesoElectoral,
): { nombre: string; descripcion?: string; apertura: Date; cierre: Date; ocultarResultados: boolean } {
  const nombre = dto.nombre !== undefined ? dto.nombre : existente.nombre;
  if (!nombre) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'nombre', motivo: 'requerido' });
  }

  const descripcion = dto.descripcion !== undefined ? dto.descripcion : (existente.descripcion ?? undefined);

  const apertura = new Date(dto.fecha_apertura_prevista ?? existente.fecha_apertura_prevista.toISOString());
  if (Number.isNaN(apertura.getTime())) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_apertura_prevista',
      motivo: 'formato',
    });
  }

  const cierre = new Date(dto.fecha_cierre_prevista ?? existente.fecha_cierre_prevista.toISOString());
  if (Number.isNaN(cierre.getTime())) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_cierre_prevista',
      motivo: 'formato',
    });
  }

  if (cierre.getTime() <= apertura.getTime()) {
    throw new BadRequestException({
      codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'fecha_cierre_prevista',
      motivo: 'rango',
    });
  }

  const ocultarResultados = dto.ocultar_resultados !== undefined ? dto.ocultar_resultados : existente.ocultar_resultados;

  return { nombre, descripcion, apertura, cierre, ocultarResultados };
}

/**
 * apertura-proceso-congelamiento-padron (#13, PR2; design.md D10, tarea 6.6). Construye
 * `AperturaRespuestaDto` a partir del estado VIGENTE, no de "lo que se creó ahora": el camino
 * idempotente (D5) y el camino de la primera apertura reusan exactamente esta función, así ambos
 * responden con la misma forma. Los conteos se leen con `count()` real dentro de la misma
 * transacción — en PR2 la tabla `DerechoVoto` está siempre vacía para procesos recién abiertos
 * porque la materialización todavía no existe (PR3, D6-D8); esta función ya queda correcta para
 * cuando PR3 la puebla, sin cambios.
 */
async function respuestaApertura(
  tx: Prisma.TransactionClient,
  procesoId: string,
  aperturaReal: Date,
  ocultarResultados: boolean,
): Promise<AperturaRespuestaDto> {
  const [aulas, derechosEstudiante, derechosPadre] = await Promise.all([
    tx.procesoAula.count({ where: { proceso_id: procesoId } }),
    tx.derechoVoto.count({ where: { proceso_id: procesoId, en_calidad_de: CALIDAD_ESTUDIANTE } }),
    tx.derechoVoto.count({ where: { proceso_id: procesoId, en_calidad_de: CALIDAD_PADRE } }),
  ]);

  return {
    id: procesoId,
    estado: 'abierto',
    apertura_real: aperturaReal.toISOString(),
    ocultar_resultados: ocultarResultados,
    aulas,
    derechos_totales: derechosEstudiante + derechosPadre,
    derechos_estudiante: derechosEstudiante,
    derechos_padre: derechosPadre,
  };
}

/**
 * cierre-escrutinio-actas (#17, PR3; design.md D4/D9). Respuesta de `cerrar()`: describe el
 * ESTADO VIGENTE (mismo criterio silencioso de `respuestaApertura()`). `actas_creadas` se cuenta
 * en vivo (no se hardcodea `4`) para que el 200 no-op de la relectura fuera de transacción (catch
 * de `P2034`, D4) reporte lo que realmente existe, incluso en el arnés determinista de la carrera
 * (Phase 13) donde ninguna `Acta` llegó a crearse todavía.
 */
async function respuestaCierre(
  client: Pick<Prisma.TransactionClient, 'acta'>,
  procesoId: string,
  estado: 'cerrado' | 'acta_emitida',
  cierreReal: Date,
): Promise<CierreRespuestaDto> {
  const actasCreadas = await client.acta.count({ where: { proceso_id: procesoId } });
  return { id: procesoId, estado, cierre_real: cierreReal.toISOString(), actas_creadas: actasCreadas };
}

const MAX_FIRMANTES = 10;
const MAX_LARGO_FIRMANTE = 120;

/**
 * cierre-escrutinio-actas (#17, PR3; design.md D9). Validación a mano ANTES de abrir la
 * transacción (idioma de la casa, sin `class-validator`, mismo criterio que `abrir()`). Devuelve
 * los firmantes ya `trim()`eados — `armarActas()` no vuelve a confiar en el valor crudo del DTO.
 */
function validarFirmantes(firmantes: unknown): FirmanteDto[] {
  if (!Array.isArray(firmantes) || firmantes.length === 0 || firmantes.length > MAX_FIRMANTES) {
    throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'firmantes', motivo: 'formato' });
  }
  const normalizados: FirmanteDto[] = [];
  for (const firmante of firmantes) {
    const nombre = typeof firmante?.nombre === 'string' ? firmante.nombre.trim() : '';
    const cargo = typeof firmante?.cargo === 'string' ? firmante.cargo.trim() : '';
    if (!nombre || !cargo || nombre.length > MAX_LARGO_FIRMANTE || cargo.length > MAX_LARGO_FIRMANTE) {
      throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'firmantes', motivo: 'formato' });
    }
    normalizados.push({ nombre, cargo });
  }
  return normalizados;
}

/**
 * cierre-escrutinio-actas (#17, PR3; design.md D4). `cerrar()` corre en `RepeatableRead` porque
 * calcula el escrutinio dentro de la misma transacción y necesita un solo snapshot; bajo esa
 * combinación, dos `cerrar()` concurrentes sobre el mismo proceso pueden hacer que la segunda
 * levante `P2034` (`40001`, "could not serialize access due to concurrent update") en vez de
 * bloquear-y-ver-0-filas. Se captura FUERA del callback (la transacción ya quedó abortada) y se
 * responde el mismo 200 idempotente que habría respondido sin la carrera.
 */
function esConflictoDeSerializacion(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  // P2034: Prisma detecta la carrera en una transacción interactiva escrita 100% con su query
  // builder. Acá el `UPDATE … RETURNING` es `$queryRaw` (D4, mismo patrón crudo que `abrir()`), así
  // que Postgres devuelve el SQLSTATE `40001` directo y Prisma lo envuelve como P2010 (fallo de
  // consulta cruda) con `meta.code === '40001'` — ambas formas son la MISMA carrera y se tratan
  // igual (idioma de `#14` D5).
  const code = (error as { code?: unknown }).code;
  if (code === 'P2034') {
    return true;
  }
  const metaCode = (error as { meta?: { code?: unknown } }).meta?.code;
  if (code === 'P2010' && metaCode === '40001') {
    return true;
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes('could not serialize access due to concurrent update');
}

/**
 * apertura-proceso-congelamiento-padron (#13, PR3; design.md D6-D8, tareas 9.1-9.6). Materializa
 * `DerechoVoto` dentro de la misma transacción que la guarda de `abrir()`. Las dos consultas son
 * espejo EXACTO de las dos `groupBy` de `PadronService.calcular()` (mismo `baseWhere`, mismo
 * criterio de elegibilidad), pero acá se usa `findMany` en vez de `groupBy` porque hace falta el
 * `usuario_id`/`aula_id` de cada fila, no un conteo agregado. El conjunto de aulas llega YA
 * congelado (`ProcesoAula[]` leído por el caller vía `tx.procesoAula.findMany()`) — esta función
 * NUNCA llama `resolverAulas()`: recalcularía el alcance contra el árbol académico actual y podría
 * cambiar QUÉ aulas participan, violando la regla de negocio adoptada (solo se recalcula QUIÉN es
 * elegible, nunca QUÉ aulas). `derechosPorAula()` de `padron.service.ts` decide un total agregado;
 * acá la selección es fila por fila según `publicoObjetivo`, D8: `comunidad` emite las DOS filas
 * (`estudiante` + `padre`) para la misma cuenta `Usuario` de un estudiante con apoderado activo.
 */
async function materializarDerechosVoto(
  tx: Prisma.TransactionClient,
  procesoId: string,
  publicoObjetivo: ProcesoElectoral['publico_objetivo'],
  anioEscolarId: string,
  aulaIds: string[],
): Promise<{ estudiante: number; padre: number }> {
  if (aulaIds.length === 0) {
    throw new ConflictException({
      codigo: PROCESOS_ERROR_CODES.SEGMENTACION_SIN_ELEGIBLES,
      aulas_evaluadas: 0,
    });
  }

  const baseWhere: Prisma.MatriculaWhereInput = {
    anio_escolar_id: anioEscolarId,
    aula_id: { in: aulaIds },
    usuario: { estado: 'activo', rol: 'estudiante' },
  };

  const [matriculasElegibles, matriculasConApoderado] = await Promise.all([
    tx.matricula.findMany({ where: baseWhere, select: { usuario_id: true, aula_id: true } }),
    tx.matricula.findMany({
      where: { ...baseWhere, usuario: { estado: 'activo', rol: 'estudiante', apoderados: { some: {} } } },
      select: { usuario_id: true, aula_id: true },
    }),
  ]);

  const filas: Prisma.DerechoVotoCreateManyInput[] = [];

  if (publicoObjetivo === 'estudiantes' || publicoObjetivo === 'comunidad') {
    for (const m of matriculasElegibles) {
      filas.push({ proceso_id: procesoId, usuario_id: m.usuario_id, en_calidad_de: CALIDAD_ESTUDIANTE, aula_snapshot: m.aula_id });
    }
  }
  if (publicoObjetivo === 'padres' || publicoObjetivo === 'comunidad') {
    for (const m of matriculasConApoderado) {
      filas.push({ proceso_id: procesoId, usuario_id: m.usuario_id, en_calidad_de: CALIDAD_PADRE, aula_snapshot: m.aula_id });
    }
  }

  if (filas.length === 0) {
    throw new ConflictException({
      codigo: PROCESOS_ERROR_CODES.SEGMENTACION_SIN_ELEGIBLES,
      aulas_evaluadas: aulaIds.length,
    });
  }

  // D7: troceado manual en LOTE_DERECHOS — ver el comentario de la constante (verificado en apply,
  // `createMany` de Prisma NO trocea internamente sobre el límite de parámetros del protocolo).
  for (let i = 0; i < filas.length; i += LOTE_DERECHOS) {
    await tx.derechoVoto.createMany({ data: filas.slice(i, i + LOTE_DERECHOS) });
  }

  return {
    estudiante: filas.filter((f) => f.en_calidad_de === CALIDAD_ESTUDIANTE).length,
    padre: filas.filter((f) => f.en_calidad_de === CALIDAD_PADRE).length,
  };
}

/**
 * administracion-procesos-electorales, PR6 (design.md "Enfoque técnico"/D3/D6, tareas 16.2/17.8).
 * Creación de `ProcesoElectoral` en `borrador` + lote de `ProcesoAula` para los 4 tipos (D3), en
 * una sola `$transaction` junto con `AuditoriaService.log(tx, PROCESO_CREADO, ...)` (D6): si el
 * lote falla a mitad de camino (p. ej. `aula_ids` duplicado viola `@@unique([proceso_id, aula_id])`
 * en `procesoAula.createMany`), Postgres revierte el `create` del proceso y la fila de auditoría
 * junto con las filas de `ProcesoAula` ya insertadas — ninguna escritura sobrevive fuera de la
 * transacción (spec: "Auditoría de creación dentro de la misma transacción", tarea 17.7).
 *
 * Las lecturas (resolución de año activo, de aulas y de elegibilidad) corren fuera de la
 * transacción de escritura, mismo criterio que `PadronService.calcular()`: son consultas contra un
 * estado que puede seguir cambiando (`READ COMMITTED`), y el único requisito de atomicidad real es
 * sobre las escrituras (D2 de design.md).
 */
@Injectable()
export class ProcesosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configuracionLectura: ConfiguracionLecturaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async crear(dto: CrearProcesoDto, actorId: string): Promise<ProcesoRespuestaDto> {
    const { apertura, cierre } = validarDatos(dto);
    validarSegmentacion(dto);

    const anioEscolarId = await this.configuracionLectura.anioEscolarActivoId();
    if (!anioEscolarId) {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.SIN_ANIO_ESCOLAR_ACTIVO });
    }

    // D3: tipo↔alcance (representante_aula + institucion) se rechaza dentro de resolverAulas(),
    // reusado sin duplicar la regla (PR5 dejó `tipo` opcional exactamente para esto).
    const aulaIds = await resolverAulas(this.prisma, anioEscolarId, dto, dto.tipo);

    const conMatricula = await aulasConMatriculaActiva(this.prisma, anioEscolarId, aulaIds);
    const elegibles = aulaIds.filter((id) => conMatricula.has(id));
    const aulasExcluidas = aulaIds.filter((id) => !conMatricula.has(id));

    if (elegibles.length === 0) {
      throw new ConflictException({
        codigo: PROCESOS_ERROR_CODES.SEGMENTACION_SIN_ELEGIBLES,
        aulas_evaluadas: aulaIds.length,
      });
    }

    const nivelIdSnapshot = dto.alcance === 'nivel' ? (dto.nivel_id ?? null) : null;
    const gradoIdsSnapshot = dto.alcance === 'grados' ? (dto.grado_ids ?? []) : [];

    const proceso = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.procesoElectoral.create({
        data: {
          nombre: dto.nombre,
          descripcion: dto.descripcion,
          tipo: dto.tipo,
          fecha_apertura_prevista: apertura,
          fecha_cierre_prevista: cierre,
          ocultar_resultados: dto.ocultar_resultados ?? true,
          publico_objetivo: dto.publico_objetivo,
          alcance: dto.alcance,
          nivel_id_snapshot: nivelIdSnapshot,
          grado_ids_snapshot: gradoIdsSnapshot,
        },
      });

      await tx.procesoAula.createMany({
        data: elegibles.map((aulaId) => ({ proceso_id: creado.id, aula_id: aulaId })),
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.PROCESO_CREADO,
        actorId,
        'ProcesoElectoral',
        creado.id,
        {
          tipo: creado.tipo,
          publico_objetivo: creado.publico_objetivo,
          alcance: creado.alcance,
          nivel_id_snapshot: creado.nivel_id_snapshot,
          grado_ids_snapshot: creado.grado_ids_snapshot,
          aulas: elegibles.length,
          ocultar_resultados: creado.ocultar_resultados,
        } as Prisma.InputJsonValue,
      );

      return creado;
    });

    return mapearRespuesta(proceso, elegibles, aulasExcluidas);
  }

  /**
   * design.md "Contratos HTTP"/D5, tarea 19.1/19.5. `?estado=&tipo=` opcionales; valor fuera del
   * enum correspondiente -> `400 CAMPO_INVALIDO` (spec: filtro desconocido). `orderBy creado_en
   * desc`, arreglo desnudo (D5 de #7/#8, "Sin paginación en GET /procesos" — pregunta abierta).
   * `aulas_excluidas` viaja vacío en el listado: esa exclusión solo existe como resultado de una
   * escritura (creación/edición), no hay una tabla que la persista para leerla después.
   */
  async listar(filtros: ListarProcesosQueryDto): Promise<ProcesoRespuestaDto[]> {
    if (filtros.estado !== undefined && !(ESTADOS_VALIDOS as readonly string[]).includes(filtros.estado)) {
      throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'estado', motivo: 'formato' });
    }
    if (filtros.tipo !== undefined && !(TIPOS_VALIDOS as readonly string[]).includes(filtros.tipo)) {
      throw new BadRequestException({ codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'tipo', motivo: 'formato' });
    }

    const procesos = await this.prisma.procesoElectoral.findMany({
      where: {
        ...(filtros.estado ? { estado: filtros.estado as ProcesoElectoral['estado'] } : {}),
        ...(filtros.tipo ? { tipo: filtros.tipo as ProcesoElectoral['tipo'] } : {}),
      },
      include: { procesoAulas: true },
      orderBy: { creado_en: 'desc' },
    });

    return procesos.map((proceso) =>
      mapearRespuesta(proceso, proceso.procesoAulas.map((pa) => pa.aula_id), []),
    );
  }

  /**
   * design.md "Contratos HTTP"/spec "Listado de procesos en borrador", tarea 19.1/19.5.
   * `GET /procesos/:id`: `publico_objetivo`, snapshot y `ProcesoAula[]` ya viajan en
   * `mapearRespuesta()` (D1/D3). `:id` inexistente -> `404` por defecto de Nest (D5).
   */
  async detalle(id: string): Promise<ProcesoDetalleRespuestaDto> {
    const proceso = await this.prisma.procesoElectoral.findUnique({
      where: { id },
      include: { procesoAulas: true },
    });
    if (!proceso) {
      throw new NotFoundException();
    }
    return mapearRespuesta(proceso, proceso.procesoAulas.map((pa) => pa.aula_id), []);
  }

  /**
   * administracion-procesos-electorales, PR7 (design.md "Flujo de datos — creación en
   * lote"/D3/D6, tareas 20.2-20.7). `PATCH` reusa `validarSegmentacion()`/`resolverAulas()` de
   * `padron.service.ts` (mismo criterio que `crear()`), y regenera el `ProcesoAula[]` completo con
   * `deleteMany`+`createMany` dentro de la misma `$transaction` que el `update()` y
   * `AuditoriaService.log(tx, PROCESO_EDITADO, ...)` — sin límite de reintentos (spec): nada en el
   * servicio cuenta ediciones previas, así que reeditar N veces no cambia el camino de código.
   * `tipo`/`estado` no están en `ActualizarProcesoDto` (D3): un body que los incluya los ignora
   * porque el tipo TS ni siquiera los expone.
   */
  async editar(id: string, dto: ActualizarProcesoDto, actorId: string): Promise<ProcesoRespuestaDto> {
    const existente = await this.prisma.procesoElectoral.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException();
    }
    if (existente.estado !== 'borrador') {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.PROCESO_NO_EDITABLE, estado: existente.estado });
    }

    validarSegmentacion(dto);
    const { nombre, descripcion, apertura, cierre, ocultarResultados } = validarActualizacion(dto, existente);

    const anioEscolarId = await this.configuracionLectura.anioEscolarActivoId();
    if (!anioEscolarId) {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.SIN_ANIO_ESCOLAR_ACTIVO });
    }

    // D3: tipo no cambia por PATCH (no está en el DTO); se reusa el tipo persistido para que
    // resolverAulas() siga rechazando representante_aula + institucion aunque el body lo pida.
    const aulaIds = await resolverAulas(this.prisma, anioEscolarId, dto, existente.tipo);

    const conMatricula = await aulasConMatriculaActiva(this.prisma, anioEscolarId, aulaIds);
    const elegibles = aulaIds.filter((aulaId) => conMatricula.has(aulaId));
    const aulasExcluidas = aulaIds.filter((aulaId) => !conMatricula.has(aulaId));

    if (elegibles.length === 0) {
      throw new ConflictException({
        codigo: PROCESOS_ERROR_CODES.SEGMENTACION_SIN_ELEGIBLES,
        aulas_evaluadas: aulaIds.length,
      });
    }

    const nivelIdSnapshot = dto.alcance === 'nivel' ? (dto.nivel_id ?? null) : null;
    const gradoIdsSnapshot = dto.alcance === 'grados' ? (dto.grado_ids ?? []) : [];

    const aulasAntes = await this.prisma.procesoAula.count({ where: { proceso_id: id } });

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const proceso = await tx.procesoElectoral.update({
        where: { id },
        data: {
          nombre,
          descripcion,
          fecha_apertura_prevista: apertura,
          fecha_cierre_prevista: cierre,
          ocultar_resultados: ocultarResultados,
          publico_objetivo: dto.publico_objetivo,
          alcance: dto.alcance,
          nivel_id_snapshot: nivelIdSnapshot,
          grado_ids_snapshot: gradoIdsSnapshot,
        },
      });

      await tx.procesoAula.deleteMany({ where: { proceso_id: id } });
      await tx.procesoAula.createMany({
        data: elegibles.map((aulaId) => ({ proceso_id: id, aula_id: aulaId })),
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.PROCESO_EDITADO,
        actorId,
        'ProcesoElectoral',
        id,
        {
          campos: ['nombre', 'descripcion', 'fecha_apertura_prevista', 'fecha_cierre_prevista', 'ocultar_resultados', 'publico_objetivo', 'alcance'],
          aulas_antes: aulasAntes,
          aulas_despues: elegibles.length,
        } as Prisma.InputJsonValue,
      );

      return proceso;
    });

    return mapearRespuesta(actualizado, elegibles, aulasExcluidas);
  }

  /**
   * administracion-procesos-electorales, PR7 (design.md "Flujo de datos — creación en
   * lote"/D6, tareas 21.1-21.5). `procesoElectoral.delete()` cascadea a `ProcesoAula` por el
   * `onDelete: Cascade` que ya declara el schema (#2, grupo 2) — sin `deleteMany` explícito. El
   * conteo de aulas para el payload de auditoría se toma ANTES del `delete()`: después, la cascada
   * ya las borró.
   */
  async eliminar(id: string, actorId: string): Promise<void> {
    const existente = await this.prisma.procesoElectoral.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundException();
    }
    if (existente.estado !== 'borrador') {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.PROCESO_NO_EDITABLE, estado: existente.estado });
    }

    const aulas = await this.prisma.procesoAula.count({ where: { proceso_id: id } });

    await this.prisma.$transaction(async (tx) => {
      await tx.procesoElectoral.delete({ where: { id } });
      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.PROCESO_ELIMINADO,
        actorId,
        'ProcesoElectoral',
        id,
        {
          tipo: existente.tipo,
          publico_objetivo: existente.publico_objetivo,
          aulas,
        } as Prisma.InputJsonValue,
      );
    });
  }

  /**
   * apertura-proceso-congelamiento-padron (#13, PR2; design.md D3-D5/D9, tareas 6.1-6.6). Guarda de
   * concurrencia: a diferencia de `crear()`/`editar()`, aquí la escritura va PRIMERO y las lecturas
   * DESPUÉS, todas dentro de la misma `$transaction` (D4, desviación consciente del patrón vigente).
   * `tx.$queryRaw` con `UPDATE ... WHERE estado='borrador' RETURNING ...` (D3) es la única sentencia
   * cruda del servicio — la plantilla etiquetada de Prisma parametriza `${id}` como `$1`, nunca
   * concatena texto (segundo precedente del repo tras `HealthController`'s `SELECT 1`). El `UPDATE`
   * condicional toma el lock de fila: una segunda petición concurrente sobre el mismo proceso queda
   * bloqueada hasta el commit de la primera y, bajo `READ COMMITTED`, Postgres re-evalúa el `WHERE`
   * (EvalPlanQual) y devuelve 0 filas — la relectura de abajo interpreta ese resultado.
   *
   * PR3 (D6-D8/D11) extiende el camino exitoso (guarda con 1 fila) dentro de la MISMA transacción:
   * lee el `ProcesoAula[]` congelado, materializa `DerechoVoto` vía `materializarDerechosVoto()` y
   * audita `PROCESO_ABIERTO` exactamente una vez. El camino idempotente (D5) no cambia: no
   * materializa de nuevo ni audita otra vez — `respuestaApertura()` ya contaba sobre
   * `DerechoVoto`/`ProcesoAula` reales desde PR2, así que el 200 idempotente refleja lo que PR3
   * escribió en la primera apertura sin código adicional.
   */
  async abrir(id: string, dto: AbrirProcesoDto, actorId: string): Promise<AperturaRespuestaDto> {
    if (dto.confirmar !== true) {
      throw new BadRequestException({
        codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'confirmar',
        motivo: 'requerido',
      });
    }

    const anioEscolarId = await this.configuracionLectura.anioEscolarActivoId();
    if (!anioEscolarId) {
      throw new ConflictException({ codigo: PROCESOS_ERROR_CODES.SIN_ANIO_ESCOLAR_ACTIVO });
    }

    return this.prisma.$transaction(async (tx) => {
      const filas = await tx.$queryRaw<
        {
          id: string;
          apertura_real: Date;
          ocultar_resultados: boolean;
          publico_objetivo: ProcesoElectoral['publico_objetivo'];
          tipo: ProcesoElectoral['tipo'];
        }[]
      >`
        UPDATE "ProcesoElectoral"
           SET estado = 'abierto', apertura_real = clock_timestamp()
         WHERE id = ${id}::uuid AND estado = 'borrador'
        RETURNING id, apertura_real, ocultar_resultados, publico_objetivo, tipo`;

      if (filas.length === 0) {
        const existente = await tx.procesoElectoral.findUnique({ where: { id } });
        if (!existente) {
          throw new NotFoundException();
        }
        if (existente.estado === 'abierto') {
          // D5: no-op idempotente silencioso — 200 con el estado vigente, sin auditoría adicional.
          return respuestaApertura(tx, existente.id, existente.apertura_real!, existente.ocultar_resultados);
        }
        throw new ConflictException({
          codigo: PROCESOS_ERROR_CODES.PROCESO_NO_ABRIBLE,
          estado: existente.estado,
        });
      }

      const [
        { id: procesoId, apertura_real: aperturaReal, ocultar_resultados: ocultarResultados, publico_objetivo: publicoObjetivo, tipo },
      ] = filas;

      // D6: aulas YA congeladas — jamás resolverAulas() acá (ver materializarDerechosVoto()).
      const procesoAulas = await tx.procesoAula.findMany({ where: { proceso_id: procesoId }, select: { aula_id: true } });
      const aulaIds = procesoAulas.map((pa) => pa.aula_id);

      const conteos = await materializarDerechosVoto(tx, procesoId, publicoObjetivo, anioEscolarId, aulaIds);

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.PROCESO_ABIERTO,
        actorId,
        'ProcesoElectoral',
        procesoId,
        {
          tipo,
          publico_objetivo: publicoObjetivo,
          aulas: aulaIds.length,
          derechos_totales: conteos.estudiante + conteos.padre,
          derechos_estudiante: conteos.estudiante,
          derechos_padre: conteos.padre,
          ocultar_resultados: ocultarResultados,
          apertura_real: aperturaReal.toISOString(),
        } as Prisma.InputJsonValue,
      );

      return respuestaApertura(tx, procesoId, aperturaReal, ocultarResultados);
    });
  }

  /**
   * cierre-escrutinio-actas (#17, PR3; design.md D4/D9/D14, tareas 11.1-11.5). Espejo estructural
   * de `abrir()`: `UPDATE … WHERE estado='abierto' RETURNING`, no-op idempotente, `ConflictException`
   * con código nuevo. Se desvía de `abrir()` en el nivel de aislamiento (`RepeatableRead`, D4): esta
   * transacción calcula el escrutinio con SEIS lecturas de agregación después del `UPDATE`, y bajo
   * `ReadCommitted` cada una tomaría un snapshot nuevo — un voto que entrara entre el `count` y el
   * `groupBy` produciría un acta cuyo cuadre no cuadra. `P2034`/`40001` se captura FUERA del
   * callback (patrón literal de `#14` D5) y responde el mismo 200 idempotente que un `cerrar()` sin
   * carrera.
   */
  async cerrar(id: string, dto: CerrarProcesoDto, actorId: string): Promise<CierreRespuestaDto> {
    if (dto.confirmar !== true) {
      throw new BadRequestException({
        codigo: PROCESOS_ERROR_CODES.CAMPO_INVALIDO,
        campo: 'confirmar',
        motivo: 'requerido',
      });
    }
    const firmantes = validarFirmantes(dto.firmantes);

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const filas = await tx.$queryRaw<
            {
              id: string;
              nombre: string;
              tipo: ProcesoElectoral['tipo'];
              apertura_real: Date | null;
              cierre_real: Date;
              ocultar_resultados: boolean;
            }[]
          >`
            UPDATE "ProcesoElectoral"
               SET estado = 'cerrado', cierre_real = clock_timestamp()
             WHERE id = ${id}::uuid AND estado = 'abierto'
            RETURNING id, nombre, tipo, apertura_real, cierre_real, ocultar_resultados`;

          if (filas.length === 0) {
            const existente = await tx.procesoElectoral.findUnique({ where: { id } });
            if (!existente) {
              throw new NotFoundException();
            }
            if (existente.estado === 'cerrado' || existente.estado === 'acta_emitida') {
              // D4: no-op idempotente silencioso — 200 con el estado vigente, sin auditoría adicional.
              return respuestaCierre(tx, existente.id, existente.estado, existente.cierre_real!);
            }
            throw new ConflictException({
              codigo: PROCESOS_ERROR_CODES.PROCESO_NO_CERRABLE,
              estado: existente.estado,
            });
          }

          const [{ id: procesoId, nombre, tipo, apertura_real: aperturaReal, cierre_real: cierreReal, ocultar_resultados: ocultarResultados }] =
            filas;

          const escrutinio = await calcularEscrutinio(tx, procesoId, tipo);
          const institucion = await tx.configuracion.findUnique({
            where: { clave: 'institucional' },
            select: { nombre: true, director: true },
          });
          const [aulas, derechosEstudiante, derechosPadre] = await Promise.all([
            tx.procesoAula.count({ where: { proceso_id: procesoId } }),
            tx.derechoVoto.count({ where: { proceso_id: procesoId, en_calidad_de: CALIDAD_ESTUDIANTE } }),
            tx.derechoVoto.count({ where: { proceso_id: procesoId, en_calidad_de: CALIDAD_PADRE } }),
          ]);

          const actas = armarActas({
            proceso: {
              id: procesoId,
              nombre,
              tipo,
              apertura_real: (aperturaReal ?? escrutinio.ahora).toISOString(),
              cierre_real: cierreReal.toISOString(),
              ocultar_resultados: ocultarResultados,
            },
            institucion: { nombre: institucion?.nombre ?? null, director: institucion?.director ?? null },
            firmantes,
            generadoEn: escrutinio.ahora.toISOString(),
            padron: { derechos_estudiante: derechosEstudiante, derechos_padre: derechosPadre, aulas },
            escrutinio,
          });

          await tx.acta.createMany({
            data: [
              { proceso_id: procesoId, tipo: 'apertura', estado: 'borrador', contenido: actas.apertura as unknown as Prisma.InputJsonValue },
              { proceso_id: procesoId, tipo: 'cierre', estado: 'borrador', contenido: actas.cierre as unknown as Prisma.InputJsonValue },
              { proceso_id: procesoId, tipo: 'escrutinio', estado: 'borrador', contenido: actas.escrutinio as unknown as Prisma.InputJsonValue },
              { proceso_id: procesoId, tipo: 'oficial', estado: 'borrador', contenido: actas.oficial as unknown as Prisma.InputJsonValue },
            ],
          });

          // D14/threat "Secreto del voto en auditoría": SOLO conteos y booleanos, campo por campo —
          // jamás `candidato_id`/`lista_id`/`opcion_id`/`blanco`/`eleccion`/`empatados`.
          await this.auditoria.log(
            tx,
            AUDIT_EVENT_TYPES.PROCESO_CERRADO,
            actorId,
            'ProcesoElectoral',
            procesoId,
            {
              tipo,
              cierre_real: cierreReal.toISOString(),
              padron_total: escrutinio.padron_total,
              votos_emitidos: escrutinio.votos_emitidos,
              blancos: escrutinio.blancos,
              abstenciones: actas.cierre.participacion.abstenciones,
              cuadra: actas.escrutinio.escrutinio.cuadre.cuadra,
              empate: actas.escrutinio.escrutinio.empate.empate,
              sin_votos: actas.escrutinio.escrutinio.sin_votos,
              actas_creadas: 4,
              firmantes: firmantes.length,
            } as Prisma.InputJsonValue,
          );

          return { id: procesoId, estado: 'cerrado', cierre_real: cierreReal.toISOString(), actas_creadas: 4 };
        },
        { isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel },
      );
    } catch (error) {
      if (!esConflictoDeSerializacion(error)) {
        throw error;
      }
      // D4: la transacción quedó abortada por la carrera — relectura en una transacción limpia.
      const existente = await this.prisma.procesoElectoral.findUnique({ where: { id } });
      if (!existente) {
        throw new NotFoundException();
      }
      if (existente.estado === 'borrador' || existente.estado === 'abierto') {
        throw new ConflictException({
          codigo: PROCESOS_ERROR_CODES.PROCESO_NO_CERRABLE,
          estado: existente.estado,
        });
      }
      return respuestaCierre(this.prisma, existente.id, existente.estado, existente.cierre_real!);
    }
  }
}
