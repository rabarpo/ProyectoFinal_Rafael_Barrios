import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TarjetasMetricasProceso } from './TarjetasMetricasProceso';

const RESUMEN = {
  proceso_id: 'p1',
  estado: 'abierto' as const,
  padron_total: 50,
  votos_emitidos: 20,
  correos_fallidos: 1,
  estado_visibilidad: 'visible' as const,
  hora_servidor: '2026-08-23T12:00:00.000Z',
};

// dashboard-panel-jornada (rediseño visual). Presentacional puro: fila de 4 tarjetas —
// Votantes Totales/Votos Emitidos/Pendientes se derivan de `resumen` (mismo `padron_total` -
// `votos_emitidos` que `PanelParticipacion`, resultados-en-vivo #16); "Cierre Est." es opcional
// porque depende de `fechaCierrePrevista` (sólo disponible si `ProcesoRespuestaDto` la trae en la
// lista de procesos abiertos que ya consulta `PanelJornadaPage`).
describe('TarjetasMetricasProceso', () => {
  it('muestra votantes totales, votos emitidos y pendientes derivados del resumen', () => {
    render(<TarjetasMetricasProceso resumen={RESUMEN} />);

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  it('con fechaCierrePrevista, muestra la tarjeta "Cierre Est."', () => {
    render(<TarjetasMetricasProceso resumen={RESUMEN} fechaCierrePrevista="2026-08-23T18:00:00.000Z" />);

    expect(screen.getByText('Cierre Est.')).toBeInTheDocument();
  });

  it('sin fechaCierrePrevista, omite la tarjeta "Cierre Est." en vez de inventar un dato', () => {
    render(<TarjetasMetricasProceso resumen={RESUMEN} />);

    expect(screen.queryByText('Cierre Est.')).not.toBeInTheDocument();
  });
});
