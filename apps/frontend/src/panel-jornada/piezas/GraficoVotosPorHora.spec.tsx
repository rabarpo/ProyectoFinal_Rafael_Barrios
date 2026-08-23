import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraficoVotosPorHora } from './GraficoVotosPorHora';

const FRANJAS = [
  { hora_inicio: '2026-08-23T09:00:00.000Z', votos: 5 },
  { hora_inicio: '2026-08-23T10:00:00.000Z', votos: 8 },
  { hora_inicio: '2026-08-23T11:00:00.000Z', votos: 0 },
];

// [design.md "Cambios de archivos"/"Estrategia de pruebas"; tasks.md 11.2] Mismo gotcha de
// recharts/jsdom que #16 (GraficoDesglose): las aserciones van sobre la tabla espejo, no sobre el
// SVG. Orden cronológico preservado: el componente NUNCA reordena.
describe('GraficoVotosPorHora', () => {
  it('[11.2] tabla espejo con las mismas franjas/valores recibidos', () => {
    render(<GraficoVotosPorHora franjas={FRANJAS} />);

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas).toHaveLength(FRANJAS.length);
  });

  it('[11.2] preserva el orden cronológico recibido, sin reordenar', () => {
    render(<GraficoVotosPorHora franjas={FRANJAS} />);

    const filas = screen.getAllByRole('row').slice(1);
    expect(filas[0]).toHaveTextContent('5');
    expect(filas[1]).toHaveTextContent('8');
    expect(filas[2]).toHaveTextContent('0');
  });
});
