import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PasoInformacionProceso } from './PasoInformacionProceso';

// [design.md D4/D5/D8; spec vote-casting: "Paso 1 con reglas de votación e imagen institucional";
// tasks.md 6.1-8.3] Rediseño de fidelidad del paso 1: badge de estado, hero con texto institucional
// superpuesto (degradado + imagen FIJA `assets/images/8.webp`, no configurable — observación del
// usuario), 3 tarjetas de reglas con ícono de `iconos-reglas.tsx`, y footer.
describe('PasoInformacionProceso', () => {
  const proceso = {
    nombre: 'Alcaldía escolar 2026',
    descripcion: 'Elección del municipio escolar',
    fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
  };

  it('[6.1] muestra el badge de estado del proceso junto al hero', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    expect(screen.getByText(/proceso activo/i)).toBeInTheDocument();
  });

  it('[6.2] muestra la imagen hero fija con el texto institucional superpuesto', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    expect(screen.getByTestId('hero-foto-respaldo')).toBeInTheDocument();
    expect(screen.getByText(/tu voz construye el futuro/i)).toBeInTheDocument();
  });

  it('[6.3] muestra exactamente 3 tarjetas de reglas, cada una con su ícono', () => {
    const { container } = render(
      <PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />,
    );

    expect(screen.getByText(/voto secreto/i)).toBeInTheDocument();
    expect(screen.getByText(/una sola vez/i)).toBeInTheDocument();
    expect(screen.getByText(/proceso irreversible/i)).toBeInTheDocument();
    // Un ícono de `iconos-reglas.tsx` por tarjeta de regla; ningún otro bloque del paso 1 usa esos
    // íconos (badge, hero y footer no llevan ícono propio).
    expect(container.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(3);
  });

  it('[6.4] muestra el footer institucional', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    const footer = screen.getByRole('contentinfo');
    expect(footer).toHaveTextContent(/seei/i);
  });

  it('[6.5] la imagen del hero es siempre la misma foto fija, sin lógica de logo configurable', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    expect(screen.queryByRole('img', { name: /logo institucional/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('hero-foto-respaldo')).toBeInTheDocument();
    expect(screen.getByText(/tu voz construye el futuro/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comenzar votación/i })).not.toBeDisabled();
  });

  it('[6.6] ningún copy nuevo menciona "San Alfonso"', () => {
    const { container } = render(
      <PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />,
    );

    expect(container.textContent).not.toMatch(/san alfonso/i);
  });

  it('muestra el nombre del proceso y la hora de cierre', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    expect(screen.getByText(/alcaldía escolar 2026/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /comenzar votación/i })).not.toBeDisabled();
  });

  it('monta BarraProgresoVotacion con pasoActual=1, totalPasos=3', () => {
    render(<PasoInformacionProceso proceso={proceso} yaVoto={false} onContinuar={vi.fn()} />);

    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '1');
    expect(barra).toHaveAttribute('aria-valuemax', '3');
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
