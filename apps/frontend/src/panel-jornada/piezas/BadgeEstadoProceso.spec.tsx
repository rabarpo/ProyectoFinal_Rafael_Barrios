import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BadgeEstadoProceso } from './BadgeEstadoProceso';

// dashboard-panel-jornada (rediseño visual, referencia de captura del dashboard de elecciones).
// Presentacional puro: mapea `resumen.estado` a una etiqueta + color, con un punto de estado
// `aria-hidden` (decorativo, la etiqueta de texto ya comunica el estado a lectores de pantalla).
describe('BadgeEstadoProceso', () => {
  it('estado "abierto" muestra la etiqueta "Activo"', () => {
    render(<BadgeEstadoProceso estado="abierto" />);

    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('estado "cerrado" muestra la etiqueta "Cerrado"', () => {
    render(<BadgeEstadoProceso estado="cerrado" />);

    expect(screen.getByText('Cerrado')).toBeInTheDocument();
  });

  it('estado "acta_emitida" muestra la etiqueta "Acta emitida"', () => {
    render(<BadgeEstadoProceso estado="acta_emitida" />);

    expect(screen.getByText('Acta emitida')).toBeInTheDocument();
  });

  it('el punto de estado es decorativo (aria-hidden)', () => {
    render(<BadgeEstadoProceso estado="abierto" />);

    const punto = screen.getByTestId('punto-estado-proceso');
    expect(punto).toHaveAttribute('aria-hidden', 'true');
  });
});
