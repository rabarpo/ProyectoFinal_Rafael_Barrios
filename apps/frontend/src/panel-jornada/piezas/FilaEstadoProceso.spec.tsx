import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilaEstadoProceso } from './FilaEstadoProceso';

const RESUMEN = {
  proceso_id: 'p1',
  estado: 'abierto' as const,
  padron_total: 100,
  votos_emitidos: 40,
  correos_fallidos: 0,
  estado_visibilidad: 'visible' as const,
  hora_servidor: '2026-08-23T12:00:00.000Z',
};

// dashboard-panel-jornada (rediseño visual). Presentacional puro: compone
// `BadgeEstadoProceso`/"Última actualización"/`BarraVotosProcesados` en una fila de 3 tarjetas,
// mismo `resumen` que ya recibe `PanelJornadaPage` (sin fetch propio).
describe('FilaEstadoProceso', () => {
  it('muestra el estado del proceso', () => {
    render(<FilaEstadoProceso resumen={RESUMEN} />);

    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('muestra la última actualización formateada', () => {
    render(<FilaEstadoProceso resumen={RESUMEN} />);

    expect(screen.getByText(new Date(RESUMEN.hora_servidor).toLocaleString())).toBeInTheDocument();
  });

  it('muestra el porcentaje de votos procesados', () => {
    render(<FilaEstadoProceso resumen={RESUMEN} />);

    expect(screen.getByText('40.0%')).toBeInTheDocument();
  });
});
