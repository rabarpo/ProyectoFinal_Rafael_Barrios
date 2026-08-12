import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProcesoWizardPage } from './ProcesoWizardPage';

// [spec: electoral-process-wizard, "Selección de tipo determina las opciones
// de segmentación disponibles" y "Cuatro tipos de proceso soportados"];
// design.md D7 (navegación 1→2 sin router, preserva estado en el reducer).
describe('ProcesoWizardPage', () => {
  it('paso 1 pide nombre y tipo antes de habilitar Siguiente', () => {
    render(<ProcesoWizardPage />);

    expect(screen.getByRole('heading', { name: /datos del proceso/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('navegar de paso 1 a paso 2 preserva el estado tecleado', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), {
      target: { value: 'Elección de comité 2026' },
    });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'municipio' },
    });

    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.getByRole('heading', { name: /público y segmentación/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /anterior/i }));

    expect(screen.getByLabelText(/nombre/i)).toHaveValue('Elección de comité 2026');
    expect(screen.getByLabelText(/tipo de proceso/i)).toHaveValue('municipio');
  });

  it('representante_aula no ofrece la opción institución en el paso 2', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Elección de aula' } });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'representante_aula' },
    });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.queryByRole('radio', { name: /instituci[oó]n/i })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /^aulas$/i })).toBeChecked();
  });

  it('municipio sí ofrece la opción institución en el paso 2', () => {
    render(<ProcesoWizardPage />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Elección municipal' } });
    fireEvent.change(screen.getByLabelText(/tipo de proceso/i), {
      target: { value: 'municipio' },
    });
    fireEvent.click(screen.getByRole('button', { name: /siguiente/i }));

    expect(screen.getByRole('radio', { name: /instituci[oó]n/i })).toBeInTheDocument();
  });
});
