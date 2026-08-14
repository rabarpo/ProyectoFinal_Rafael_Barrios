import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormularioLista } from './FormularioLista';

// [spec: candidatos-listas-management, "Creación exitosa de lista sin plan de
// trabajo adjunto"; design.md D13, tasks.md 20.5] Presentacional puro: exige
// nombre/número, el plan de trabajo (`CampoArchivo`) es siempre opcional.
describe('FormularioLista', () => {
  it('el submit queda deshabilitado sin nombre ni número', () => {
    render(<FormularioLista onEnviar={vi.fn()} enviando={false} />);

    expect(screen.getByRole('button', { name: /crear lista/i })).toBeDisabled();
  });

  it('con nombre y número completos, envía los datos sin exigir plan de trabajo', () => {
    const onEnviar = vi.fn();
    render(<FormularioLista onEnviar={onEnviar} enviando={false} />);

    fireEvent.change(screen.getByLabelText(/^nombre/i), { target: { value: 'Lista A' } });
    fireEvent.change(screen.getByLabelText(/número/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /crear lista/i }));

    expect(onEnviar).toHaveBeenCalledWith(
      expect.objectContaining({ nombre: 'Lista A', numero: '1', planTrabajo: null }),
    );
  });
});
