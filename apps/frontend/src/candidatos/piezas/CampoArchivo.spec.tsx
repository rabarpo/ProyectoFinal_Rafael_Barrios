import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampoArchivo } from './CampoArchivo';

// [design.md D13, tasks.md 20.3] Presentacional puro: input de archivo con
// preview de nombre/tamaño, sin efectos propios — mismo criterio de
// props-in/callbacks-out que `FormularioCredenciales`.
describe('CampoArchivo', () => {
  it('selecciona un archivo, muestra su nombre y notifica onCambiar', () => {
    const onCambiar = vi.fn();
    render(<CampoArchivo etiqueta="Foto" onCambiar={onCambiar} />);

    const archivo = new File(['contenido'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/^foto$/i), { target: { files: [archivo] } });

    expect(screen.getByText(/foto\.png/i)).toBeInTheDocument();
    expect(onCambiar).toHaveBeenCalledWith(archivo);
  });

  it('sin archivo seleccionado, muestra el nombre actual cuando se provee', () => {
    render(
      <CampoArchivo etiqueta="Plan de trabajo" onCambiar={vi.fn()} nombreActual="plan-anterior.pdf" />,
    );

    expect(screen.getByText(/plan-anterior\.pdf/i)).toBeInTheDocument();
  });
});
