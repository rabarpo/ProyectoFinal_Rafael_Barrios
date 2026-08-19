import type { Prisma } from '@prisma/client';

/**
 * cierre-escrutinio-actas (#17, PR2; design.md D5). Extracción SIN deriva del cálculo de
 * `resultados-en-vivo` (#16): funciones LIBRES sobre `tx` (idioma de `materializarDerechosVoto()`
 * en `procesos.service.ts`), no un provider Nest — el consumidor no está sólo en Nest (el worker
 * de `#17` también las usará).
 *
 * La partición en dos funciones NO es cosmética: la Threat Matrix de `#16` ("Fuga de resultados en
 * modo oculto") exige que el modo oculto NUNCA calcule el desglose, ni siquiera para descartarlo.
 * `calcularParticipacion()` sólo agrega padrón/votos emitidos; el desglose completo (con
 * `estado`/`baja_en` por fila, sin filtrar `estado: 'activo'`) sólo se calcula en
 * `calcularEscrutinio()`.
 */

export type Dimension = 'lista' | 'candidato' | 'opcion';
export type CampoVoto = 'lista_id' | 'candidato_id' | 'opcion_id';

interface Catalogo {
  dimension: Dimension;
  campo: CampoVoto;
}

// Mismo mapeo tipo -> dimensión/campo que #16 (resultados.service.ts original).
export function catalogoDe(tipo: string): Catalogo {
  if (tipo === 'municipio') {
    return { dimension: 'lista', campo: 'lista_id' };
  }
  if (tipo === 'consulta') {
    return { dimension: 'opcion', campo: 'opcion_id' };
  }
  // representante_aula | padres
  return { dimension: 'candidato', campo: 'candidato_id' };
}

export interface Participacion {
  ahora: Date;
  padron_total: number;
  votos_emitidos: number;
}

export interface FilaEscrutinio {
  id: string;
  etiqueta: string;
  votos: number;
  estado: 'activo' | 'baja';
  // SÓLO para el acta de escrutinio de #17 — jamás llega a ResultadosRespuestaDto (D5).
  baja_en: string | null;
}

export interface Escrutinio extends Participacion {
  blancos: number;
  dimension: Dimension;
  desglose: FilaEscrutinio[];
}

/**
 * Participación pura: `ahora`/`padron_total`/`votos_emitidos`. NO ejecuta `groupBy` ni el
 * `findMany` del catálogo — es la única función que corre en modo oculto (D5).
 */
export async function calcularParticipacion(tx: Prisma.TransactionClient, procesoId: string): Promise<Participacion> {
  const [{ ahora }] = await tx.$queryRaw<{ ahora: Date }[]>`SELECT now() AS ahora`;
  const padronTotal = await tx.derechoVoto.count({ where: { proceso_id: procesoId } });
  const votosEmitidos = await tx.voto.count({ where: { proceso_id: procesoId } });

  return { ahora, padron_total: padronTotal, votos_emitidos: votosEmitidos };
}

/**
 * Escrutinio completo = participación + `blancos` + desglose (catálogo COMPLETO, sin filtrar
 * `estado: 'activo'` — el resultado es "qué se eligió", no "qué se podía elegir", D4 de #16).
 * Orden fijado acá: `votos` desc, `etiqueta` asc como desempate.
 */
export async function calcularEscrutinio(
  tx: Prisma.TransactionClient,
  procesoId: string,
  tipo: string,
): Promise<Escrutinio> {
  const participacion = await calcularParticipacion(tx, procesoId);
  const { dimension, campo } = catalogoDe(tipo);

  const blancos = await tx.voto.count({ where: { proceso_id: procesoId, blanco: true } });

  const grupos = await tx.voto.groupBy({
    by: [campo],
    where: { proceso_id: procesoId, [campo]: { not: null } },
    _count: { _all: true },
  });
  const votosPorId = new Map<string, number>(
    grupos
      .map((fila) => {
        const id = (fila as Record<CampoVoto, string | null>)[campo];
        const cuenta = (fila as { _count: { _all: number } })._count._all;
        return id ? ([id, cuenta] as const) : null;
      })
      .filter((par): par is [string, number] => par !== null),
  );

  const desglose = await catalogoCompleto(tx, dimension, procesoId, votosPorId);
  desglose.sort((a, b) => b.votos - a.votos || a.etiqueta.localeCompare(b.etiqueta));

  return { ...participacion, blancos, dimension, desglose };
}

async function catalogoCompleto(
  tx: Prisma.TransactionClient,
  dimension: Dimension,
  procesoId: string,
  votosPorId: Map<string, number>,
): Promise<FilaEscrutinio[]> {
  if (dimension === 'lista') {
    const listas = await tx.lista.findMany({ where: { proceso_id: procesoId } });
    return listas.map((lista) => ({
      id: lista.id,
      etiqueta: lista.nombre,
      votos: votosPorId.get(lista.id) ?? 0,
      estado: lista.estado,
      baja_en: lista.baja_en ? lista.baja_en.toISOString() : null,
    }));
  }
  if (dimension === 'candidato') {
    const candidatos = await tx.candidato.findMany({ where: { proceso_id: procesoId } });
    return candidatos.map((candidato) => ({
      id: candidato.id,
      etiqueta: candidato.nombres,
      votos: votosPorId.get(candidato.id) ?? 0,
      estado: candidato.estado,
      baja_en: candidato.baja_en ? candidato.baja_en.toISOString() : null,
    }));
  }
  // dimension === 'opcion' — OpcionConsulta no tiene columna estado/baja_en: siempre 'activo'.
  const opciones = await tx.opcionConsulta.findMany({ where: { proceso_id: procesoId } });
  return opciones.map((opcion) => ({
    id: opcion.id,
    etiqueta: opcion.etiqueta,
    votos: votosPorId.get(opcion.id) ?? 0,
    estado: 'activo' as const,
    baja_en: null,
  }));
}
