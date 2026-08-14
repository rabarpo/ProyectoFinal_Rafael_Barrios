import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelConfirmacionApertura } from './PanelConfirmacionApertura';
import type { ResumenProceso } from './PanelConfirmacionApertura';

// [design.md D13/D14; spec: "ocultar_resultados inmutable una vez abierto";
// tasks.md 17.2-17.3] Presentacional puro, espejo literal de
// auth/DialogoVinculacion.tsx: sin efectos propios, no habilita confirmar sin
// el gesto explícito (checkbox), y muestra ocultar_resultados de forma
// prominente antes de que el usuario pueda confirmar la apertura irreversible.
const proceso: ResumenProceso = {
  nombre: 'Elección de comité 2026',
  tipo: 'municipio',
  publico_objetivo: 'estudiantes',
  alcance: 'institucion',
  aulas: 5,
  ocultar_resultados: true,
};

describe('PanelConfirmacionApertura', () => {
  it('no habilita confirmar sin el gesto explícito', () => {
    render(
      <PanelConfirmacionApertura
        proceso={proceso}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
        cargando={false}
      />,
    );

    expect(screen.getByRole('button', { name: /confirmar apertura/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByRole('button', { name: /confirmar apertura/i })).not.toBeDisabled();
  });

  it('muestra ocultar_resultados de forma prominente cuando es true', () => {
    render(
      <PanelConfirmacionApertura
        proceso={proceso}
        onConfirmar={vi.fn()}
        onCancelar={vi.fn()}
        cargando={false}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/ocultos/i);
  });

  it('invoca onConfirmar solo tras marcar el checkbox, nunca antes', () => {
    const onConfirmar = vi.fn();
    render(
      <PanelConfirmacionApertura
        proceso={proceso}
        onConfirmar={onConfirmar}
        onCancelar={vi.fn()}
        cargando={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirmar apertura/i }));
    expect(onConfirmar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar apertura/i }));
    expect(onConfirmar).toHaveBeenCalledTimes(1);
  });

  it('invoca onCancelar al cancelar', () => {
    const onCancelar = vi.fn();
    render(
      <PanelConfirmacionApertura
        proceso={proceso}
        onConfirmar={vi.fn()}
        onCancelar={onCancelar}
        cargando={false}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
  });
});
