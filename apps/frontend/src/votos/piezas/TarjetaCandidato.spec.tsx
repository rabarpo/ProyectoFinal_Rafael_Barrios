import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TarjetaCandidato } from './TarjetaCandidato';
import type { PapeletaOpcionDto } from '../votos-api';

// rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.3; spec: vote-casting "Proceso
// representante_aula/padres renderiza tarjetas de Candidato").
const OPCION: PapeletaOpcionDto = {
  id: 'c1',
  etiqueta: 'Juan Torres',
  cargo: 'Representante de aula',
  foto_presente: true,
};

describe('TarjetaCandidato', () => {
  it('[14.3] renderiza foto, nombres y cargo, sin botón de propuesta', () => {
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

  it('[14.7] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>', () => {
    render(<TarjetaCandidato opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });
});
