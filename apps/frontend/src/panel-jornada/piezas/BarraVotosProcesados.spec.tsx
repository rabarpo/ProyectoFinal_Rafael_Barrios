import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarraVotosProcesados } from './BarraVotosProcesados';

// dashboard-panel-jornada (rediseño visual). Presentacional puro: deriva el porcentaje de
// `votosEmitidos / padronTotal` (misma fórmula que `PanelParticipacion`, resultados-en-vivo #16)
// y lo refleja tanto en texto como en el ancho de la barra de progreso.
describe('BarraVotosProcesados', () => {
  it('muestra el porcentaje de votos procesados', () => {
    render(<BarraVotosProcesados votosEmitidos={25} padronTotal={100} />);

    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('el ancho de la barra de progreso refleja el porcentaje', () => {
    render(<BarraVotosProcesados votosEmitidos={25} padronTotal={100} />);

    const barra = screen.getByTestId('barra-votos-procesados-relleno');
    expect(barra).toHaveStyle({ width: '25%' });
  });

  it('con padrón total 0, no divide por cero (0%)', () => {
    render(<BarraVotosProcesados votosEmitidos={0} padronTotal={0} />);

    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});
