import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioCandidato } from './FormularioCandidato';
import type { ListaRespuestaDto } from '../candidatos-api';

// [spec: candidatos-listas-management, "Creación rechazada sin foto"; design.md
// D13, tasks.md 20.4] Presentacional puro: deshabilita el submit sin foto en
// modo creación; en edición la foto es opcional (ActualizarCandidatoDto).
const listas: ListaRespuestaDto[] = [
  {
    id: 'l1',
    proceso_id: 'p1',
    nombre: 'Lista A',
    numero: 1,
    estado: 'activo',
    plan_trabajo_presente: false,
  },
];

describe('FormularioCandidato', () => {
  it('modo creación: el submit queda deshabilitado sin foto adjunta', () => {
    render(<FormularioCandidato modo="creacion" listas={listas} onEnviar={vi.fn()} enviando={false} />);

    fireEvent.change(screen.getByLabelText(/nombres/i), { target: { value: 'Ana' } });

    expect(screen.getByRole('button', { name: /registrar candidato/i })).toBeDisabled();
  });

  it('modo creación: con nombres y foto, el submit envía los datos completos', () => {
    const onEnviar = vi.fn();
    render(<FormularioCandidato modo="creacion" listas={listas} onEnviar={onEnviar} enviando={false} />);

    fireEvent.change(screen.getByLabelText(/nombres/i), { target: { value: 'Ana' } });
    const foto = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/^foto/i), { target: { files: [foto] } });
    fireEvent.click(screen.getByRole('button', { name: /registrar candidato/i }));

    expect(onEnviar).toHaveBeenCalledWith(expect.objectContaining({ nombres: 'Ana', foto }));
  });

  it('modo edición: el submit no exige una foto nueva', () => {
    render(
      <FormularioCandidato
        modo="edicion"
        valoresIniciales={{ nombres: 'Beto' }}
        listas={listas}
        onEnviar={vi.fn()}
        enviando={false}
      />,
    );

    expect(screen.getByRole('button', { name: /guardar cambios/i })).not.toBeDisabled();
  });
});
