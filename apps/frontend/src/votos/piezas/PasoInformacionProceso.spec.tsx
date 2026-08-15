import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoInformacionProceso } from './PasoInformacionProceso';

// [design.md D14, "Navegación"; tasks.md 17.4] Paso 1: nombre/descripción/hora de cierre del
// proceso. Presentacional puro — "Continuar" deshabilitado si el derecho ya fue ejercido (D14
// diferido a PR6 no cubre el mensaje de rechazo dedicado, pero el paso 1 no debe dejar avanzar a
// una boleta inútil).
describe('PasoInformacionProceso', () => {
  const proceso = {
    nombre: 'Alcaldía escolar 2026',
    descripcion: 'Elección del municipio escolar',
    fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
  };

  it('muestra el nombre y la hora de cierre del proceso', () => {
    render(
      <PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />,
    );

    expect(screen.getByText(/alcaldía escolar 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar/i })).not.toBeDisabled();
  });

  it('invoca onContinuar al hacer click', () => {
    const onContinuar = vi.fn();
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={onContinuar} />);

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));
    expect(onContinuar).toHaveBeenCalledTimes(1);
  });

  it('si el derecho ya fue ejercido, deshabilita "Continuar" y avisa', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={true} onContinuar={vi.fn()} />);

    expect(screen.getByRole('button', { name: /continuar/i })).toBeDisabled();
    expect(screen.getByText(/ya votaste/i)).toBeInTheDocument();
  });
});
