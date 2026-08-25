import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BarraProgresoVotacion } from './BarraProgresoVotacion';

// rediseno-boleta-votacion, PR3 (design.md D5, tasks.md 13.1-13.3; spec: sistema-diseno-visual
// "Instanciación del Voting Progress Indicator"). Presentacional puro: sin estado propio, cada
// paso decide `pasoActual`/`totalPasos`.
describe('BarraProgresoVotacion', () => {
  it('[13.1] expone role="progressbar" con los atributos aria del paso actual', () => {
    render(<BarraProgresoVotacion pasoActual={2} totalPasos={3} />);

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuemin', '1');
    expect(barra).toHaveAttribute('aria-valuemax', '3');
    expect(barra).toHaveAttribute('aria-valuenow', '2');
  });

  it('[13.2] muestra el texto "Paso N de M" y el porcentaje redondeado completado', () => {
    render(<BarraProgresoVotacion pasoActual={2} totalPasos={3} />);

    expect(screen.getByText('Paso 2 de 3')).toBeInTheDocument();
    expect(screen.getByText('67% Completado')).toBeInTheDocument();
  });

  it('[13.2] paso 1 de 3 redondea a 33% Completado', () => {
    render(<BarraProgresoVotacion pasoActual={1} totalPasos={3} />);

    expect(screen.getByText('Paso 1 de 3')).toBeInTheDocument();
    expect(screen.getByText('33% Completado')).toBeInTheDocument();
  });

  it('[13.3] usa únicamente clases Tailwind que mapean a tokens ya definidos en @theme', () => {
    const { container } = render(<BarraProgresoVotacion pasoActual={3} totalPasos={3} />);

    const clasesArbitrarias = container.innerHTML.match(/class="[^"]*\[[^"]*\]/g);
    expect(clasesArbitrarias).toBeNull();
  });
});
