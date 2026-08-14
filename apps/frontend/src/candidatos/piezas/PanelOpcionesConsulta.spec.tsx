import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelOpcionesConsulta } from './PanelOpcionesConsulta';
import type { OpcionRespuestaDto } from '../candidatos-api';

// [spec: candidatos-listas-management, "Etiqueta personalizada aceptada";
// tasks.md 23.2] La UI SUGIERE A/B/C como valor por defecto sin restringir
// la entrada — nunca bloquea texto libre.
describe('PanelOpcionesConsulta', () => {
  it('sugiere la siguiente letra A/B/C como valor por defecto según las opciones existentes', () => {
    const existentes: OpcionRespuestaDto[] = [
      { id: 'o1', proceso_id: 'p1', etiqueta: 'A' },
    ];
    render(
      <PanelOpcionesConsulta
        opciones={existentes}
        onCrear={vi.fn()}
        onBorrar={vi.fn()}
        enviando={false}
      />,
    );

    expect(screen.getByLabelText(/etiqueta/i)).toHaveValue('B');
  });

  it('acepta texto libre distinto de A/B/C e invoca onCrear con esa etiqueta', () => {
    const onCrear = vi.fn();
    render(
      <PanelOpcionesConsulta opciones={[]} onCrear={onCrear} onBorrar={vi.fn()} enviando={false} />,
    );

    fireEvent.change(screen.getByLabelText(/etiqueta/i), { target: { value: 'Sí' } });
    fireEvent.click(screen.getByRole('button', { name: /agregar opción/i }));

    expect(onCrear).toHaveBeenCalledWith({ etiqueta: 'Sí', descripcion: '' });
  });

  it('lista las opciones existentes e invoca onBorrar con el id al eliminar', () => {
    const onBorrar = vi.fn();
    const existentes: OpcionRespuestaDto[] = [
      { id: 'o1', proceso_id: 'p1', etiqueta: 'Sí' },
      { id: 'o2', proceso_id: 'p1', etiqueta: 'No' },
    ];
    render(
      <PanelOpcionesConsulta opciones={existentes} onCrear={vi.fn()} onBorrar={onBorrar} enviando={false} />,
    );

    expect(screen.getByText('Sí')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /eliminar/i })[0]);

    expect(onBorrar).toHaveBeenCalledWith('o1');
  });
});
