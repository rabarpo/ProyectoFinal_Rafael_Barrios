import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BannerInstrucciones } from './BannerInstrucciones';

// fidelidad-visual-boleta-votacion, PR3 (design.md D6, tasks.md 11.1-11.2). Caja estática montada
// por PasoBoleta entre el título y el radiogroup — sin props, contenido idéntico para los 3 tipos
// de proceso.
describe('BannerInstrucciones', () => {
  it('[11.1] muestra título "Instrucciones de Votación" y un párrafo de reglas, sin role de live region', () => {
    render(<BannerInstrucciones />);

    expect(screen.getByText('Instrucciones de Votación')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('[11.1] el ícono de información es decorativo (aria-hidden)', () => {
    const { container } = render(<BannerInstrucciones />);

    const icono = container.querySelector('svg');
    expect(icono).toHaveAttribute('aria-hidden', 'true');
  });
});
