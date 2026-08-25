import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TarjetaVotoBlanco } from './TarjetaVotoBlanco';

// rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.5; spec: vote-casting "Voto en Blanco
// presente en las 3 variantes, nunca preseleccionado").
describe('TarjetaVotoBlanco', () => {
  it('[14.5] texto fijo "Voto en Blanco" y border-dashed en el <label>', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);

    expect(screen.getByText('Voto en Blanco')).toBeInTheDocument();
    const radio = screen.getByRole('radio', { name: /voto en blanco/i });
    expect(radio.closest('label')).toHaveClass('border-dashed');
  });

  it('[14.5] nunca marcada como seleccionada al montar', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /voto en blanco/i })).not.toBeChecked();
  });

  it('[14.7] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>', () => {
    render(<TarjetaVotoBlanco seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });
});
