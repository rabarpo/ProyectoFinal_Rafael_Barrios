import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PantallaRechazo } from './PantallaRechazo';

// [design.md D14, "Taxonomía de rechazos"; tasks.md 21.1-21.4] Una sola pieza parametrizada con
// las 4 variantes que sí tienen pantalla propia: causa 1 (403 ajeno/inexistente) redirige a "/" sin
// pantalla (D9), y la causa 5 (aula que no corresponde) queda plegada en la causa 2 (D8) — ninguna
// de las dos agrega una quinta variante acá.
describe('PantallaRechazo', () => {
  it('[21.1] variante sin-padron renderiza título/explicación y NO ofrece reintento automático', () => {
    render(<PantallaRechazo variante="sin-padron" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/no estás en el padrón/i);
    expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  });

  it('[21.2] variante cerrada muestra la hora exacta de cierre recibida del servidor', () => {
    render(<PantallaRechazo variante="cerrada" horaCierre="2026-09-05T18:00:00.000Z" />);

    const pantalla = screen.getByRole('alert');
    expect(pantalla).toHaveTextContent(/votación cerrada/i);
    expect(pantalla).toHaveTextContent(new Date('2026-09-05T18:00:00.000Z').toLocaleString());
  });

  it('[21.3] variante ya-votaste muestra fecha/hora del registro original y el comprobante, nunca un error genérico', () => {
    render(
      <PantallaRechazo
        variante="ya-votaste"
        comprobante={{ codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR', hora_servidor: '2026-09-05T17:00:00.000Z' }}
      />,
    );

    const pantalla = screen.getByRole('alert');
    expect(pantalla).toHaveTextContent(/ya emitiste tu voto/i);
    expect(pantalla).toHaveTextContent('K7QM-3XZ9-8HTB-P4WR');
    expect(pantalla).toHaveTextContent(new Date('2026-09-05T17:00:00.000Z').toLocaleString());
    expect(pantalla).not.toHaveTextContent(/error/i);
  });

  it('[21.4] variante sin-conexion es un estado del cliente, sin código de error de servidor, con acción de reintento', () => {
    const onReintentar = vi.fn();
    render(<PantallaRechazo variante="sin-conexion" onReintentar={onReintentar} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/sin conexión/i);
    screen.getByRole('button', { name: /reintentar/i }).click();
    expect(onReintentar).toHaveBeenCalledTimes(1);
  });
});
