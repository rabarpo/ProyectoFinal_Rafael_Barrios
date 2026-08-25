import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TarjetaOpcion } from './TarjetaOpcion';
import type { PapeletaOpcionDto } from '../votos-api';

// fidelidad-visual-boleta-votacion, PR4 (design.md D1/D8, tasks.md 20.1-20.4; spec: vote-casting
// "Proceso consulta renderiza tarjetas de Opción simple").
const OPCION: PapeletaOpcionDto = {
  id: 'o1',
  etiqueta: '¿Aprueba el nuevo reglamento?',
  descripcion: 'Reglamento de convivencia 2026',
};

describe('TarjetaOpcion', () => {
  it('[20.1] renderiza cinta de etiqueta y descripción, sin foto', () => {
    render(<TarjetaOpcion opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);

    expect(screen.getByText('¿Aprueba el nuevo reglamento?')).toBeInTheDocument();
    expect(screen.getByText('Reglamento de convivencia 2026')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('[20.2] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>', () => {
    render(<TarjetaOpcion opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });

  it('[20.3] nombre accesible del radio es "Seleccionar esta Opción: {etiqueta}" y dispara onSeleccionar', () => {
    const onSeleccionar = vi.fn();
    render(<TarjetaOpcion opcion={OPCION} seleccionada={false} onSeleccionar={onSeleccionar} />);
    const radio = screen.getByRole('radio', {
      name: 'Seleccionar esta Opción: ¿Aprueba el nuevo reglamento?',
    });
    fireEvent.click(radio);
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it('[20.1] al seleccionar, el borde se engruesa y el check aparece junto a la cinta', () => {
    const { container, rerender } = render(
      <TarjetaOpcion opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />,
    );
    expect(container.querySelector('.border-2.border-primary')).toBeNull();

    rerender(<TarjetaOpcion opcion={OPCION} seleccionada onSeleccionar={vi.fn()} />);
    expect(container.querySelector('.border-2.border-primary')).not.toBeNull();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
