import type { Escrutinio } from './escrutinio';

/**
 * cierre-escrutinio-actas (#17, PR3; design.md D6/D7/D8). Módulo PURO: arma los 4 snapshots
 * `Acta.contenido` a partir de UN solo resultado de `calcularEscrutinio()` (D5) — ninguna consulta
 * a la base, ningún `Date.now()` (el `generado_en`/`apertura_real`/`cierre_real` llegan ya
 * resueltos con el reloj de Postgres desde `ProcesosService.cerrar()`).
 *
 * Los porcentajes se ALMACENAN (al revés que `#16`, D8 lo justifica): el acta es un documento
 * probatorio, no una vista — si el PDF los recalculara, el número impreso dejaría de estar
 * respaldado por el snapshot.
 */

export const NOTA_NULOS =
  'Los votos nulos se reportan en 0: el sistema no permite emitir un voto nulo; toda boleta enviada es válida o en blanco.';

export interface ProcesoSnapshot {
  id: string;
  nombre: string;
  tipo: string;
  apertura_real: string;
  cierre_real: string;
  ocultar_resultados: boolean;
}

export interface InstitucionSnapshot {
  nombre: string | null;
  director: string | null;
}

export interface FirmanteSnapshot {
  nombre: string;
  cargo: string;
}

export interface PadronSnapshot {
  derechos_estudiante: number;
  derechos_padre: number;
  aulas: number;
}

export interface FilaDesgloseActa {
  id: string;
  etiqueta: string;
  votos: number;
  porcentaje: number;
  estado: 'activo' | 'baja';
  baja_en: string | null;
}

export interface CuadreActa {
  padron_total: number;
  votos_por_opcion: number;
  blancos: number;
  nulos: 0;
  abstenciones: number;
  cuadra: boolean;
}

export interface EmpateActa {
  empate: boolean;
  votos_maximos: number;
  empatados: string[];
}

export interface QuorumActa {
  valor: number;
  informativo: true;
}

export interface ArmarActasParams {
  proceso: ProcesoSnapshot;
  institucion: InstitucionSnapshot;
  firmantes: FirmanteSnapshot[];
  generadoEn: string;
  padron: PadronSnapshot;
  escrutinio: Escrutinio;
}

interface RaizComun {
  version: 1;
  tipo: 'apertura' | 'cierre' | 'escrutinio' | 'oficial';
  generado_en: string;
  proceso: ProcesoSnapshot;
  institucion: InstitucionSnapshot;
  firmantes: FirmanteSnapshot[];
  notas: string[];
}

export interface ActaApertura extends RaizComun {
  tipo: 'apertura';
  padron: PadronSnapshot & { padron_total: number; apertura_real: string };
}

export interface ActaCierre extends RaizComun {
  tipo: 'cierre';
  participacion: {
    padron_total: number;
    votos_emitidos: number;
    abstenciones: number;
    porcentaje_participacion: number;
    quorum: QuorumActa;
    cierre_real: string;
  };
}

export interface ActaEscrutinio extends RaizComun {
  tipo: 'escrutinio';
  escrutinio: {
    dimension: Escrutinio['dimension'];
    desglose: FilaDesgloseActa[];
    blancos: number;
    cuadre: CuadreActa;
    empate: EmpateActa;
    sin_votos: boolean;
  };
}

export interface ActaOficial extends RaizComun {
  tipo: 'oficial';
  padron: ActaApertura['padron'];
  participacion: ActaCierre['participacion'];
  escrutinio: ActaEscrutinio['escrutinio'];
}

export interface ActasArmadas {
  apertura: ActaApertura;
  cierre: ActaCierre;
  escrutinio: ActaEscrutinio;
  oficial: ActaOficial;
}

function redondear2(valor: number): number {
  return Math.round(valor * 10000) / 100;
}

function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : redondear2(parte / total);
}

function trimFirmantes(firmantes: FirmanteSnapshot[]): FirmanteSnapshot[] {
  return firmantes.map((f) => ({ nombre: f.nombre.trim(), cargo: f.cargo.trim() }));
}

export function armarActas(params: ArmarActasParams): ActasArmadas {
  const { proceso, institucion, generadoEn, padron, escrutinio } = params;
  const firmantes = trimFirmantes(params.firmantes);
  const notas = [NOTA_NULOS];

  const padronTotal = escrutinio.padron_total;
  const votosEmitidos = escrutinio.votos_emitidos;
  const votosPorOpcion = escrutinio.desglose.reduce((acc, fila) => acc + fila.votos, 0);
  const abstenciones = padronTotal - votosEmitidos;
  const porcentajeParticipacion = porcentaje(votosEmitidos, padronTotal);

  const cuadre: CuadreActa = {
    padron_total: padronTotal,
    votos_por_opcion: votosPorOpcion,
    blancos: escrutinio.blancos,
    nulos: 0,
    abstenciones,
    cuadra: votosPorOpcion + escrutinio.blancos + 0 + abstenciones === padronTotal,
  };

  const votosMaximos = escrutinio.desglose.reduce((max, fila) => Math.max(max, fila.votos), 0);
  const empatados = votosMaximos > 0 ? escrutinio.desglose.filter((f) => f.votos === votosMaximos).map((f) => f.id) : [];
  const empate: EmpateActa = {
    empate: votosMaximos > 0 && empatados.length >= 2,
    votos_maximos: votosMaximos,
    empatados,
  };

  const sinVotos = votosEmitidos === 0;

  const desglose: FilaDesgloseActa[] = escrutinio.desglose.map((fila) => ({
    id: fila.id,
    etiqueta: fila.etiqueta,
    votos: fila.votos,
    porcentaje: porcentaje(fila.votos, votosEmitidos),
    estado: fila.estado,
    baja_en: fila.baja_en,
  }));

  function raiz<T extends RaizComun['tipo']>(tipo: T): Omit<RaizComun, 'tipo'> & { tipo: T } {
    return {
      version: 1,
      tipo,
      generado_en: generadoEn,
      proceso,
      institucion,
      firmantes,
      notas,
    };
  }

  const padronSeccion: ActaApertura['padron'] = {
    padron_total: padronTotal,
    derechos_estudiante: padron.derechos_estudiante,
    derechos_padre: padron.derechos_padre,
    aulas: padron.aulas,
    apertura_real: proceso.apertura_real,
  };

  const participacionSeccion: ActaCierre['participacion'] = {
    padron_total: padronTotal,
    votos_emitidos: votosEmitidos,
    abstenciones,
    porcentaje_participacion: porcentajeParticipacion,
    quorum: { valor: porcentaje(votosEmitidos, padronTotal), informativo: true },
    cierre_real: proceso.cierre_real,
  };

  const escrutinioSeccion: ActaEscrutinio['escrutinio'] = {
    dimension: escrutinio.dimension,
    desglose,
    blancos: escrutinio.blancos,
    cuadre,
    empate,
    sin_votos: sinVotos,
  };

  const apertura: ActaApertura = { ...raiz('apertura'), padron: padronSeccion };
  const cierre: ActaCierre = { ...raiz('cierre'), participacion: participacionSeccion };
  const escrutinioActa: ActaEscrutinio = { ...raiz('escrutinio'), escrutinio: escrutinioSeccion };
  const oficial: ActaOficial = {
    ...raiz('oficial'),
    padron: padronSeccion,
    participacion: participacionSeccion,
    escrutinio: escrutinioSeccion,
  };

  return { apertura, cierre, escrutinio: escrutinioActa, oficial };
}
