import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelParticipacion } from './PanelParticipacion';

// [spec: "Sin categoría de nulos; abstención derivada"; tasks.md 14.1] Porcentaje de
// participación y abstenciones se derivan en el cliente a partir de los dos enteros del
// servidor — no son campos del payload (proposal.md decisión 1).
describe('PanelParticipacion', () => {
  it('[14.1] deriva porcentaje y abstenciones en el cliente', () => {
    render(<PanelParticipacion votosEmitidos={8} padronTotal={10} horaServidor="2026-08-15T14:32:07.123Z" />);

    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('80.0%')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('[14.1] padron_total 0 no divide por cero', () => {
    render(<PanelParticipacion votosEmitidos={0} padronTotal={0} horaServidor="2026-08-15T14:32:07.123Z" />);

    expect(screen.getByText('0.0%')).toBeInTheDocument();
  });
});
