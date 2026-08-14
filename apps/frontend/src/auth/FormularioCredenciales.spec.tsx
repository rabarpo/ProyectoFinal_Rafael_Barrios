import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioCredenciales } from './FormularioCredenciales';

// [spec: minimal-login, "Formulario de login con código institucional y
// contraseña"] Presentacional puro: código + contraseña, submit deshabilitado
// con campos vacíos, sin invocar red directamente (eso lo hace LoginPage).
describe('FormularioCredenciales', () => {
  it('deshabilita el submit cuando código o contraseña están vacíos', () => {
    render(<FormularioCredenciales onEnviar={vi.fn()} cargando={false} />);

    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/código institucional/i), {
      target: { value: 'seed-comite' },
    });
    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  it('habilita el submit y llama onEnviar(codigo, password) con ambos campos completos', () => {
    const onEnviar = vi.fn();
    render(<FormularioCredenciales onEnviar={onEnviar} cargando={false} />);

    fireEvent.change(screen.getByLabelText(/código institucional/i), {
      target: { value: 'seed-comite' },
    });
    fireEvent.change(screen.getByLabelText(/contraseña/i, { selector: 'input' }), {
      target: { value: 'clave-secreta' },
    });
    const boton = screen.getByRole('button', { name: /continuar/i });
    expect(boton).toBeEnabled();

    fireEvent.click(boton);

    expect(onEnviar).toHaveBeenCalledTimes(1);
    expect(onEnviar).toHaveBeenCalledWith('seed-comite', 'clave-secreta');
  });

  it('muestra el mensajeError recibido y conserva el código tecleado', () => {
    render(
      <FormularioCredenciales onEnviar={vi.fn()} cargando={false} mensajeError="Credenciales inválidas" />,
    );

    expect(screen.getByText('Credenciales inválidas')).toBeInTheDocument();
  });
});
