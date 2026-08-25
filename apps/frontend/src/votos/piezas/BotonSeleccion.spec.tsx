import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { BotonSeleccion } from './BotonSeleccion';

// fidelidad-visual-boleta-votacion, PR3 (design.md D1, tasks.md 9.1-9.6). Único dueño del
// contrato ARIA compartido por las 4 tarjetas: el <input type="radio" sr-only> se conserva, el
// botón sólido de selección ES su <label>.
describe('BotonSeleccion', () => {
  it('[9.1] renderiza <label> conteniendo <input type="radio" name="eleccion" sr-only>', () => {
    render(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada={false} onSeleccionar={vi.fn()} />,
    );

    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('type', 'radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });

  it('[9.2] aria-label es "{texto}: {etiqueta}" cuando etiqueta está definida (WCAG 2.5.3)', () => {
    render(
      <BotonSeleccion
        texto="Seleccionar Lista"
        etiqueta="Lista A"
        seleccionada={false}
        onSeleccionar={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Seleccionar Lista: Lista A' })).toBeInTheDocument();
  });

  it('[9.3] aria-label es solo texto cuando etiqueta se omite (voto en blanco)', () => {
    render(
      <BotonSeleccion texto="Votar en Blanco" seleccionada={false} onSeleccionar={vi.fn()} />,
    );

    expect(screen.getByRole('radio', { name: 'Votar en Blanco' })).toBeInTheDocument();
  });

  it('[9.4] fireEvent.click en el radio dispara onSeleccionar una única vez', () => {
    const onSeleccionar = vi.fn();
    render(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada={false} onSeleccionar={onSeleccionar} />,
    );

    fireEvent.click(screen.getByRole('radio'));

    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it('[9.4] keyDown Space en el radio dispara onSeleccionar una única vez', () => {
    const onSeleccionar = vi.fn();
    render(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada={false} onSeleccionar={onSeleccionar} />,
    );

    fireEvent.keyDown(screen.getByRole('radio'), { key: ' ' });

    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it('[9.4] keyDown Enter en el radio dispara onSeleccionar una única vez', () => {
    const onSeleccionar = vi.fn();
    render(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada={false} onSeleccionar={onSeleccionar} />,
    );

    fireEvent.keyDown(screen.getByRole('radio'), { key: 'Enter' });

    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it('[9.5] checked refleja la prop seleccionada y el texto visible cambia a "Seleccionado"', () => {
    const { rerender } = render(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada={false} onSeleccionar={vi.fn()} />,
    );

    expect(screen.getByRole('radio')).not.toBeChecked();
    expect(screen.getByText('Seleccionar Lista')).toBeInTheDocument();

    rerender(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada onSeleccionar={vi.fn()} />,
    );

    expect(screen.getByRole('radio')).toBeChecked();
    expect(screen.getByText('Seleccionado')).toBeInTheDocument();
  });

  it('[9.6] el anillo de foco se pinta con has-[:focus-visible]:outline-2, no focus-within', () => {
    render(
      <BotonSeleccion texto="Seleccionar Lista" seleccionada={false} onSeleccionar={vi.fn()} />,
    );

    const label = screen.getByRole('radio').closest('label');
    expect(label).toHaveClass('has-[:focus-visible]:outline-2');
    expect(label?.className).not.toMatch(/focus-within/);
  });
});
