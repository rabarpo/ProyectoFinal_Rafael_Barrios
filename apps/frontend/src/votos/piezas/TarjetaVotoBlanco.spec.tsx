import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TarjetaVotoBlanco } from './TarjetaVotoBlanco';

// fidelidad-visual-boleta-votacion, PR3 (design.md D1, tasks.md 12.1-12.4; spec: vote-casting
// "TarjetaVotoBlanco con ícono circular y botón dedicado", "nunca preseleccionado").
describe('TarjetaVotoBlanco', () => {
  it('[12.1] ícono circular distintivo + BotonSeleccion con texto "Votar en Blanco"', () => {
    const { container } = render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);

    expect(screen.getByText('Voto en Blanco')).toBeInTheDocument();
    expect(screen.getByText('Votar en Blanco')).toBeInTheDocument();
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('[12.2] el radio interno participa del mismo radiogroup/name="eleccion"', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio', { name: 'Votar en Blanco' });
    expect(radio).toHaveAttribute('name', 'eleccion');
  });

  it('[12.3] nunca marcada como seleccionada al montar', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'Votar en Blanco' })).not.toBeChecked();
  });

  it('[12.4] nombre accesible del botón es "Votar en Blanco" (nombre visible "Voto en Blanco" intacto)', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);
    expect(screen.getByText('Voto en Blanco')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /votar en blanco/i })).toBeInTheDocument();
  });

  it('[9.1/10.1] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });

  it('click en el radio dispara onSeleccionar', () => {
    const onSeleccionar = vi.fn();
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={onSeleccionar} />);
    fireEvent.click(screen.getByRole('radio'));
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });
});
