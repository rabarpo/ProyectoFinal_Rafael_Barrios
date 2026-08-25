import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TarjetaCandidato } from './TarjetaCandidato';
import type { PapeletaOpcionDto } from '../votos-api';

// fidelidad-visual-boleta-votacion, PR4 (design.md D1/D8, tasks.md 19.1-19.4; spec: vote-casting
// "Proceso representante_aula/padres renderiza tarjetas de Candidato").
const OPCION: PapeletaOpcionDto = {
  id: 'c1',
  etiqueta: 'Juan Torres',
  cargo: 'Representante de aula',
  foto_presente: true,
};

describe('TarjetaCandidato', () => {
  it('[19.1] renderiza foto, cinta con cargo y nombres, sin botón de propuesta', () => {
    render(
      <TarjetaCandidato
        opcion={OPCION}
        seleccionada={false}
        onSeleccionar={vi.fn()}
        urlFoto="http://api/foto"
      />,
    );

    expect(screen.getByRole('img', { name: 'Juan Torres' })).toHaveAttribute('src', 'http://api/foto');
    expect(screen.getByText('Juan Torres')).toBeInTheDocument();
    expect(screen.getByText('Representante de aula')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ver propuesta completa/i })).not.toBeInTheDocument();
  });

  it('[19.2] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>', () => {
    render(<TarjetaCandidato opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });

  it('[19.3] nombre accesible del radio es "Seleccionar Candidato: {etiqueta}" y dispara onSeleccionar', () => {
    const onSeleccionar = vi.fn();
    render(<TarjetaCandidato opcion={OPCION} seleccionada={false} onSeleccionar={onSeleccionar} />);
    const radio = screen.getByRole('radio', { name: 'Seleccionar Candidato: Juan Torres' });
    fireEvent.click(radio);
    expect(onSeleccionar).toHaveBeenCalledTimes(1);
  });

  it('[19.1] al seleccionar, el borde se engruesa y el check aparece junto a la cinta', () => {
    const { container, rerender } = render(
      <TarjetaCandidato opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />,
    );
    expect(container.querySelector('.border-2.border-primary')).toBeNull();

    rerender(<TarjetaCandidato opcion={OPCION} seleccionada onSeleccionar={vi.fn()} />);
    expect(container.querySelector('.border-2.border-primary')).not.toBeNull();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });
});
