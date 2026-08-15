import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoBoleta } from './PasoBoleta';
import type { Seleccion } from './PasoBoleta';

// [design.md D14; spec: "Boleta mobile-first de 3 pasos"; tasks.md 17.1-17.2] Presentacional
// puro: "Continuar" deshabilitado sin selección (incluida la opción de voto en blanco, con borde
// discontinuo); el blanco SOLO se registra por selección explícita, nunca por ausencia de
// selección.
const OPCIONES = [
  { id: 'o1', etiqueta: 'Lista A' },
  { id: 'o2', etiqueta: 'Lista B' },
];

describe('PasoBoleta', () => {
  it('[17.1] "Continuar" deshabilitado sin ninguna selección', () => {
    render(
      <PasoBoleta opciones={OPCIONES} seleccion={undefined} onSeleccionar={vi.fn()} onContinuar={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();
  });

  it('[17.1] seleccionar una opción habilita "Continuar"', () => {
    render(
      <PasoBoleta opciones={OPCIONES} seleccion={undefined} onSeleccionar={vi.fn()} onContinuar={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /lista a/i }));

    expect(screen.getByRole('button', { name: /continuar/i })).not.toBeDisabled();
  });

  it('[17.1] la opción de voto en blanco tiene borde discontinuo (marca visual distintiva)', () => {
    render(
      <PasoBoleta opciones={OPCIONES} seleccion={undefined} onSeleccionar={vi.fn()} onContinuar={vi.fn()} />,
    );

    const blanco = screen.getByRole('radio', { name: /blanco/i });
    expect(blanco.closest('label')).toHaveClass('border-dashed');
  });

  it('[17.2] seleccionar blanco explícitamente lo notifica como blanco, no como ausencia', () => {
    const onSeleccionar = vi.fn();
    render(
      <PasoBoleta opciones={OPCIONES} seleccion={undefined} onSeleccionar={onSeleccionar} onContinuar={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /blanco/i }));

    expect(onSeleccionar).toHaveBeenCalledWith({ tipo: 'blanco' } satisfies Seleccion);
  });

  it('[17.2] seleccionar una opción concreta la notifica con su id, distinta del blanco', () => {
    const onSeleccionar = vi.fn();
    render(
      <PasoBoleta opciones={OPCIONES} seleccion={undefined} onSeleccionar={onSeleccionar} onContinuar={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /lista b/i }));

    expect(onSeleccionar).toHaveBeenCalledWith({ tipo: 'opcion', id: 'o2' } satisfies Seleccion);
  });

  it('invoca onContinuar solo al hacer click con una selección ya hecha', () => {
    const onContinuar = vi.fn();
    render(
      <PasoBoleta
        opciones={OPCIONES}
        seleccion={{ tipo: 'blanco' }}
        onSeleccionar={vi.fn()}
        onContinuar={onContinuar}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(onContinuar).toHaveBeenCalledTimes(1);
  });
});
