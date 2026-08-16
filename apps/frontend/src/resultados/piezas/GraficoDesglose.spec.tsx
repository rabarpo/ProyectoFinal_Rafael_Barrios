import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GraficoDesglose } from './GraficoDesglose';

// resultados-en-vivo (#16, PR4; design.md D12, tasks.md 17.1-17.5). Reemplaza a `DesgloseSimple`
// (interino de PR3). Las aserciones van sobre la tabla espejo, no sobre el SVG de `recharts`:
// bajo jsdom `ResponsiveContainer` mide 0×0 y no dibuja (gotcha documentado en design.md,
// "Estrategia de pruebas"). El tipo de gráfico se verifica por el `data-testid` del contenedor
// propio del componente, no por nodos internos de `recharts`.
const desgloseOrdenado = [
  { id: 'c1', etiqueta: 'Lista A', votos: 5, estado: 'activo' as const },
  { id: 'c2', etiqueta: 'Lista B', votos: 3, estado: 'activo' as const },
  { id: 'c3', etiqueta: 'Lista C', votos: 0, estado: 'baja' as const },
];

describe('GraficoDesglose', () => {
  it('[17.1] dimension "opcion" monta el gráfico de pastel', () => {
    render(<GraficoDesglose dimension="opcion" desglose={desgloseOrdenado} blancos={2} />);

    expect(screen.getByTestId('grafico-pastel')).toBeInTheDocument();
    expect(screen.queryByTestId('grafico-barras')).not.toBeInTheDocument();
  });

  it('[17.2] dimension "lista" y "candidato" montan el gráfico de barras horizontales', () => {
    const { rerender } = render(
      <GraficoDesglose dimension="lista" desglose={desgloseOrdenado} blancos={2} />,
    );
    expect(screen.getByTestId('grafico-barras')).toBeInTheDocument();
    expect(screen.queryByTestId('grafico-pastel')).not.toBeInTheDocument();

    rerender(<GraficoDesglose dimension="candidato" desglose={desgloseOrdenado} blancos={2} />);
    expect(screen.getByTestId('grafico-barras')).toBeInTheDocument();
    expect(screen.queryByTestId('grafico-pastel')).not.toBeInTheDocument();
  });

  it('[17.3] "blancos" aparece como categoría propia, nunca mezclada con el desglose', () => {
    render(<GraficoDesglose dimension="lista" desglose={desgloseOrdenado} blancos={2} />);

    const filaBlancos = screen.getByText('Blancos').closest('tr');
    expect(filaBlancos).not.toBeNull();
    expect(filaBlancos).toHaveTextContent('2');

    // No es una fila más del desglose recibido: las filas de desglose son exactamente 3.
    const filas = screen.getAllByRole('row');
    // encabezado + 3 filas de desglose + 1 fila de blancos
    expect(filas).toHaveLength(1 + desgloseOrdenado.length + 1);
  });

  it('[17.4] la tabla espejo contiene etiquetas y números exactos, incluidos 0 votos y "baja"', () => {
    render(<GraficoDesglose dimension="lista" desglose={desgloseOrdenado} blancos={2} />);

    expect(screen.getByText('Lista A')).toBeInTheDocument();
    expect(screen.getByText('Lista B')).toBeInTheDocument();
    expect(screen.getByText(/Lista C \(de baja\)/)).toBeInTheDocument();

    const filaC = screen.getByText(/Lista C \(de baja\)/).closest('tr');
    expect(filaC).toHaveTextContent('0');
  });

  it('[17.5] el orden de las filas respeta el orden recibido del servidor, sin reordenar', () => {
    render(<GraficoDesglose dimension="lista" desglose={desgloseOrdenado} blancos={2} />);

    const filas = screen.getAllByRole('row').slice(1, 1 + desgloseOrdenado.length);
    const etiquetas = filas.map((fila) => fila.textContent);
    expect(etiquetas[0]).toContain('Lista A');
    expect(etiquetas[1]).toContain('Lista B');
    expect(etiquetas[2]).toContain('Lista C');
  });
});
