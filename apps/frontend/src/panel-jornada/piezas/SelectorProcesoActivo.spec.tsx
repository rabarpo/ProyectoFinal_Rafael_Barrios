import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SelectorProcesoActivo } from './SelectorProcesoActivo';

const PROCESOS = [
  { id: 'p1', nombre: 'Municipio estudiantil 2026' },
  { id: 'p2', nombre: 'Consejo escolar 2026' },
];

// [design.md "Cambios de archivos"; tasks.md 11.4; spec: Panel lista procesos activos] Lista
// procesos recibidos por props (fuente: `GET /procesos?estado=abierto`, resuelta en el
// contenedor), emite el `procesoId` elegido. Presentacional pura, sin fetch propio.
describe('SelectorProcesoActivo', () => {
  it('[11.4] lista los procesos recibidos por props', () => {
    render(<SelectorProcesoActivo procesos={PROCESOS} procesoId={undefined} onSeleccionar={vi.fn()} />);

    expect(screen.getByText('Municipio estudiantil 2026')).toBeInTheDocument();
    expect(screen.getByText('Consejo escolar 2026')).toBeInTheDocument();
  });

  it('[11.4] emite el procesoId elegido', async () => {
    const onSeleccionar = vi.fn();
    render(<SelectorProcesoActivo procesos={PROCESOS} procesoId={undefined} onSeleccionar={onSeleccionar} />);

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'p2' } });

    expect(onSeleccionar).toHaveBeenCalledWith('p2');
  });
});
