import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DesgloseSimple } from './DesgloseSimple';

// Interino de PR3 (ver comentario en DesgloseSimple.tsx): lista cruda sin gráficos, reemplazada
// por GraficoDesglose en PR4 (tasks.md 17.7).
describe('DesgloseSimple', () => {
  it('muestra etiqueta, votos y blancos, incluidos ítems de baja', () => {
    render(
      <DesgloseSimple
        desglose={[
          { id: 'c1', etiqueta: 'Candidato A', votos: 5, estado: 'activo' },
          { id: 'c2', etiqueta: 'Candidato B', votos: 0, estado: 'baja' },
        ]}
        blancos={2}
      />,
    );

    expect(screen.getByText('Candidato A')).toBeInTheDocument();
    expect(screen.getByText(/Candidato B \(de baja\)/)).toBeInTheDocument();
    expect(screen.getByText('Blancos')).toBeInTheDocument();
  });
});
