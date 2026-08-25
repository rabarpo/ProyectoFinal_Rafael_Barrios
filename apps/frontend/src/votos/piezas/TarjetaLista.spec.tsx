import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TarjetaLista } from './TarjetaLista';
import type { PapeletaOpcionDto } from '../votos-api';

// rediseno-boleta-votacion, PR3 (design.md D6, tasks.md 14.1-14.2, 14.6-14.7; spec: vote-casting
// "Proceso municipio renderiza tarjetas de Lista").
const OPCION: PapeletaOpcionDto = {
  id: 'l1',
  etiqueta: 'Lista A',
  simbolo: 'Sol',
  lema: 'Unidos por el cambio',
  propuesta: 'Más recreos',
  plan_trabajo_presente: true,
  candidato_id: 'c1',
  candidato_nombres: 'Ana Pérez',
  cargo: 'Presidente',
  foto_presente: true,
};

describe('TarjetaLista', () => {
  it('[14.1] renderiza etiqueta, símbolo, lema, propuesta y foto+nombres+cargo del cabeza de lista', () => {
    render(
      <TarjetaLista
        opcion={OPCION}
        seleccionada={false}
        onSeleccionar={vi.fn()}
        urlFoto="http://api/foto"
      />,
    );

    expect(screen.getByText('Lista A')).toBeInTheDocument();
    expect(screen.getByText('Sol')).toBeInTheDocument();
    expect(screen.getByText('Unidos por el cambio')).toBeInTheDocument();
    expect(screen.getByText('Más recreos')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Presidente')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Ana Pérez' })).toHaveAttribute('src', 'http://api/foto');
  });

  it('[14.1] botón "Ver Propuesta Completa" presente solo si plan_trabajo_presente = true', () => {
    render(<TarjetaLista opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);
    expect(screen.getByRole('button', { name: /ver propuesta completa/i })).toBeInTheDocument();
  });

  it('[14.1] botón "Ver Propuesta Completa" ausente si plan_trabajo_presente = false', () => {
    render(
      <TarjetaLista
        opcion={{ ...OPCION, plan_trabajo_presente: false }}
        seleccionada={false}
        onSeleccionar={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: /ver propuesta completa/i })).not.toBeInTheDocument();
  });

  it('[14.2] click en "Ver Propuesta Completa" invoca onVerPropuesta pero NO onSeleccionar (botón hermano del label)', () => {
    const onSeleccionar = vi.fn();
    const onVerPropuesta = vi.fn();
    render(
      <TarjetaLista
        opcion={OPCION}
        seleccionada={false}
        onSeleccionar={onSeleccionar}
        onVerPropuesta={onVerPropuesta}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ver propuesta completa/i }));

    expect(onVerPropuesta).toHaveBeenCalledTimes(1);
    expect(onSeleccionar).not.toHaveBeenCalled();
    expect(screen.getByRole('radio')).not.toBeChecked();
  });

  it('[14.6] al seleccionar, el borde se engruesa y aparece el check (patrón Candidate Cards)', () => {
    const { container, rerender } = render(
      <TarjetaLista opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />,
    );
    expect(container.querySelector('.border-2.border-primary')).toBeNull();
    expect(screen.queryByText('✓')).not.toBeInTheDocument();

    rerender(<TarjetaLista opcion={OPCION} seleccionada onSeleccionar={vi.fn()} />);
    expect(container.querySelector('.border-2.border-primary')).not.toBeNull();
    expect(screen.getByText('✓')).toBeInTheDocument();
  });

  it('[14.7] contiene un input type="radio" name="eleccion" sr-only dentro de un <label>, preservando getByRole("radio")', () => {
    render(<TarjetaLista opcion={OPCION} seleccionada={false} onSeleccionar={vi.fn()} />);
    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('name', 'eleccion');
    expect(radio).toHaveClass('sr-only');
    expect(radio.closest('label')).not.toBeNull();
  });
});
