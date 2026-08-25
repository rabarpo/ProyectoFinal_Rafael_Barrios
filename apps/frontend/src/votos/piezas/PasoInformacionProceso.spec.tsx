import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoInformacionProceso } from './PasoInformacionProceso';

// [design.md D5/D14; spec vote-casting: "Paso 1 con reglas de votación e imagen institucional";
// tasks.md 16.1-16.4] Rediseño del paso 1: barra de progreso compartida (pasoActual=1), imagen
// institucional de `GET /configuracion/logo` (sin campo nuevo en `ProcesoElectoral`, D4 — el
// votante llama `urlLogo()` sin versión) ocultada vía `onError` si no hay logo persistido (404), y
// 3 tarjetas de reglas fijas (secreto, única vez, irreversible).
describe('PasoInformacionProceso', () => {
  const proceso = {
    nombre: 'Alcaldía escolar 2026',
    descripcion: 'Elección del municipio escolar',
    fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
  };

  it('[16.1] muestra exactamente 3 tarjetas de reglas y el logo institucional', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    expect(screen.getByText(/secreto/i)).toBeInTheDocument();
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument();
    expect(screen.getByText(/irreversible/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /logo institucional/i })).toBeInTheDocument();
  });

  it('[16.2] sin logo institucional configurado (404), el paso se renderiza sin la imagen y sin romper', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    const logo = screen.getByRole('img', { name: /logo institucional/i });
    fireEvent.error(logo);

    expect(screen.queryByRole('img', { name: /logo institucional/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comenzar votación/i })).not.toBeDisabled();
  });

  it('[16.3] monta BarraProgresoVotacion con pasoActual=1, totalPasos=3', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '1');
    expect(barra).toHaveAttribute('aria-valuemax', '3');
  });

  it('muestra el nombre del proceso y la hora de cierre', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    expect(screen.getByText(/alcaldía escolar 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comenzar votación/i })).not.toBeDisabled();
  });

  it('invoca onContinuar al hacer click en "Comenzar Votación"', () => {
    const onContinuar = vi.fn();
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={onContinuar} />);

    fireEvent.click(screen.getByRole('button', { name: /comenzar votación/i }));
    expect(onContinuar).toHaveBeenCalledTimes(1);
  });

  it('si el derecho ya fue ejercido, deshabilita el botón y avisa', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={true} onContinuar={vi.fn()} />);

    expect(screen.getByRole('button', { name: /comenzar votación/i })).toBeDisabled();
    expect(screen.getByText(/ya votaste/i)).toBeInTheDocument();
  });
});
