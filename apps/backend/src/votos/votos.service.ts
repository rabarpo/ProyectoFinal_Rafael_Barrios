import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PrismaService } from '../prisma/prisma.service';
import { derivarComprobante } from './comprobante';
import { construirCorreoComprobante } from './correo-comprobante';
import type { ComprobanteDto } from './dto/comprobante.dto';
import type { EmitirVotoDto } from './dto/emitir-voto.dto';
import { VOTOS_ERROR_CODES, type VotosErrorCode } from './votos.errors';

/**
 * vote-casting, PR2 (design.md D5, "Interfaces / Contratos"). Las dos restricciones `UNIQUE` de
 * `Voto` que pueden colisionar en el `INSERT` del paso 6 — se discriminan por nombre para no
 * confundir una colisión de voto con cualquier otro `P2002` futuro del mismo proceso (tarea 8.2).
 * Prisma reporta `error.meta.target` como el nombre de la restricción (Postgres) o, según versión
 * de motor, como el arreglo de columnas involucradas — `esColisionDeVoto()` acepta ambas formas.
 */
const RESTRICCIONES_DE_VOTO = [
  'Voto_proceso_id_derecho_voto_id_key',
  'Voto_proceso_id_clave_idempotencia_key',
] as const;

/**
 * vote-casting, PR4 (tarea 13.1, hallazgo del arnés de concurrencia REAL contra Postgres). Prisma
 * 5.x, en este entorno, no siempre reporta `error.meta.target` como el nombre de la restricción:
 * cuando el motor recibe el 23505 de Postgres tras un `INSERT` bloqueado por una transacción
 * concurrente (exactamente el camino que el arnés de concurrencia ejercita), `target` llega como el
 * arreglo de NOMBRES DE COLUMNA (`['proceso_id', 'derecho_voto_id']`), no como el string del nombre
 * de la restricción -- a diferencia de lo que las pruebas unitarias con `$queryRaw` mockeado de PR2
 * asumían. Sin este segundo criterio, un 23505 real quedaba sin reconocer como colisión de voto y
 * burbujeaba como `500`, exactamente lo que D5 prohíbe. Se conservan AMBOS conjuntos de columnas
 * (no solo sus nombres) para no aceptar por error un P2002 de una restricción distinta que
 * coincidiera parcialmente en columnas.
 */
const COLUMNAS_DE_VOTO: readonly (readonly string[])[] = [
  ['proceso_id', 'derecho_voto_id'],
  ['proceso_id', 'clave_idempotencia'],
];

export interface ResultadoEmision {
  creado: boolean;
  codigo_comprobante: string;
  hora_servidor: string;
  proceso_id: string;
  derecho_voto_id: string;
}

interface FilaValidacion {
  id: string;
  usuario_id: string;
  proceso_id: string;
  proceso_nombre: string;
  tipo: string;
  fecha_cierre_prevista: Date;
  cerrado_por_hora: boolean;
  aun_no_abierto: boolean;
  aula_valida: boolean;
  voto_id: string | null;
  voto_codigo_comprobante: string | null;
  voto_hora_servidor: Date | null;
  comprobante_por_clave: string | null;
  hora_por_clave: Date | null;
}

/**
 * design.md D10, tareas 8.3/8.4. Excepción interna, nunca expuesta directamente al controlador:
 * capturada FUERA del callback de `$transaction` (la transacción del voto ya hizo rollback al
 * lanzarla), dispara su propio `auditoria.log(tx, 'RECHAZO', ...)` en una transacción nueva y
 * exitosa. `comprobante` solo se completa para la causa 4 (`DERECHO_YA_EJERCIDO`): esa causa no es
 * un error HTTP (Taxonomía de rechazos de design.md) — responde `200` con el comprobante ya
 * emitido, así que `emitir()` la resuelve devolviendo `comprobante` en vez de llamar `aHttp()`.
 */
class RechazoVoto extends Error {
  constructor(
    public readonly codigo: VotosErrorCode,
    public readonly procesoId: string,
    public readonly derechoVotoId: string,
    public readonly motivo: string,
    public readonly detalle?: Record<string, unknown>,
    public readonly comprobante?: ResultadoEmision,
  ) {
    super(codigo);
  }

  aHttp(): Error {
    return new ConflictException({ codigo: this.codigo, ...this.detalle });
  }
}

function esP2002(error: unknown): error is { code: 'P2002'; meta?: { target?: unknown } } {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

function esColisionDeVoto(error: unknown): boolean {
  if (!esP2002(error)) {
    return false;
  }
  const target = error.meta?.target;
  if (typeof target === 'string') {
    return (RESTRICCIONES_DE_VOTO as readonly string[]).includes(target);
  }
  if (Array.isArray(target)) {
    const columnas = target.map(String);
    // Caso 1: `target` es el nombre de la restricción, reportado como arreglo de un elemento.
    if (columnas.some((t) => (RESTRICCIONES_DE_VOTO as readonly string[]).includes(t))) {
      return true;
    }
    // Caso 2 (real bajo concurrencia, tarea 13.1): `target` es el conjunto de columnas de la
    // restricción, en cualquier orden.
    return COLUMNAS_DE_VOTO.some(
      (columnasEsperadas) =>
        columnasEsperadas.length === columnas.length && columnasEsperadas.every((c) => columnas.includes(c)),
    );
  }
  return false;
}

function construirResultado(
  creado: boolean,
  procesoId: string,
  derechoVotoId: string,
  codigoComprobante: string,
  horaServidor: Date,
): ResultadoEmision {
  return {
    creado,
    codigo_comprobante: codigoComprobante,
    hora_servidor: horaServidor.toISOString(),
    proceso_id: procesoId,
    derecho_voto_id: derechoVotoId,
  };
}

/**
 * vote-casting, PR3 (design.md "Contratos HTTP", tarea 10.1). Resuelve la etiqueta legible de la
 * elección para `ComprobanteDto.eleccion_resumen` — el resumen SÍ viaja al votante ([ADR-0006] §2),
 * a diferencia del payload de auditoría (D11), que nunca lleva la elección. Lectura puramente de
 * presentación, fuera de la transacción crítica de `emitir()`: no participa de ninguna decisión de
 * D4/D5/D10, así que no reabre la garantía indivisible de PR2.
 */
async function resolverEleccionResumen(
  cliente: Pick<PrismaService, 'lista' | 'opcionConsulta' | 'candidato'>,
  eleccion: { lista_id: string | null; opcion_id: string | null; candidato_id: string | null; blanco: boolean },
): Promise<string> {
  if (eleccion.blanco) {
    return 'Voto en blanco';
  }
  if (eleccion.lista_id) {
    const lista = await cliente.lista.findUnique({ where: { id: eleccion.lista_id } });
    return lista?.nombre ?? '';
  }
  if (eleccion.opcion_id) {
    const opcion = await cliente.opcionConsulta.findUnique({ where: { id: eleccion.opcion_id } });
    return opcion?.etiqueta ?? '';
  }
  if (eleccion.candidato_id) {
    const candidato = await cliente.candidato.findUnique({ where: { id: eleccion.candidato_id } });
    return candidato?.nombres ?? '';
  }
  return '';
}

/**
 * design.md flujo de datos, tarea 6.1. "Exactamente una" de `{lista_id, opcion_id, candidato_id,
 * blanco}` — corre ANTES de abrir la transacción (spec: ADR-0008, "no existe voto nulo").
 */
function validarEleccionExactamenteUna(dto: EmitirVotoDto): void {
  const marcadas = [dto.lista_id, dto.opcion_id, dto.candidato_id, dto.blanco === true ? true : undefined].filter(
    (v) => v !== undefined && v !== null,
  );
  if (marcadas.length !== 1) {
    throw new BadRequestException({ codigo: VOTOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'eleccion', motivo: 'cantidad' });
  }
}

/**
 * design.md flujo de datos, tarea 7.3. Verifica que la referencia elegida pertenezca al mismo
 * proceso y esté activa — dentro de `tx`, dentro de la misma transacción del voto (threat matrix:
 * "Integridad de la elección"). El voto en blanco no referencia nada, así que no valida.
 */
async function validarEleccionPerteneceAlProceso(
  tx: Prisma.TransactionClient,
  dto: EmitirVotoDto,
  procesoId: string,
): Promise<void> {
  if (dto.blanco === true) {
    return;
  }

  if (dto.lista_id) {
    const lista = await tx.lista.findUnique({ where: { id: dto.lista_id } });
    if (!lista || lista.proceso_id !== procesoId || lista.estado !== 'activo') {
      throw new ConflictException({ codigo: VOTOS_ERROR_CODES.ELECCION_INVALIDA });
    }
    return;
  }

  if (dto.opcion_id) {
    const opcion = await tx.opcionConsulta.findUnique({ where: { id: dto.opcion_id } });
    if (!opcion || opcion.proceso_id !== procesoId) {
      throw new ConflictException({ codigo: VOTOS_ERROR_CODES.ELECCION_INVALIDA });
    }
    return;
  }

  if (dto.candidato_id) {
    const candidato = await tx.candidato.findUnique({ where: { id: dto.candidato_id } });
    if (!candidato || candidato.proceso_id !== procesoId || candidato.estado !== 'activo') {
      throw new ConflictException({ codigo: VOTOS_ERROR_CODES.ELECCION_INVALIDA });
    }
  }
}

/**
 * vote-casting, PR2 (design.md D2-D5/D7/D8/D10/D12/D16, Phases 6-9). La garantía transaccional
 * completa del PRD ("0 votos duplicados"): validación del derecho, `UNIQUE`, idempotencia,
 * inserción de `Voto` y evento `VOTO` viven en este único método, sin descomponer (restricción de
 * no-descomposición del BACKLOG — proposal.md).
 */
@Injectable()
export class VotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async emitir(dto: EmitirVotoDto, sesion: SesionUsuario): Promise<ResultadoEmision> {
    validarEleccionExactamenteUna(dto);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // D4: una sola sentencia — bloqueo (`FOR UPDATE OF dv`), validación de ventana horaria y
        // aula (D8), e idempotencia por clave (D7), todo en el mismo snapshot/`now()` transaccional.
        const filas = await tx.$queryRaw<FilaValidacion[]>`
          SELECT dv.id, dv.usuario_id, dv.proceso_id, p.nombre AS proceso_nombre, p.tipo,
                 p.fecha_cierre_prevista,
                 (now() >= p.fecha_cierre_prevista) AS cerrado_por_hora,
                 (p.apertura_real IS NULL OR now() < p.apertura_real) AS aun_no_abierto,
                 EXISTS(
                   SELECT 1 FROM "ProcesoAula" pa
                    WHERE pa.proceso_id = dv.proceso_id AND pa.aula_id = dv.aula_snapshot
                 ) AS aula_valida,
                 (SELECT v.id FROM "Voto" v WHERE v.derecho_voto_id = dv.id) AS voto_id,
                 (SELECT v.codigo_comprobante FROM "Voto" v WHERE v.derecho_voto_id = dv.id) AS voto_codigo_comprobante,
                 (SELECT v.hora_servidor FROM "Voto" v WHERE v.derecho_voto_id = dv.id) AS voto_hora_servidor,
                 (SELECT v.codigo_comprobante FROM "Voto" v
                    WHERE v.proceso_id = dv.proceso_id AND v.clave_idempotencia = ${dto.clave_idempotencia}) AS comprobante_por_clave,
                 (SELECT v.hora_servidor FROM "Voto" v
                    WHERE v.proceso_id = dv.proceso_id AND v.clave_idempotencia = ${dto.clave_idempotencia}) AS hora_por_clave
            FROM "DerechoVoto" dv
            JOIN "ProcesoElectoral" p ON p.id = dv.proceso_id
           WHERE dv.id = ${dto.derecho_voto_id}::uuid
             FOR UPDATE OF dv`;

        // Causa 1 (D9): derecho ajeno o inexistente -> 403 idéntico, sin evento RECHAZO
        // (autorización, no regla de negocio).
        if (filas.length === 0 || filas[0].usuario_id !== sesion.userId) {
          throw new ForbiddenException();
        }

        const fila = filas[0];

        // D7: reintento con la misma clave de idempotencia -> comprobante existente, sin INSERT.
        if (fila.comprobante_por_clave !== null) {
          return construirResultado(false, fila.proceso_id, dto.derecho_voto_id, fila.comprobante_por_clave, fila.hora_por_clave!);
        }

        // D8: aula defensiva, plegada en la causa 2 (SIN_DERECHO) — estructuralmente inalcanzable
        // si #13 está bien implementado; defensa en profundidad con `motivo` distinto en auditoría.
        if (!fila.aula_valida) {
          throw new RechazoVoto(VOTOS_ERROR_CODES.SIN_DERECHO, fila.proceso_id, dto.derecho_voto_id, 'aula_no_corresponde');
        }

        // Causa 3: proceso cerrado o aún no abierto.
        if (fila.cerrado_por_hora || fila.aun_no_abierto) {
          throw new RechazoVoto(
            VOTOS_ERROR_CODES.VOTACION_CERRADA,
            fila.proceso_id,
            dto.derecho_voto_id,
            fila.cerrado_por_hora ? 'proceso_cerrado' : 'proceso_no_abierto',
            { cierre: fila.fecha_cierre_prevista.toISOString() },
          );
        }

        // Causa 4: derecho ya ejercido (clave distinta) — NO es un error (Taxonomía de rechazos):
        // responde con el comprobante ya emitido, pero SÍ deja su propio evento RECHAZO (D10).
        if (fila.voto_id !== null) {
          throw new RechazoVoto(
            VOTOS_ERROR_CODES.DERECHO_YA_EJERCIDO,
            fila.proceso_id,
            dto.derecho_voto_id,
            'derecho_ya_ejercido',
            undefined,
            construirResultado(false, fila.proceso_id, dto.derecho_voto_id, fila.voto_codigo_comprobante!, fila.voto_hora_servidor!),
          );
        }

        await validarEleccionPerteneceAlProceso(tx, dto, fila.proceso_id);

        // D12: `id` generado en Node, comprobante derivado — sin verificación de unicidad propia.
        const id = randomUUID();
        const codigoComprobante = derivarComprobante(id);

        const voto = await tx.voto.create({
          data: {
            id,
            proceso_id: fila.proceso_id,
            derecho_voto_id: dto.derecho_voto_id,
            lista_id: dto.lista_id ?? null,
            opcion_id: dto.opcion_id ?? null,
            candidato_id: dto.candidato_id ?? null,
            blanco: dto.blanco === true,
            codigo_comprobante: codigoComprobante,
            clave_idempotencia: dto.clave_idempotencia,
          },
        });

        // D11: payload canónico, cerrado — nunca la elección (secreto del voto).
        await this.auditoria.log(tx, AUDIT_EVENT_TYPES.VOTO, sesion.userId, 'Voto', voto.id, {
          proceso_id: voto.proceso_id,
          derecho_voto_id: voto.derecho_voto_id,
          codigo_comprobante: voto.codigo_comprobante,
          hora_servidor: voto.hora_servidor.toISOString(),
        } as Prisma.InputJsonValue);

        // outbox-correo-comprobante-autenticado (#15, PR1; design.md D2/D3/D4): `asunto`/`cuerpo`
        // ya materializados por el renderizador puro (D2) -- el worker de #15/PR2 los envía tal
        // cual, sin recomponerlos. `usuario_id` sale de la fila bloqueada (`fila.usuario_id`), no
        // de `sesion.userId` (D3). Sin try/catch: un fallo acá burbujea igual que cualquier otro
        // paso de la transacción (D4) -- "si el voto existe, su job existe".
        const { asunto, cuerpo } = construirCorreoComprobante({
          codigo_comprobante: voto.codigo_comprobante,
          hora_servidor: voto.hora_servidor,
          proceso_nombre: fila.proceso_nombre,
          voto_id: voto.id,
          app_base_url: process.env.APP_BASE_URL,
        });
        await tx.jobCorreo.create({
          data: {
            usuario_id: fila.usuario_id,
            voto_id: voto.id,
            proceso_id: voto.proceso_id,
            codigo_comprobante: voto.codigo_comprobante,
            asunto,
            cuerpo,
          },
        });

        return construirResultado(true, voto.proceso_id, voto.derecho_voto_id, voto.codigo_comprobante, voto.hora_servidor);
      });
    } catch (e) {
      // D5: el catch vive FUERA del callback — tras un 23505 la transacción queda abortada
      // (25P02) y ninguna sentencia más puede correr sobre ese `tx`. La re-consulta ocurre en una
      // conexión limpia.
      if (esColisionDeVoto(e)) {
        return this.comprobanteExistente(dto);
      }

      if (e instanceof RechazoVoto) {
        await this.prisma.$transaction((tx) =>
          this.auditoria.log(tx, AUDIT_EVENT_TYPES.RECHAZO, sesion.userId, 'DerechoVoto', dto.derecho_voto_id, {
            proceso_id: e.procesoId,
            derecho_voto_id: e.derechoVotoId,
            motivo: e.motivo,
          } as Prisma.InputJsonValue),
        );

        // Causa 4 (DERECHO_YA_EJERCIDO): no es un error HTTP — responde con el comprobante ya
        // emitido (Taxonomía de rechazos de design.md).
        if (e.codigo === VOTOS_ERROR_CODES.DERECHO_YA_EJERCIDO) {
          return e.comprobante!;
        }

        throw e.aHttp();
      }

      throw e;
    }
  }

  /**
   * vote-casting, PR3 (design.md D6/D13, "Contratos HTTP", tarea 10.1). Enriquece el
   * `ResultadoEmision` interno (PR2) con lo que el controlador necesita para `ComprobanteDto`:
   * nombre del proceso, calidad del votante y resumen de la elección. Se invoca DESPUÉS de que
   * `emitir()` ya resolvió (creó o encontró) el `Voto` — lectura de presentación, no participa de
   * la transacción atómica.
   */
  async construirComprobante(resultado: ResultadoEmision): Promise<ComprobanteDto> {
    const [derecho, proceso, voto, anioActivo] = await Promise.all([
      this.prisma.derechoVoto.findUniqueOrThrow({
        where: { id: resultado.derecho_voto_id },
        select: { en_calidad_de: true },
      }),
      this.prisma.procesoElectoral.findUniqueOrThrow({
        where: { id: resultado.proceso_id },
        select: { nombre: true },
      }),
      this.prisma.voto.findFirstOrThrow({
        where: { proceso_id: resultado.proceso_id, derecho_voto_id: resultado.derecho_voto_id },
        select: { lista_id: true, opcion_id: true, candidato_id: true, blanco: true },
      }),
      // fidelidad-visual-boleta-votacion, PR1 (design.md D2). Lectura independiente del año
      // escolar vigente, sin join con Voto/DerechoVoto/ProcesoElectoral. `orderBy` explícito
      // porque `activo` no tiene restricción de unicidad — con dos filas activas, `findFirst`
      // sin orden sería no determinístico entre ejecuciones.
      this.prisma.anioEscolar.findFirst({
        where: { activo: true },
        orderBy: { nombre: 'desc' },
        select: { nombre: true },
      }),
    ]);

    return {
      codigo_comprobante: resultado.codigo_comprobante,
      hora_servidor: resultado.hora_servidor,
      proceso: { id: resultado.proceso_id, nombre: proceso.nombre },
      en_calidad_de: derecho.en_calidad_de,
      eleccion_resumen: await resolverEleccionResumen(this.prisma, voto),
      periodo_lectivo: anioActivo?.nombre,
    };
  }

  private async comprobanteExistente(dto: EmitirVotoDto): Promise<ResultadoEmision> {
    const voto = await this.prisma.voto.findFirst({ where: { derecho_voto_id: dto.derecho_voto_id } });
    if (!voto) {
      throw new ConflictException({ codigo: VOTOS_ERROR_CODES.ELECCION_INVALIDA });
    }
    return construirResultado(false, voto.proceso_id, voto.derecho_voto_id, voto.codigo_comprobante, voto.hora_servidor);
  }
}
