import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelComprobante } from './PanelComprobante';

// [design.md D14, "Contratos HTTP"; tasks.md 21.6; proposal.md "Los 3 pasos"] `eleccion_resumen`
// SÍ viaja al votante (es su propio voto, [ADR-0006] §2) — distinto del payload de auditoría
// (D11), que nunca lo lleva. El consentimiento de "copia por correo" es un gesto explícito del
// cliente (proposal.md paso 3), sin efecto en #14 (el outbox de correo real es #15).
const comprobante = {
  codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
  hora_servidor: '2026-09-05T17:59:00.000Z',
  eleccion_resumen: 'Lista A',
};

describe('PanelComprobante', () => {
  it('[21.6] muestra codigo_comprobante, hora_servidor y eleccion_resumen', () => {
    render(<PanelComprobante comprobante={comprobante} />);

    expect(screen.getByText('K7QM-3XZ9-8HTB-P4WR')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-09-05T17:59:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Lista A')).toBeInTheDocument();
  });

  it('marca la casilla de "copia por correo" solo por selección explícita del votante', () => {
    render(<PanelComprobante comprobante={comprobante} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /copia.*correo/i }));

    expect(screen.getByRole('status')).toHaveTextContent(/correo/i);
  });
});
