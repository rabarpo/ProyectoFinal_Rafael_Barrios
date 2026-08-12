import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DialogoVinculacion } from './DialogoVinculacion';

// [spec: minimal-login, "Vinculación requerida (409) no autentica ni
// redirige"] Presentacional puro: segundo paso de VINCULACION_REQUERIDA —
// pide la contraseña actual y la reenvía junto con el idToken ya recibido
// (design.md D8, tabla "Manejo de errores").
describe('DialogoVinculacion', () => {
  it('deshabilita confirmar con contraseña vacía', () => {
    render(<DialogoVinculacion cargando={false} onConfirmar={vi.fn()} onCancelar={vi.fn()} />);

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();
  });

  it('invoca onConfirmar(password) al confirmar con contraseña completada', () => {
    const onConfirmar = vi.fn();
    render(<DialogoVinculacion cargando={false} onConfirmar={onConfirmar} onCancelar={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/contraseña actual/i), {
      target: { value: 'clave-actual' },
    });
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    expect(onConfirmar).toHaveBeenCalledWith('clave-actual');
  });

  it('invoca onCancelar al cancelar', () => {
    const onCancelar = vi.fn();
    render(<DialogoVinculacion cargando={false} onConfirmar={vi.fn()} onCancelar={onCancelar} />);

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
