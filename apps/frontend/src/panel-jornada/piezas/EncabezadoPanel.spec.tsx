import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EncabezadoPanel } from './EncabezadoPanel';

const INSTITUCION = { estudiantes: 120, vinculos_apoderado: 200, hora_servidor: '2026-08-23T12:00:00.000Z' };

// dashboard-panel-jornada (rediseño visual, captura de referencia). Presentacional puro: breadcrumb
// + título + subtítulo con el nombre REAL del proceso seleccionado (nunca un nombre de institución
// hardcodeado — el nombre viene de `procesos`, ya resuelto por `PanelJornadaPage` desde
// `GET /procesos?estado=abierto`). Mantiene visible el conteo institucional que ya exponía
// `TarjetasResumen` (estudiantes/vínculos apoderado-estudiante), sin perder esa funcionalidad.
describe('EncabezadoPanel', () => {
  it('muestra el nombre del proceso seleccionado como subtítulo', () => {
    render(<EncabezadoPanel nombreProceso="Municipio estudiantil 2026" institucion={INSTITUCION} />);

    expect(screen.getByText('Municipio estudiantil 2026')).toBeInTheDocument();
  });

  it('sin proceso seleccionado, no inventa un nombre', () => {
    render(<EncabezadoPanel nombreProceso={undefined} institucion={INSTITUCION} />);

    expect(screen.queryByText('Municipio estudiantil 2026')).not.toBeInTheDocument();
  });

  it('mantiene visible el conteo institucional (estudiantes / vínculos apoderado-estudiante)', () => {
    render(<EncabezadoPanel nombreProceso={undefined} institucion={INSTITUCION} />);

    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });
});
