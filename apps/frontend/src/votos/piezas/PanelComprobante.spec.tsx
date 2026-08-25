import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelComprobante } from './PanelComprobante';

// [design.md D14, "Contratos HTTP"; tasks.md 21.6; proposal.md "Los 3 pasos"] `eleccion_resumen`
// SÍ viaja al votante (es su propio voto, [ADR-0006] §2) — distinto del payload de auditoría
// (D11), que nunca lo lleva. #15/PR4 (design.md D12) reemplaza la casilla de consentimiento de
// copia por correo por una línea informativa (ver test [14.4] abajo).
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

  // [design.md D12; tasks.md 14.4-14.5] #15/PR4: la casilla "Quiero recibir una copia..." —que
  // nunca tuvo efecto en el outbox real de #14— se reemplaza por una línea informativa: con #15
  // el envío es incondicional (D3), así que ofrecer una elección que el sistema ya no respeta
  // sería engañoso.
  it('[14.4] ya no ofrece la casilla de "copia por correo"; muestra la línea informativa de copia ya enviada', () => {
    render(<PanelComprobante comprobante={comprobante} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/correo/i);
  });

  // [design.md D6; spec comprobante-autenticado: "Comprobante recién emitido muestra ícono de
  // éxito"; tasks.md 19.2] Sin `yaRegistrado`: ícono/badge de éxito + mensaje, sin el badge "Ya has
  // votado".
  it('[19.2] comprobante recién emitido (sin yaRegistrado) muestra ícono de éxito, sin badge "Ya has votado"', () => {
    render(<PanelComprobante comprobante={comprobante} />);

    expect(screen.getByText(/voto emitido correctamente/i)).toBeInTheDocument();
    expect(screen.queryByText(/ya has votado/i)).not.toBeInTheDocument();
  });

  // [spec comprobante-autenticado: "Reintento tras voto ya emitido muestra el badge 'Ya has
  // votado'"; tasks.md 19.3]
  it('[19.3] con yaRegistrado muestra el badge "Ya has votado"', () => {
    render(<PanelComprobante comprobante={comprobante} yaRegistrado />);

    expect(screen.getByText(/ya has votado/i)).toBeInTheDocument();
  });

  // [spec comprobante-autenticado: "El comprobante nunca muestra periodo lectivo ni estado de
  // sincronización"; tasks.md 19.4]
  it.each([false, true])('[19.4] con yaRegistrado=%s no muestra periodo lectivo ni estado de sincronización', (yaRegistrado) => {
    render(<PanelComprobante comprobante={comprobante} yaRegistrado={yaRegistrado} />);

    expect(screen.queryByText(/periodo lectivo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/estado de sincronización/i)).not.toBeInTheDocument();
  });

  // [design.md D5, "PanelComprobante ... no la barra de progreso"; tasks.md 19.5]
  it('[19.5] no monta BarraProgresoVotacion (post-emisión, fuera de los 3 pasos)', () => {
    render(<PanelComprobante comprobante={comprobante} />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });
});
