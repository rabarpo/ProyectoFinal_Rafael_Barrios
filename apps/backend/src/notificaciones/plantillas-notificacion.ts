/**
 * notificaciones (#19, PR2; design.md D8). Motor de plantillas puro: cuatro funciones —
 * `EventoNotificacionSeei` — despachadas sobre un `Record` congelado. Sin tabla en base de datos
 * (spec: "Motor de plantillas sin tabla en base de datos"), sin E/S, sin reloj propio.
 *
 * Las plantillas NO reciben al usuario (C8, D8): `construirCorreoComprobante()` de #15 tampoco lo
 * recibe; personalizar el saludo metería el nombre real de un menor en `JobCorreo.cuerpo`, texto
 * en claro consultable por cualquiera con acceso a la tabla; y forzaría N invocaciones por evento
 * en vez de una. El `asunto` es FIJO por evento — jamás contiene `proceso_nombre` — para eliminar
 * de raíz la inyección de cabeceras SMTP desde `ProcesoElectoral.nombre` (texto libre capturado
 * por un usuario de gestión), mismo criterio que #15. El nombre del proceso viaja SÓLO en el
 * `cuerpo`, normalizado por `normalizarTextoLibre()` (`email/texto-libre.ts`, compartido con
 * `votos/correo-comprobante.ts`).
 *
 * La plantilla de `resultados` AVISA, no reporta (threat matrix: "Fuga lateral del gate
 * ocultar_resultados"): sin conteos, sin desglose, sin ganador — sólo el nombre del proceso y el
 * enlace a la bandeja, que respeta el gate de #16 en el propio endpoint de resultados.
 */
import { normalizarTextoLibre } from '../email/texto-libre';

export type EventoNotificacionSeei =
  | 'inicio_votacion'
  | 'recordatorio'
  | 'cierre_proximo'
  | 'resultados';

export interface DatosNotificacion {
  proceso_nombre: string;
  /** Requerido por inicio_votacion/recordatorio/cierre_proximo. */
  fecha_cierre_prevista?: Date;
  /** Ausente ⇒ el cuerpo omite el enlace y no lanza (mismo criterio que #15 D2). */
  app_base_url?: string;
}

export interface ContenidoNotificacion {
  titulo: string;
  cuerpo: string;
  asunto: string;
}

function construirEnlace(appBaseUrl: string | undefined): string {
  return appBaseUrl ? `\n\nRevisa tu bandeja de notificaciones: ${appBaseUrl}/notificaciones` : '';
}

function construirInicioVotacion(datos: DatosNotificacion): ContenidoNotificacion {
  const procesoNombre = normalizarTextoLibre(datos.proceso_nombre);
  const cierreIso = datos.fecha_cierre_prevista?.toISOString() ?? '';

  return {
    titulo: 'Votación abierta',
    asunto: 'La votación ya está abierta',
    cuerpo:
      `La votación del proceso "${procesoNombre}" ya está abierta.\n\n` +
      `Cierra: ${cierreIso}.` +
      construirEnlace(datos.app_base_url),
  };
}

function construirRecordatorio(datos: DatosNotificacion): ContenidoNotificacion {
  const procesoNombre = normalizarTextoLibre(datos.proceso_nombre);
  const cierreIso = datos.fecha_cierre_prevista?.toISOString() ?? '';

  return {
    titulo: 'Recordatorio de votación',
    asunto: 'Recordatorio: tu voto está pendiente',
    cuerpo:
      `Todavía no votaste en "${procesoNombre}".\n\n` +
      `La votación cierra: ${cierreIso}.` +
      construirEnlace(datos.app_base_url),
  };
}

function construirCierreProximo(datos: DatosNotificacion): ContenidoNotificacion {
  const procesoNombre = normalizarTextoLibre(datos.proceso_nombre);
  const cierreIso = datos.fecha_cierre_prevista?.toISOString() ?? '';

  return {
    titulo: 'Cierre próximo',
    asunto: 'La votación cierra pronto',
    cuerpo:
      `La votación de "${procesoNombre}" cierra pronto: ${cierreIso}.` +
      construirEnlace(datos.app_base_url),
  };
}

function construirResultados(datos: DatosNotificacion): ContenidoNotificacion {
  const procesoNombre = normalizarTextoLibre(datos.proceso_nombre);

  return {
    titulo: 'Resultados disponibles',
    asunto: 'Los resultados ya están disponibles',
    cuerpo:
      `Los resultados de "${procesoNombre}" ya están disponibles.` +
      construirEnlace(datos.app_base_url),
  };
}

const PLANTILLAS: Readonly<Record<EventoNotificacionSeei, (datos: DatosNotificacion) => ContenidoNotificacion>> =
  Object.freeze({
    inicio_votacion: construirInicioVotacion,
    recordatorio: construirRecordatorio,
    cierre_proximo: construirCierreProximo,
    resultados: construirResultados,
  });

export function construirNotificacion(
  evento: EventoNotificacionSeei,
  datos: DatosNotificacion,
): ContenidoNotificacion {
  return PLANTILLAS[evento](datos);
}
