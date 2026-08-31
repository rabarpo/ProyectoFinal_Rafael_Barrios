import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelDistribucionVotos } from './PanelDistribucionVotos';

const RESUMEN_VISIBLE = {
  proceso_id: 'p1',
  estado: 'abierto' as const,
  padron_total: 50,
  votos_emitidos: 20,
  correos_fallidos: 0,
  estado_visibilidad: 'visible' as const,
  hora_servidor: '2026-08-23T12:00:00.000Z',
  dimension: 'opcion' as const,
  desglose: [{ id: 'o1', etiqueta: 'Sí', votos: 15, estado: 'activo' as const }],
  blancos: 5,
};

const RESUMEN_OCULTO = {
  proceso_id: 'p1',
  estado: 'abierto' as const,
  padron_total: 50,
  votos_emitidos: 20,
  correos_fallidos: 0,
  estado_visibilidad: 'oculto' as const,
  hora_servidor: '2026-08-23T12:00:00.000Z',
};

// dashboard-panel-jornada (rediseño visual). Presentacional puro: en modo visible reusa
// `GraficoDesglose` (resultados-en-vivo #16, PR4) con `dimension`/`desglose`/`blancos` del
// resumen; en modo oculto muestra un aviso simple, nunca ambos a la vez (mismo patrón exclusivo
// que `ResultadosPage`).
describe('PanelDistribucionVotos', () => {
  it('estado_visibilidad "visible" monta el gráfico de desglose', () => {
    render(<PanelDistribucionVotos resumen={RESUMEN_VISIBLE} />);

    expect(screen.getByTestId('grafico-pastel')).toBeInTheDocument();
    expect(screen.queryByText(/ocultos/i)).not.toBeInTheDocument();
  });

  it('estado_visibilidad "oculto" muestra un aviso, sin intentar renderizar el gráfico', () => {
    render(<PanelDistribucionVotos resumen={RESUMEN_OCULTO} />);

    expect(screen.getByText(/ocultos/i)).toBeInTheDocument();
    expect(screen.queryByTestId('grafico-pastel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('grafico-barras')).not.toBeInTheDocument();
  });
});
