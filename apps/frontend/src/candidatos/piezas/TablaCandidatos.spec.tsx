import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TablaCandidatos } from './TablaCandidatos';
import type { CandidatoRespuestaDto, ListaRespuestaDto } from '../candidatos-api';

// [tasks.md 23.1] Presentacional puro, sin fetch propio (design.md D13):
// filas con foto/nombres/cargo/lista/estado, acciones baja/reactivar/borrar
// delegadas al contenedor vía callbacks.
const listas: ListaRespuestaDto[] = [
  { id: 'l1', proceso_id: 'p1', nombre: 'Lista A', numero: 1, estado: 'activo', plan_trabajo_presente: false },
];

function candidato(sobrescritura: Partial<CandidatoRespuestaDto> = {}): CandidatoRespuestaDto {
  return {
    id: 'c1',
    proceso_id: 'p1',
    nombres: 'Ana Pérez',
    cargo: 'Presidente',
    lista_id: 'l1',
    foto_presente: true,
    estado: 'activo',
    ...sobrescritura,
  };
}

describe('TablaCandidatos', () => {
  it('renderiza nombres, cargo, lista y estado de cada candidato', () => {
    render(
      <TablaCandidatos
        candidatos={[candidato()]}
        listas={listas}
        onDarBaja={vi.fn()}
        onReactivar={vi.fn()}
        onBorrar={vi.fn()}
        onEditar={vi.fn()}
      />,
    );

    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Presidente')).toBeInTheDocument();
    expect(screen.getByText('Lista A')).toBeInTheDocument();
    expect(screen.getByText('activo')).toBeInTheDocument();
  });

  it('candidato activo muestra "Dar de baja" e invoca onDarBaja con su id', () => {
    const onDarBaja = vi.fn();
    render(
      <TablaCandidatos
        candidatos={[candidato({ id: 'c2', estado: 'activo' })]}
        listas={listas}
        onDarBaja={onDarBaja}
        onReactivar={vi.fn()}
        onBorrar={vi.fn()}
        onEditar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /dar de baja/i }));

    expect(onDarBaja).toHaveBeenCalledWith('c2');
  });

  it('candidato de baja muestra "Reactivar" en lugar de "Dar de baja"', () => {
    const onReactivar = vi.fn();
    render(
      <TablaCandidatos
        candidatos={[candidato({ id: 'c3', estado: 'baja' })]}
        listas={listas}
        onDarBaja={vi.fn()}
        onReactivar={onReactivar}
        onBorrar={vi.fn()}
        onEditar={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /dar de baja/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /reactivar/i }));

    expect(onReactivar).toHaveBeenCalledWith('c3');
  });

  it('invoca onBorrar con el id al hacer click en "Eliminar"', () => {
    const onBorrar = vi.fn();
    render(
      <TablaCandidatos
        candidatos={[candidato({ id: 'c4' })]}
        listas={listas}
        onDarBaja={vi.fn()}
        onReactivar={vi.fn()}
        onBorrar={onBorrar}
        onEditar={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /eliminar/i }));

    expect(onBorrar).toHaveBeenCalledWith('c4');
  });
});
