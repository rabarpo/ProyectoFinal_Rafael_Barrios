import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TarjetasResumen } from './TarjetasResumen';

const INSTITUCION = { estudiantes: 120, vinculos_apoderado: 200, hora_servidor: '2026-08-23T12:00:00.000Z' };

const RESUMEN = {
  proceso_id: 'p1',
  estado: 'abierto' as const,
  padron_total: 50,
  votos_emitidos: 20,
  correos_fallidos: 1,
  estado_visibilidad: 'visible' as const,
  hora_servidor: '2026-08-23T12:00:00.000Z',
};

// [design.md "Cambios de archivos"; tasks.md 11.1] Presentacional pura: renderiza institución +
// resumen recibidos por props, sin hooks de datos.
describe('TarjetasResumen', () => {
  it('[11.1] renderiza el conteo institucional recibido por props', () => {
    render(<TarjetasResumen institucion={INSTITUCION} />);

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('[11.1] renderiza el resumen del proceso cuando se recibe por props', () => {
    render(<TarjetasResumen institucion={INSTITUCION} resumen={RESUMEN} />);

    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('[11.1] sin resumen, no renderiza datos scoped por proceso', () => {
    render(<TarjetasResumen institucion={INSTITUCION} />);

    expect(screen.queryByTestId('tarjeta-resumen-proceso')).not.toBeInTheDocument();
  });
});
