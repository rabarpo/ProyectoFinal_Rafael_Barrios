import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoConfirmacion } from './PasoConfirmacion';

// [design.md D14, "Navegación"; tasks.md 17.3] Resumen + casilla de consentimiento; el botón pasa
// a "Registrando…" al confirmar (`enviando`). Mismo criterio de gesto explícito que
// `PanelConfirmacionApertura` (#13).
//
// confirmacion-voto-como-modal: `PasoConfirmacion` deja de ser una pantalla de navegación (ya no
// monta `BarraProgresoVotacion`) y pasa a ser un diálogo modal con overlay/backdrop —
// `role="dialog"`/`aria-modal="true"`, cierre con Escape y click en el backdrop, foco al montar.
describe('PasoConfirmacion', () => {
  it('ya no monta BarraProgresoVotacion (deja de ser un paso de navegación)', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('se renderiza como diálogo modal con overlay, aria-modal y aria-labelledby', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    const idLabel = dialogo.getAttribute('aria-labelledby');
    expect(idLabel).toBeTruthy();
    expect(document.getElementById(idLabel as string)).toHaveTextContent(/confirmá tu voto/i);
  });

  it('el foco se mueve al panel del diálogo al montar', () => {
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={vi.fn()} />,
    );

    expect(screen.getByRole('dialog')).toHaveFocus();
  });

  it('la tecla Escape invoca onVolver mientras no está enviando', () => {
    const onVolver = vi.fn();
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={onVolver} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onVolver).toHaveBeenCalledTimes(1);
  });

  it('la tecla Escape NO invoca onVolver mientras enviando=true', () => {
    const onVolver = vi.fn();
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={true} onConfirmar={vi.fn()} onVolver={onVolver} />,
    );

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onVolver).not.toHaveBeenCalled();
  });

  it('click en el backdrop invoca onVolver mientras no está enviando', () => {
    const onVolver = vi.fn();
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={onVolver} />,
    );

    fireEvent.click(screen.getByTestId('paso-confirmacion-backdrop'));

    expect(onVolver).toHaveBeenCalledTimes(1);
  });

  it('click en el backdrop NO invoca onVolver mientras enviando=true', () => {
    const onVolver = vi.fn();
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={true} onConfirmar={vi.fn()} onVolver={onVolver} />,
    );

    fireEvent.click(screen.getByTestId('paso-confirmacion-backdrop'));

    expect(onVolver).not.toHaveBeenCalled();
  });

  it('click DENTRO del panel no propaga ni cierra el modal', () => {
    const onVolver = vi.fn();
    render(
      <PasoConfirmacion resumenSeleccion="Lista A" enviando={false} onConfirmar={vi.fn()} onVolver={onVolver} />,
    );

    fireEvent.click(screen.getByRole('dialog'));

    expect(onVolver).not.toHaveBeenCalled();
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
