import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogoConfirmacion } from './DialogoConfirmacion';

// [design.md D5, tasks.md 8.1-8.4] Misma forma que auth/DialogoVinculacion
// (role="dialog" inline, sin portal). 3 consumidores reales: eliminar,
// activar (D9), y el primer paso del traslado de Matrícula (D10).
describe('DialogoConfirmacion', () => {
  it('renderiza role="dialog" con aria-label, titulo y descripcion visibles', () => {
    render(
      <DialogoConfirmacion
        titulo="Eliminar Nivel"
        descripcion="Esta acción no se puede deshacer."
        etiquetaConfirmar="Eliminar"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
        procesando={false}
      />,
    );

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAccessibleName('Eliminar Nivel');
    expect(screen.getByText('Eliminar Nivel')).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
  });

  it('clic en confirmar llama a onConfirmar; clic en cancelar llama a onCancelar y no a onConfirmar', () => {
    const onConfirmar = vi.fn();
    const onCancelar = vi.fn();
    render(
      <DialogoConfirmacion
        titulo="Eliminar Nivel"
        descripcion="Esta acción no se puede deshacer."
        etiquetaConfirmar="Eliminar"
        onConfirmar={onConfirmar}
        onCancelar={onCancelar}
        procesando={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
    expect(onCancelar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));
    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('procesando=true deshabilita ambos botones', () => {
    render(
      <DialogoConfirmacion
        titulo="Eliminar Nivel"
        descripcion="Esta acción no se puede deshacer."
        etiquetaConfirmar="Eliminar"
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
        procesando={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancelar/i })).toBeDisabled();
  });
});
