import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioGenerico } from './FormularioGenerico';
import type { CampoFormulario } from './FormularioGenerico';

// [design.md D4, tasks.md 7.1-7.6] Pieza genérica reutilizable: campos
// declarativos `texto|seleccion` sobre `Record<string,string>` — verificado
// en el diseño que los 6 DTO de escritura del dominio son 100% string.
// Mismo criterio de validación que `FormularioCandidato`: sólo `requerido` +
// no-vacío-tras-trim, sin `useSesion()`.
const campos: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombre', etiqueta: 'Nombre', requerido: true },
  {
    tipo: 'seleccion',
    clave: 'turno',
    etiqueta: 'Turno',
    opciones: [
      { valor: 'manana', etiqueta: 'Mañana' },
      { valor: 'tarde', etiqueta: 'Tarde' },
    ],
  },
];

describe('FormularioGenerico', () => {
  it('un campo texto requerido y vacío deshabilita el submit; escribir un valor no-vacío lo habilita', () => {
    render(
      <FormularioGenerico campos={campos} modo="creacion" onEnviar={vi.fn()} enviando={false} />,
    );

    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });

    expect(screen.getByRole('button', { name: /guardar/i })).not.toBeDisabled();
  });

  it('un campo seleccion renderiza un <select> con sus opciones', () => {
    render(
      <FormularioGenerico campos={campos} modo="creacion" onEnviar={vi.fn()} enviando={false} />,
    );

    const select = screen.getByLabelText('Turno') as HTMLSelectElement;
    const opciones = Array.from(select.options).map((o) => o.textContent);
    expect(opciones).toEqual(expect.arrayContaining(['Mañana', 'Tarde']));
  });

  it('al enviar, llama a onEnviar con un Record de todos los campos', () => {
    const onEnviar = vi.fn();
    render(
      <FormularioGenerico campos={campos} modo="creacion" onEnviar={onEnviar} enviando={false} />,
    );

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana' } });
    fireEvent.change(screen.getByLabelText('Turno'), { target: { value: 'tarde' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(onEnviar).toHaveBeenCalledWith({ nombre: 'Ana', turno: 'tarde' });
  });

  it('modo edicion con valoresIniciales pre-llena los campos; modo creacion arranca vacío', () => {
    render(
      <FormularioGenerico
        campos={campos}
        modo="edicion"
        valoresIniciales={{ nombre: 'Beto', turno: 'manana' }}
        onEnviar={vi.fn()}
        enviando={false}
      />,
    );

    expect(screen.getByLabelText('Nombre')).toHaveValue('Beto');
    expect(screen.getByLabelText('Turno')).toHaveValue('manana');
  });

  it('modo creacion sin valoresIniciales arranca con el campo texto vacío', () => {
    render(
      <FormularioGenerico campos={campos} modo="creacion" onEnviar={vi.fn()} enviando={false} />,
    );

    expect(screen.getByLabelText('Nombre')).toHaveValue('');
  });

  it('enviando=true deshabilita el submit sin importar la validez; mensajeError se muestra en role=alert', () => {
    render(
      <FormularioGenerico
        campos={campos}
        modo="creacion"
        valoresIniciales={{ nombre: 'Ana' }}
        onEnviar={vi.fn()}
        enviando={true}
        mensajeError="Ocurrió un error"
      />,
    );

    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('Ocurrió un error');
  });
});
