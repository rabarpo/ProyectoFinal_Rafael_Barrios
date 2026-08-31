import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TablaErroresImportacion } from './TablaErroresImportacion';
import type { ErrorFilaDto } from '../importacion-api';

// [design.md D10; tasks.md 4.3-4.4; Threat Matrix] `TablaGenerica` SIN prop `acciones` (sin
// columna de escritura). Cuatro columnas: `fila`, `campo`, `motivo` (traducido desde
// `MOTIVOS_FILA`), `valor_recibido` (renderizado como texto: React escapa por defecto).
// `claveFila = (e) => `${e.fila}-${e.campo}``.
const ERRORES: ErrorFilaDto[] = [
  { fila: 3, campo: 'correo', motivo: 'formato', valor_recibido: 'no-es-correo' },
  { fila: 3, campo: 'documento', motivo: 'campo_duplicado', valor_recibido: '12345678' },
  { fila: 5, campo: 'grado', motivo: 'referencia_inexistente', valor_recibido: '<script>alert(1)</script>' },
];

describe('TablaErroresImportacion', () => {
  it('muestra las cuatro columnas y una fila por error, sin botones de acción', () => {
    render(<TablaErroresImportacion errores={ERRORES} />);

    for (const encabezado of ['Fila', 'Campo', 'Motivo', 'Valor recibido']) {
      expect(screen.getByRole('columnheader', { name: encabezado })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('row')).toHaveLength(ERRORES.length + 1); // + cabecera
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('traduce `motivo` desde el mapa MOTIVOS_FILA', () => {
    render(<TablaErroresImportacion errores={ERRORES} />);

    expect(screen.getByText('Formato inválido')).toBeInTheDocument();
    expect(screen.getByText('Campo duplicado')).toBeInTheDocument();
    expect(screen.getByText('Referencia inexistente')).toBeInTheDocument();
    expect(screen.queryByText('formato')).not.toBeInTheDocument();
  });

  it('renderiza `valor_recibido` con `<script>` como texto plano, nunca como HTML', () => {
    const { container } = render(<TablaErroresImportacion errores={ERRORES} />);

    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});
