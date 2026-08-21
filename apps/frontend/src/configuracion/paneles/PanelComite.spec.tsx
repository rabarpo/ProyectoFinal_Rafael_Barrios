import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PanelComite } from './PanelComite';
import type { UsuarioRespuestaDto } from '../configuracion-api';

// [design.md D9; tasks.md Fase 15] `TablaGenerica` sin pasar `acciones` en absoluto (no
// `acciones={[]}`): la lista de comité es exclusivamente de lectura, sin ningún botón de
// edición/eliminación (esa edición vive en #27, no acá).
const INTEGRANTE: UsuarioRespuestaDto = {
  id: 'u1',
  nombres: 'Juan Pérez',
  dni: '12345678',
  codigo: 'C001',
  correo: 'juan.perez@colegio.edu.pe',
  rol: 'comite',
  estado: 'activo',
  creado_en: '2026-01-01T00:00:00.000Z',
};

describe('PanelComite', () => {
  it('[15.1] renderiza los integrantes vía TablaGenerica con columnas nombres/dni/codigo/correo/estado', () => {
    render(<PanelComite integrantes={[INTEGRANTE]} />);

    expect(screen.getByText(INTEGRANTE.nombres)).toBeInTheDocument();
    expect(screen.getByText(INTEGRANTE.dni)).toBeInTheDocument();
    expect(screen.getByText(INTEGRANTE.codigo)).toBeInTheDocument();
    expect(screen.getByText(INTEGRANTE.correo)).toBeInTheDocument();
    expect(screen.getByText(INTEGRANTE.estado)).toBeInTheDocument();
  });

  it('[15.2] no renderiza ningún control de escritura (Crear/Editar/Cambiar estado/Eliminar)', () => {
    const { container } = render(<PanelComite integrantes={[INTEGRANTE]} />);

    expect(
      Array.from(container.querySelectorAll('*')).some((nodo) =>
        /crear|editar|cambiar estado|eliminar/i.test(nodo.textContent ?? ''),
      ),
    ).toBe(false);
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('[15.3] lista vacía renderiza un mensaje legible, sin error', () => {
    render(<PanelComite integrantes={[]} />);

    expect(screen.getByText(/no hay integrantes del comité registrados/i)).toBeInTheDocument();
  });
});
