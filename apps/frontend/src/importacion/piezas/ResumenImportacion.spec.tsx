import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResumenImportacion } from './ResumenImportacion';
import type { ResultadoImportacionDto } from '../importacion-api';

// [design.md D8; tasks.md 3.3-3.4] Presentacional puro: los cuatro contadores del
// `ResultadoImportacionDto` (`filas_totales`/`filas_creadas`/`filas_existentes`/`filas_invalidas`).
// Sin fetch, sin `useSesion`, sin estado propio.
function resultado(overrides: Partial<ResultadoImportacionDto> = {}): ResultadoImportacionDto {
  return {
    importacion_id: 'imp-1',
    filas_totales: 0,
    filas_creadas: 0,
    filas_existentes: 0,
    filas_invalidas: 0,
    errores: [],
    ...overrides,
  };
}

describe('ResumenImportacion', () => {
  it('muestra los cuatro contadores con sus valores', () => {
    render(
      <ResumenImportacion
        resultado={resultado({
          filas_totales: 40,
          filas_creadas: 25,
          filas_existentes: 12,
          filas_invalidas: 3,
        })}
      />,
    );

    expect(screen.getByText('Filas totales').parentElement).toHaveTextContent('40');
    expect(screen.getByText('Filas creadas').parentElement).toHaveTextContent('25');
    expect(screen.getByText('Filas existentes').parentElement).toHaveTextContent('12');
    expect(screen.getByText('Filas inválidas').parentElement).toHaveTextContent('3');
  });

  it('refleja un conjunto distinto de valores (no hardcodea)', () => {
    render(
      <ResumenImportacion
        resultado={resultado({
          filas_totales: 7,
          filas_creadas: 7,
          filas_existentes: 0,
          filas_invalidas: 0,
        })}
      />,
    );

    expect(screen.getByText('Filas totales').parentElement).toHaveTextContent('7');
    expect(screen.getByText('Filas creadas').parentElement).toHaveTextContent('7');
    expect(screen.getByText('Filas inválidas').parentElement).toHaveTextContent('0');
  });
});
