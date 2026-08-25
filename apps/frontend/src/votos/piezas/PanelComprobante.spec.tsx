import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// [Phase 25; design.md D7] `onVolverAlInicio`/`onCerrarSesion` son props obligatorias en todos
// los tests que no ejercitan su comportamiento directamente.
function noop() {}

describe('PanelComprobante', () => {
  it('[21.6] muestra codigo_comprobante, hora_servidor y eleccion_resumen', () => {
    render(<PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />);

    expect(screen.getByText('K7QM-3XZ9-8HTB-P4WR')).toBeInTheDocument();
    expect(screen.getByText(new Date('2026-09-05T17:59:00.000Z').toLocaleString())).toBeInTheDocument();
    expect(screen.getByText('Lista A')).toBeInTheDocument();
  });

  // [design.md D12; tasks.md 14.4-14.5] #15/PR4: la casilla "Quiero recibir una copia..." —que
  // nunca tuvo efecto en el outbox real de #14— se reemplaza por una línea informativa: con #15
  // el envío es incondicional (D3), así que ofrecer una elección que el sistema ya no respeta
  // sería engañoso.
  it('[14.4] ya no ofrece la casilla de "copia por correo"; muestra la línea informativa de copia ya enviada', () => {
    render(<PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/correo/i);
  });

  // [design.md D6; spec comprobante-autenticado: "Comprobante recién emitido muestra ícono de
  // éxito"; tasks.md 19.2] Sin `yaRegistrado`: ícono/badge de éxito + mensaje, sin el badge "Ya has
  // votado".
  it('[19.2] comprobante recién emitido (sin yaRegistrado) muestra ícono de éxito, sin badge "Ya has votado"', () => {
    render(<PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />);

    expect(screen.getByText(/voto emitido correctamente/i)).toBeInTheDocument();
    expect(screen.queryByText(/ya has votado/i)).not.toBeInTheDocument();
  });

  // [spec comprobante-autenticado: "Reintento tras voto ya emitido muestra el badge 'Ya has
  // votado'"; tasks.md 19.3]
  it('[19.3] con yaRegistrado muestra el badge "Ya has votado"', () => {
    render(<PanelComprobante comprobante={comprobante} yaRegistrado onVolverAlInicio={noop} onCerrarSesion={noop} />);

    expect(screen.getByText(/ya has votado/i)).toBeInTheDocument();
  });

  // [design.md D5, "PanelComprobante ... no la barra de progreso"; tasks.md 19.5]
  it('[19.5] no monta BarraProgresoVotacion (post-emisión, fuera de los 3 pasos)', () => {
    render(<PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />);

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  // [Phase 23; design.md D2; spec comprobante-autenticado: "Período Lectivo" se muestra cuando el
  // DTO lo trae] Con `periodo_lectivo` en el DTO, se muestra la fila con ese valor sin afectar el
  // resto del comprobante.
  it('[23.1] con periodo_lectivo="2026" muestra la fila "Período Lectivo" con ese valor', () => {
    render(
      <PanelComprobante
        comprobante={{ ...comprobante, periodo_lectivo: '2026' }}
        onVolverAlInicio={noop}
        onCerrarSesion={noop}
      />,
    );

    expect(screen.getByText(/período lectivo/i)).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(screen.getByText('K7QM-3XZ9-8HTB-P4WR')).toBeInTheDocument();
    expect(screen.getByText('Lista A')).toBeInTheDocument();
  });

  // [Phase 23; spec comprobante-autenticado: "Sin periodo_lectivo, el comprobante no rompe"]
  it('[23.2] sin periodo_lectivo (undefined) no renderiza la fila y el resto se muestra completo', () => {
    render(<PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />);

    expect(screen.queryByText(/período lectivo/i)).not.toBeInTheDocument();
    expect(screen.getByText('K7QM-3XZ9-8HTB-P4WR')).toBeInTheDocument();
    expect(screen.getByText('Lista A')).toBeInTheDocument();
  });

  // [Phase 24; design.md D3; spec comprobante-autenticado: "Estado del Sistema: Sincronizado"
  // siempre estático] Se muestra igual en cualquier estado, sin condicionarse a ningún dato.
  it.each([
    { yaRegistrado: undefined, periodoLectivo: undefined },
    { yaRegistrado: undefined, periodoLectivo: '2026' },
    { yaRegistrado: true, periodoLectivo: undefined },
    { yaRegistrado: true, periodoLectivo: '2026' },
  ])('[24.1] "Estado del Sistema: Sincronizado" se muestra igual (yaRegistrado=$yaRegistrado, periodo_lectivo=$periodoLectivo)', ({ yaRegistrado, periodoLectivo }) => {
    render(
      <PanelComprobante
        comprobante={{ ...comprobante, periodo_lectivo: periodoLectivo }}
        yaRegistrado={yaRegistrado}
        onVolverAlInicio={noop}
        onCerrarSesion={noop}
      />,
    );

    expect(screen.getByText(/estado del sistema/i)).toBeInTheDocument();
    expect(screen.getByText(/sincronizado/i)).toBeInTheDocument();
  });

  // [Phase 24; design.md D3, "el punto de color va aria-hidden"]
  it('[24.2] el punto de color va aria-hidden="true"', () => {
    const { container } = render(
      <PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />,
    );

    const punto = container.querySelector('[aria-hidden="true"].bg-tertiary-fixed-dim');
    expect(punto).not.toBeNull();
  });

  // [Phase 25; spec comprobante-autenticado: "Cerrar Sesión" disponible en el camino post-voto]
  it('[25.1] el botón "Cerrar Sesión" aparece junto a "Volver al Inicio" e invoca onCerrarSesion al hacer click', () => {
    const onCerrarSesion = vi.fn();
    render(
      <PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={onCerrarSesion} />,
    );

    expect(screen.getByRole('button', { name: /volver al inicio/i })).toBeInTheDocument();
    const botonCerrarSesion = screen.getByRole('button', { name: /cerrar sesión/i });
    expect(botonCerrarSesion).toBeInTheDocument();

    fireEvent.click(botonCerrarSesion);
    expect(onCerrarSesion).toHaveBeenCalledTimes(1);
  });

  // [Phase 25; design.md D7, "PanelComprobante sigue siendo presentacional puro"]
  it('[25.1b] "Volver al Inicio" invoca onVolverAlInicio al hacer click', () => {
    const onVolverAlInicio = vi.fn();
    render(
      <PanelComprobante comprobante={comprobante} onVolverAlInicio={onVolverAlInicio} onCerrarSesion={noop} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /volver al inicio/i }));
    expect(onVolverAlInicio).toHaveBeenCalledTimes(1);
  });

  // [Phase 25; design.md D7, "no llama useSesion()/navegar() internamente"] El componente sigue
  // siendo presentacional puro: no requiere ningún provider de sesión/enrutador para renderizar,
  // solo las props obligatorias.
  it('[25.2] no requiere ningún provider de sesión/enrutador — solo las props', () => {
    expect(() =>
      render(<PanelComprobante comprobante={comprobante} onVolverAlInicio={noop} onCerrarSesion={noop} />),
    ).not.toThrow();
  });

  // [Phase 25; spec comprobante-autenticado: "Cerrar Sesión" disponible en la relectura
  // autenticada, sin romper yaRegistrado"]
  it('[25.3] el badge yaRegistrado existente no se rompe con las props nuevas', () => {
    render(
      <PanelComprobante
        comprobante={comprobante}
        yaRegistrado
        onVolverAlInicio={noop}
        onCerrarSesion={noop}
      />,
    );

    expect(screen.getByText(/ya has votado/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cerrar sesión/i })).toBeInTheDocument();
  });
});
