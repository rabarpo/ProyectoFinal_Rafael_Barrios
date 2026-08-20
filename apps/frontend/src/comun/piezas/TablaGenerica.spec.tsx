import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TablaGenerica } from './TablaGenerica';
import type { ColumnaTabla, AccionFila } from './TablaGenerica';

// [design.md D3, tasks.md 6.1-6.7] Pieza genérica reutilizable: tabla real
// (<table>) sin orden/paginación/selección — no hay consumidor que las
// necesite. `acciones` es la mecánica que sostiene D8 (comité ⇒ [] ⇒ ninguna
// columna de escritura, en vez de botones `disabled`).
interface FilaPrueba {
  id: string;
  nombre: string;
  activo: boolean;
}

const filas: FilaPrueba[] = [
  { id: '1', nombre: 'Ana', activo: false },
  { id: '2', nombre: 'Beto', activo: true },
];

const columnas: ColumnaTabla<FilaPrueba>[] = [
  { clave: 'nombre', encabezado: 'Nombre', celda: (fila) => fila.nombre },
  { clave: 'estado', encabezado: 'Estado', celda: (fila) => (fila.activo ? 'Activo' : 'Inactivo') },
];

describe('TablaGenerica', () => {
  it('renderiza un <th> por columna, en el orden dado', () => {
    render(
      <TablaGenerica
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Sin datos"
      />,
    );

    const encabezados = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(encabezados).toEqual(['Nombre', 'Estado']);
  });

  it('con 0 filas, muestra mensajeVacio y no renderiza filas en el <tbody>', () => {
    render(
      <TablaGenerica
        columnas={columnas}
        filas={[]}
        claveFila={(fila) => fila.id}
        mensajeVacio="Todavía no hay registros"
      />,
    );

    expect(screen.getByText('Todavía no hay registros')).toBeInTheDocument();
    expect(screen.queryAllByRole('row')).toHaveLength(0);
  });

  it('cada fila usa columna.celda(fila) para su contenido', () => {
    render(
      <TablaGenerica
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Sin datos"
      />,
    );

    const [, ...filasRenderizadas] = screen.getAllByRole('row');
    expect(within(filasRenderizadas[0]).getByText('Ana')).toBeInTheDocument();
    expect(within(filasRenderizadas[0]).getByText('Inactivo')).toBeInTheDocument();
    expect(within(filasRenderizadas[1]).getByText('Beto')).toBeInTheDocument();
    expect(within(filasRenderizadas[1]).getByText('Activo')).toBeInTheDocument();
  });

  it('sin acciones (omitido o []), no renderiza columna de acciones', () => {
    render(
      <TablaGenerica
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Sin datos"
        acciones={[]}
      />,
    );

    expect(screen.queryByRole('columnheader', { name: /acciones/i })).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('con acciones, "visible" filtra por fila y onEjecutar recibe la fila clickeada', () => {
    const onEjecutar = vi.fn();
    const acciones: AccionFila<FilaPrueba>[] = [
      { id: 'activar', etiqueta: 'Activar', onEjecutar, visible: (fila) => !fila.activo },
    ];

    render(
      <TablaGenerica
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Sin datos"
        acciones={acciones}
      />,
    );

    const botones = screen.getAllByRole('button', { name: 'Activar' });
    expect(botones).toHaveLength(1);

    fireEvent.click(botones[0]);
    expect(onEjecutar).toHaveBeenCalledWith(filas[0]);
  });

  it('tono "peligro" usa el token text-error; "normal"/omitido no', () => {
    const acciones: AccionFila<FilaPrueba>[] = [
      { id: 'editar', etiqueta: 'Editar', onEjecutar: vi.fn() },
      { id: 'eliminar', etiqueta: 'Eliminar', onEjecutar: vi.fn(), tono: 'peligro' },
    ];

    render(
      <TablaGenerica
        columnas={columnas}
        filas={filas}
        claveFila={(fila) => fila.id}
        mensajeVacio="Sin datos"
        acciones={acciones}
      />,
    );

    const editar = screen.getAllByRole('button', { name: 'Editar' })[0];
    const eliminar = screen.getAllByRole('button', { name: 'Eliminar' })[0];
    expect(editar.className).not.toMatch(/text-error/);
    expect(eliminar.className).toMatch(/text-error/);
  });
});
