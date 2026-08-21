import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FormularioCandidato } from './FormularioCandidato';
import type { ListaRespuestaDto } from '../candidatos-api';
import * as academicoApi from '../../academico/academico-api';
import type { AulaRespuestaDto, GradoRespuestaDto, SeccionRespuestaDto } from '../../academico/academico-api';

// [spec: candidatos-listas-management, "Creación rechazada sin foto"; design.md
// D13, tasks.md 20.4] Deshabilita el submit sin foto en modo creación; en
// edición la foto es opcional (ActualizarCandidatoDto). Grado/Aula (hallazgo
// de revisión manual, post-#26): se mockea `academico-api.ts`, no los hooks
// de `useOpcionesSegmentacion.ts`, mismo criterio que `PasoPublico.spec.tsx`.
vi.mock('../../academico/academico-api', () => ({
  listarGrados: vi.fn(),
  listarAulas: vi.fn(),
  listarSecciones: vi.fn(),
}));

function ok<T>(data: T): { data: T; response: Response } {
  return { data, response: { ok: true } as Response };
}

function grado(id: string, nombre: string): GradoRespuestaDto {
  return { id, nombre, nivel_id: 'nivel-1' };
}

function seccion(id: string, nombre: string, grado_id: string): SeccionRespuestaDto {
  return { id, nombre, grado_id, anio_escolar_id: 'anio-1' };
}

function aula(id: string, grado_id: string, seccion_id: string, turno: 'manana' | 'tarde'): AulaRespuestaDto {
  return { id, turno, grado_id, seccion_id, anio_escolar_id: 'anio-1' };
}

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
  beforeEach(() => {
    vi.mocked(academicoApi.listarGrados).mockReset().mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarAulas).mockReset().mockResolvedValue(ok([]));
    vi.mocked(academicoApi.listarSecciones).mockReset().mockResolvedValue(ok([]));
  });

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

  it('Grado/Aula son selects reales: elegir Grado carga las Aulas de ese grado, y el submit envía nombre/etiqueta legibles', async () => {
    vi.mocked(academicoApi.listarGrados).mockResolvedValue(ok([grado('g1', '5to')]));
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue(ok([seccion('s1', 'A', 'g1')]));
    vi.mocked(academicoApi.listarAulas).mockResolvedValue(ok([aula('a1', 'g1', 's1', 'manana')]));

    const onEnviar = vi.fn();
    render(<FormularioCandidato modo="creacion" listas={listas} onEnviar={onEnviar} enviando={false} />);

    await waitFor(() => expect(screen.getByRole('option', { name: '5to' })).toBeInTheDocument());
    // Sin Grado elegido, Aula arranca deshabilitada — no tiene sentido ofrecer aulas sin filtrar.
    expect(screen.getByLabelText('Aula')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: 'g1' } });
    await waitFor(() => expect(academicoApi.listarAulas).toHaveBeenCalledWith({ grado_id: 'g1' }, expect.anything()));
    await waitFor(() => expect(screen.getByLabelText('Aula')).not.toBeDisabled());
    await waitFor(() => expect(screen.getByRole('option', { name: 'A · Mañana' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'a1' } });
    fireEvent.change(screen.getByLabelText(/nombres/i), { target: { value: 'Ana' } });
    const foto = new File(['x'], 'foto.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText(/^foto/i), { target: { files: [foto] } });
    fireEvent.click(screen.getByRole('button', { name: /registrar candidato/i }));

    expect(onEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ grado: '5to', aula: 'A · Mañana' }),
    );
  });

  it('cambiar de Grado reinicia la Aula elegida (evita enviar una aula de otro grado)', async () => {
    vi.mocked(academicoApi.listarGrados).mockResolvedValue(
      ok([grado('g1', '5to'), grado('g2', '6to')]),
    );
    vi.mocked(academicoApi.listarSecciones).mockResolvedValue(ok([seccion('s1', 'A', 'g1')]));
    vi.mocked(academicoApi.listarAulas).mockResolvedValue(ok([aula('a1', 'g1', 's1', 'manana')]));

    render(<FormularioCandidato modo="creacion" listas={listas} onEnviar={vi.fn()} enviando={false} />);
    await waitFor(() => expect(screen.getByRole('option', { name: '5to' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: 'g1' } });
    await waitFor(() => expect(screen.getByLabelText('Aula')).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText('Aula'), { target: { value: 'a1' } });
    expect(screen.getByLabelText('Aula')).toHaveValue('a1');

    fireEvent.change(screen.getByLabelText('Grado'), { target: { value: 'g2' } });

    expect(screen.getByLabelText('Aula')).toHaveValue('');
  });

  it('sin listas creadas todavía, muestra una nota explicando que se puede registrar sin lista y asociarla después', () => {
    render(<FormularioCandidato modo="creacion" listas={[]} onEnviar={vi.fn()} enviando={false} />);

    expect(screen.getByText(/todavía no hay listas creadas/i)).toBeInTheDocument();
  });

  it('con listas ya creadas, no muestra la nota', () => {
    render(<FormularioCandidato modo="creacion" listas={listas} onEnviar={vi.fn()} enviando={false} />);

    expect(screen.queryByText(/todavía no hay listas creadas/i)).not.toBeInTheDocument();
  });
});
