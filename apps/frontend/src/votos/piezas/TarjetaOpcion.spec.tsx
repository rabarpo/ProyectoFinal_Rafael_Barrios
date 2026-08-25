import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TarjetaOpcion } from './TarjetaOpcion';
import type { PapeletaOpcionDto } from '../votos-api';

// rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.4; spec: vote-casting "Proceso
// consulta renderiza tarjetas de Opción simple").
const OPCION: PapeletaOpcionDto = {
  id: 'o1',
  etiqueta: '¿Aprueba el nuevo reglamento?',
  descripcion: 'Reglamento de convivencia 2026',
};

describe('TarjetaOpcion', () => {
  it('[14.4] renderiza únicamente etiqueta y descripción, sin foto', () => {
    render(<TarjetaOpcion opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);

    expect(screen.getByText('¿Aprueba el nuevo reglamento?')).toBeInTheDocument();
    expect(screen.getByText('Reglamento de convivencia 2026')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('[14.7] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>', () => {
    render(<TarjetaOpcion opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });
});
