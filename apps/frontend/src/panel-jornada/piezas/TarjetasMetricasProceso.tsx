import type { ResumenJornadaDto } from '../panel-jornada-api';

interface TarjetasMetricasProcesoProps {
  resumen: ResumenJornadaDto;
  fechaCierrePrevista?: string;
}

interface Metrica {
  etiqueta: string;
  valor: string;
  color: string;
}

// observación del usuario: fondos suaves y diversos para diferenciar las 4 tarjetas a simple
// vista. Mismos 4 primeros tonos de la paleta categórica validada del skill de dataviz (ya usada
// en Desglose/Votos por Hora) — acá al 10% de opacidad (`/10`) para un fondo apenas tintado, con
// un borde superior del mismo tono al 40% para dar identidad sin saturar la tarjeta.
const COLORES_TARJETA = ['#2a78d6', '#1baf7a', '#eda100', '#4a3aa7'];

/**
 * dashboard-panel-jornada (rediseño visual, captura de referencia). Presentacional puro: fila de
 * tarjetas — Votantes Totales / Votos Emitidos / Pendientes / Cierre Est. — derivadas del mismo
 * `resumen` que ya recibe `PanelJornadaPage`. "Pendientes" usa la misma fórmula que
 * `PanelParticipacion` (resultados-en-vivo #16): `padron_total - votos_emitidos`. "Cierre Est."
 * es opcional: sólo se renderiza si `fechaCierrePrevista` llega por props (viene de
 * `ProcesoRespuestaDto.fecha_cierre_prevista`, ya presente en `GET /procesos?estado=abierto`) —
 * si no llega, se omite la tarjeta en vez de inventar un fetch nuevo.
 */
export function TarjetasMetricasProceso({ resumen, fechaCierrePrevista }: TarjetasMetricasProcesoProps) {
  const pendientes = resumen.padron_total - resumen.votos_emitidos;

  const metricas: Metrica[] = [
    { etiqueta: 'Votantes Totales', valor: String(resumen.padron_total), color: COLORES_TARJETA[0] },
    { etiqueta: 'Votos Emitidos', valor: String(resumen.votos_emitidos), color: COLORES_TARJETA[1] },
    { etiqueta: 'Pendientes', valor: String(pendientes), color: COLORES_TARJETA[2] },
  ];

  if (fechaCierrePrevista) {
    metricas.push({
      etiqueta: 'Cierre Est.',
      valor: new Date(fechaCierrePrevista).toLocaleTimeString(),
      color: COLORES_TARJETA[3],
    });
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metricas.map((metrica) => (
        <div
          key={metrica.etiqueta}
          className="rounded-card border-t-4 p-6 shadow-elevation"
          style={{ backgroundColor: `${metrica.color}1a`, borderTopColor: metrica.color }}
        >
          <h3 className="text-label-md text-on-surface-variant">{metrica.etiqueta}</h3>
          <p className="mt-2 text-headline-lg-mobile text-primary md:text-headline-lg">{metrica.valor}</p>
        </div>
      ))}
    </div>
  );
}
