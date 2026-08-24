import type { Prisma } from '@prisma/client';
import { calcularEscrutinio, calcularParticipacion } from '../procesos/escrutinio';
import type { Participacion } from '../procesos/escrutinio';
import type { ModeloReporte, Seccion } from './modelo-reporte';

/**
 * reportes-y-exportaciones (#18, PR2; design.md D6). Los 6 constructores de `ModeloReporte`, uno
 * por `DimensionReporte`, y sus consultas. `construirModelo()` es el único punto de entrada —
 * `reportes.service.ts` (PR3) decide `gate` (D7.1) ANTES de llamarlo; este módulo NUNCA reevalúa
 * `ocultar_resultados` por su cuenta.
 *
 * Invariante de `#16`/`#17` D5, repetido aquí: con `gate=true` (dimensión sensible + resultados
 * ocultos) SÓLO se llama `calcularParticipacion()` — `calcularEscrutinio()` (y por lo tanto
 * `voto.groupBy`/`lista.findMany`/`candidato.findMany`) nunca se invoca, ni siquiera para
 * descartar el desglose.
 */

export interface ConstruirModeloParams {
  procesoId: string;
  tipo: string;
  formato: string;
  /** D7.1 — decidido por el llamador: `esSensible(dimension) && proceso.ocultar_resultados`. */
  gate: boolean;
}

const TITULOS: Record<string, string> = {
  participacion: 'Participación',
  votantes: 'Votantes',
  abstenciones: 'Abstenciones',
  resultados: 'Resultados',
  candidatos: 'Candidatos',
  consultas: 'Consultas',
};

function redondear2(valor: number): number {
  return Math.round(valor * 10000) / 100;
}

function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : redondear2(parte / total);
}

function seccionResumen(participacion: Participacion): Seccion {
  const abstenciones = participacion.padron_total - participacion.votos_emitidos;
  return {
    clave: 'resumen',
    titulo: 'Resumen de participación',
    columnas: ['padron_total', 'votos_emitidos', 'abstenciones', 'porcentaje_participacion'],
    filas: [
      [
        participacion.padron_total,
        participacion.votos_emitidos,
        abstenciones,
        porcentaje(participacion.votos_emitidos, participacion.padron_total),
      ],
    ],
    sensible: false,
  };
}

interface FilaAvanceAula {
  aula_id: string;
  grado_nombre: string;
  seccion_nombre: string;
  turno: string;
  padron: bigint | number;
  votos: bigint | number;
}

async function seccionPorAula(tx: Prisma.TransactionClient, procesoId: string): Promise<Seccion> {
  const filas = await tx.$queryRaw<FilaAvanceAula[]>`
    SELECT a.id AS aula_id, g.nombre AS grado_nombre, s.nombre AS seccion_nombre, a.turno::text AS turno,
           COUNT(dv.id)::int AS padron, COUNT(v.id)::int AS votos
    FROM "DerechoVoto" dv
    JOIN "Aula" a ON a.id = dv.aula_snapshot
    JOIN "Grado" g ON g.id = a.grado_id
    JOIN "Seccion" s ON s.id = a.seccion_id
    LEFT JOIN "Voto" v ON v.derecho_voto_id = dv.id
    WHERE dv.proceso_id = ${procesoId}::uuid
    GROUP BY a.id, g.nombre, s.nombre, a.turno
    ORDER BY g.nombre, s.nombre, a.turno
  `;
  return {
    clave: 'por_aula',
    titulo: 'Avance por aula',
    columnas: ['aula', 'padron', 'votos', 'abstenciones', 'porcentaje_participacion'],
    filas: filas.map((fila) => {
      const padron = Number(fila.padron);
      const votos = Number(fila.votos);
      return [
        `${fila.grado_nombre} ${fila.seccion_nombre} (${fila.turno})`,
        padron,
        votos,
        padron - votos,
        porcentaje(votos, padron),
      ];
    }),
    sensible: false,
  };
}

function seccionDistribucion(desglose: { etiqueta: string; votos: number }[], votosEmitidos: number): Seccion {
  return {
    clave: 'distribucion',
    titulo: 'Distribución de votos',
    columnas: ['etiqueta', 'votos', 'porcentaje'],
    filas: desglose.map((fila) => [fila.etiqueta, fila.votos, porcentaje(fila.votos, votosEmitidos)]),
    sensible: true,
  };
}

async function construirParticipacion(
  tx: Prisma.TransactionClient,
  procesoId: string,
  tipo: string,
  gate: boolean,
): Promise<Seccion[]> {
  if (gate) {
    const participacion = await calcularParticipacion(tx, procesoId);
    return [seccionResumen(participacion), await seccionPorAula(tx, procesoId)];
  }
  const escrutinio = await calcularEscrutinio(tx, procesoId, tipo);
  return [
    seccionResumen(escrutinio),
    await seccionPorAula(tx, procesoId),
    seccionDistribucion(escrutinio.desglose, escrutinio.votos_emitidos),
  ];
}

interface DesgloseComoResultados {
  padron_total: number;
  votos_emitidos: number;
  blancos: number;
  desglose: { id: string; etiqueta: string; votos: number; estado: 'activo' | 'baja'; baja_en: string | null }[];
}

function seccionDesglose(escrutinio: DesgloseComoResultados): Seccion {
  const filas = escrutinio.desglose.map((fila) => [
    fila.etiqueta,
    fila.votos,
    porcentaje(fila.votos, escrutinio.votos_emitidos),
    fila.estado,
    fila.baja_en,
  ]);
  filas.push(['Blancos', escrutinio.blancos, porcentaje(escrutinio.blancos, escrutinio.votos_emitidos), 'activo', null]);
  return {
    clave: 'desglose',
    titulo: 'Desglose de votos',
    columnas: ['etiqueta', 'votos', 'porcentaje', 'estado', 'baja_en'],
    filas,
    sensible: true,
  };
}

function seccionCuadre(escrutinio: DesgloseComoResultados): Seccion {
  const votosPorOpcion = escrutinio.desglose.reduce((acc, fila) => acc + fila.votos, 0);
  const abstenciones = escrutinio.padron_total - escrutinio.votos_emitidos;
  const cuadra = votosPorOpcion + escrutinio.blancos + 0 + abstenciones === escrutinio.padron_total;
  return {
    clave: 'cuadre',
    titulo: 'Cuadre de votos',
    columnas: ['padron_total', 'votos_por_opcion', 'blancos', 'nulos', 'abstenciones', 'cuadra'],
    filas: [[escrutinio.padron_total, votosPorOpcion, escrutinio.blancos, 0, abstenciones, cuadra ? 'si' : 'no']],
    sensible: true,
  };
}

function seccionEmpate(escrutinio: DesgloseComoResultados): Seccion {
  const votosMaximos = escrutinio.desglose.reduce((max, fila) => Math.max(max, fila.votos), 0);
  const empatados =
    votosMaximos > 0 ? escrutinio.desglose.filter((fila) => fila.votos === votosMaximos).map((fila) => fila.etiqueta) : [];
  const empate = votosMaximos > 0 && empatados.length >= 2;
  return {
    clave: 'empate',
    titulo: 'Empate',
    columnas: ['empate', 'votos_maximos', 'empatados'],
    filas: [[empate ? 'si' : 'no', votosMaximos, empatados.join(', ')]],
    sensible: true,
  };
}

async function construirResultados(
  tx: Prisma.TransactionClient,
  procesoId: string,
  tipo: string,
  gate: boolean,
): Promise<Seccion[]> {
  if (gate) {
    const participacion = await calcularParticipacion(tx, procesoId);
    return [seccionResumen(participacion)];
  }
  const escrutinio = await calcularEscrutinio(tx, procesoId, tipo);
  return [seccionDesglose(escrutinio), seccionCuadre(escrutinio), seccionEmpate(escrutinio), seccionResumen(escrutinio)];
}

interface FilaVotante {
  nombres: string;
  codigo: string;
  en_calidad_de: string;
  aula_snapshot: string;
  hora_servidor: Date;
}

// D6: SELECT cerrado — jamás lista_id/opcion_id/candidato_id/blanco/codigo_comprobante/dni
// (ADR-0009/ADR-0010 §4). ADR-0010 §2 autoriza expresamente "quién votó y cuándo".
async function seccionVotantes(tx: Prisma.TransactionClient, procesoId: string): Promise<Seccion> {
  const filas = await tx.$queryRaw<FilaVotante[]>`
    SELECT u.nombres AS nombres, u.codigo AS codigo, dv.en_calidad_de AS en_calidad_de,
           dv.aula_snapshot AS aula_snapshot, v.hora_servidor AS hora_servidor
    FROM "Voto" v
    JOIN "DerechoVoto" dv ON dv.id = v.derecho_voto_id
    JOIN "Usuario" u ON u.id = dv.usuario_id
    WHERE v.proceso_id = ${procesoId}::uuid
    ORDER BY v.hora_servidor
  `;
  return {
    clave: 'votantes',
    titulo: 'Votantes',
    columnas: ['nombres', 'codigo', 'en_calidad_de', 'aula_snapshot', 'hora_servidor'],
    filas: filas.map((fila) => [
      fila.nombres,
      fila.codigo,
      fila.en_calidad_de,
      fila.aula_snapshot,
      new Date(fila.hora_servidor).toISOString(),
    ]),
    sensible: false,
  };
}

interface FilaAbstencion {
  nombres: string;
  codigo: string;
  en_calidad_de: string;
  aula_snapshot: string;
}

// D6: mismo SELECT cerrado que votantes, sin dni (retención de datos personales de menores).
async function seccionAbstenciones(tx: Prisma.TransactionClient, procesoId: string): Promise<Seccion> {
  const filas = await tx.$queryRaw<FilaAbstencion[]>`
    SELECT u.nombres AS nombres, u.codigo AS codigo, dv.en_calidad_de AS en_calidad_de,
           dv.aula_snapshot AS aula_snapshot
    FROM "DerechoVoto" dv
    LEFT JOIN "Voto" v ON v.derecho_voto_id = dv.id
    JOIN "Usuario" u ON u.id = dv.usuario_id
    WHERE dv.proceso_id = ${procesoId}::uuid AND v.id IS NULL
    ORDER BY u.nombres
  `;
  return {
    clave: 'abstenciones',
    titulo: 'Abstenciones',
    columnas: ['nombres', 'codigo', 'en_calidad_de', 'aula_snapshot'],
    filas: filas.map((fila) => [fila.nombres, fila.codigo, fila.en_calidad_de, fila.aula_snapshot]),
    sensible: false,
  };
}

// D6: catálogo completo, sin filtrar `estado`, sin `foto` (evita bytea en el export).
async function seccionCandidatos(tx: Prisma.TransactionClient, procesoId: string): Promise<Seccion> {
  const candidatos = await tx.candidato.findMany({
    where: { proceso_id: procesoId },
    include: { lista: { select: { nombre: true, numero: true } } },
  });
  return {
    clave: 'candidatos',
    titulo: 'Candidatos',
    columnas: ['nombres', 'lista', 'numero', 'cargo', 'grado', 'aula', 'estado', 'baja_en'],
    filas: candidatos.map((candidato) => [
      candidato.nombres,
      candidato.lista?.nombre ?? null,
      candidato.lista?.numero ?? null,
      candidato.cargo ?? null,
      candidato.grado ?? null,
      candidato.aula ?? null,
      candidato.estado,
      candidato.baja_en ? candidato.baja_en.toISOString() : null,
    ]),
    sensible: false,
  };
}

async function seccionConsultas(tx: Prisma.TransactionClient, procesoId: string): Promise<Seccion> {
  const opciones = await tx.opcionConsulta.findMany({
    where: { proceso_id: procesoId },
    orderBy: { etiqueta: 'asc' },
  });
  return {
    clave: 'opciones',
    titulo: 'Opciones de consulta',
    columnas: ['etiqueta', 'descripcion'],
    filas: opciones.map((opcion) => [opcion.etiqueta, opcion.descripcion ?? null]),
    sensible: false,
  };
}

export async function construirModelo(
  dimension: string,
  tx: Prisma.TransactionClient,
  params: ConstruirModeloParams,
): Promise<ModeloReporte> {
  const { procesoId, tipo, formato, gate } = params;
  let secciones: Seccion[];

  switch (dimension) {
    case 'participacion':
      secciones = await construirParticipacion(tx, procesoId, tipo, gate);
      break;
    case 'resultados':
      secciones = await construirResultados(tx, procesoId, tipo, gate);
      break;
    case 'votantes':
      secciones = [await seccionVotantes(tx, procesoId)];
      break;
    case 'abstenciones':
      secciones = [await seccionAbstenciones(tx, procesoId)];
      break;
    case 'candidatos':
      secciones = [await seccionCandidatos(tx, procesoId)];
      break;
    case 'consultas':
      secciones = [await seccionConsultas(tx, procesoId)];
      break;
    default:
      throw new Error(`Dimensión desconocida: ${dimension}`);
  }

  return {
    version: 1,
    dimension,
    formato,
    titulo: TITULOS[dimension] ?? dimension,
    generado_en: new Date().toISOString(),
    meta: [],
    secciones,
    notas: [],
  };
}
