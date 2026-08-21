import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampoDominios } from './CampoDominios';

// [design.md D4, tasks.md Fase 8] Presentacional puro y controlado: sin fetch,
// sin `useSesion()`, sin `<form>` propio. El único disparador del `PUT` sigue
// siendo "Guardar cambios" en `PanelDatosInstitucionales` (PR3b); esta pieza
// solo muta el arreglo local y notifica vía `onCambiar`.
describe('CampoDominios', () => {
  it('agrega un dominio válido y notifica onCambiar con el arreglo actualizado', () => {
    const onCambiar = vi.fn();
    render(<CampoDominios valor={[]} onCambiar={onCambiar} />);

    fireEvent.change(screen.getByLabelText(/dominio/i), {
      target: { value: 'colegio.edu.pe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));

    expect(onCambiar).toHaveBeenCalledWith(['colegio.edu.pe']);
  });

  it('quita el último dominio y notifica un arreglo vacío explícito', () => {
    const onCambiar = vi.fn();
    render(<CampoDominios valor={['colegio.edu.pe']} onCambiar={onCambiar} />);

    fireEvent.click(screen.getByRole('button', { name: /quitar/i }));

    expect(onCambiar).toHaveBeenCalledWith([]);
  });

  it('ignora un dominio duplicado (case-insensitive) y no vuelve a notificar', () => {
    const onCambiar = vi.fn();
    render(<CampoDominios valor={['Colegio.edu.pe']} onCambiar={onCambiar} />);

    fireEvent.change(screen.getByLabelText(/dominio/i), {
      target: { value: 'colegio.edu.pe' },
    });
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));

    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('ignora un valor vacío o solo espacios en blanco', () => {
    const onCambiar = vi.fn();
    render(<CampoDominios valor={[]} onCambiar={onCambiar} />);

    fireEvent.change(screen.getByLabelText(/dominio/i), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: /agregar/i }));

    expect(onCambiar).not.toHaveBeenCalled();
  });

  it('deshabilitado desactiva el input, el botón agregar y cada botón quitar', () => {
    const onCambiar = vi.fn();
    render(
      <CampoDominios valor={['colegio.edu.pe']} onCambiar={onCambiar} deshabilitado />,
    );

    expect(screen.getByLabelText(/dominio/i)).toBeDisabled();
    expect(screen.getByRole('button', { name: /agregar/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /quitar/i })).toBeDisabled();
  });

  it('los botones son type="button" y la pieza no renderiza un <form> propio', () => {
    const { container } = render(<CampoDominios valor={['colegio.edu.pe']} onCambiar={vi.fn()} />);

    expect(container.querySelector('form')).toBeNull();
    const agregar = screen.getByRole('button', { name: /agregar/i });
    const quitar = screen.getByRole('button', { name: /quitar/i });
    expect(agregar).toHaveAttribute('type', 'button');
    expect(quitar).toHaveAttribute('type', 'button');
  });
});
