import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoConfirmacion } from './PasoConfirmacion';

// [design.md D14, "Navegación"; tasks.md 17.3] Resumen + casilla de consentimiento; el botón pasa
// a "Registrando…" al confirmar (`enviando`). Mismo criterio de gesto explícito que
// `PanelConfirmacionApertura` (#13).
describe('PasoConfirmacion', () => {
  it('[19.1] monta BarraProgresoVotacion con pasoActual=3', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '3');
    expect(barra).toHaveAttribute('aria-valuemax', '3');
  });

  it('[17.3] no habilita confirmar sin el gesto explícito de consentimiento', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('button', { name: /confirmar/i })).not.toBeDisabled();
  });

  it('[17.3] muestra el resumen de la selección', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Voto en blanco" enviando={false} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    expect(screen.getByText(/voto en blanco/i)).toBeInTheDocument();
  });

  it('[17.3] el botón pasa a "Registrando…" mientras enviando=true', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={true} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /registrando/i })).toBeDisabled();
  });

  it('invoca onConfirmar solo tras marcar el consentimiento', () => {
    const onConfirmar = vi.fn();
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={onConfirmar} onVolver={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onConfirmar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('muestra el mensaje de error cuando se provee', () => {
    render(
      <PasoConfirmacion
        resumenSeleccion="Lista A"
        enviando={false}
        mensajeError="No se pudo contactar con el servidor"
        onConfirmar={vi.fn()}
        onVolver={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/no se pudo contactar/i);
  });
});
