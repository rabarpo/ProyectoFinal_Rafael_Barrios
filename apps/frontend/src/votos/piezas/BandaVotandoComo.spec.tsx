import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BandaVotandoComo } from './BandaVotandoComo';

// [design.md D14, ADR-0011; tasks.md 20.1-20.2] Declara la calidad del derecho activo — nunca
// permite cambiar de derecho a mitad de flujo (ADR-0011 retira el salto "votar por mi otro hijo").
describe('BandaVotandoComo', () => {
  it('[20.1] en_calidad_de=padre declara "Votando como padre/apoderado de <nombre> · <aula>"', () => {
    render(<BandaVotandoComo enCalidadDe="padre" nombreEstudiante="Ana Pérez" aula="4° B" />);

    expect(screen.getByRole('status')).toHaveTextContent('Votando como padre/apoderado de Ana Pérez · 4° B');
  });

  it('[20.1] en_calidad_de=estudiante muestra solo nombre y aula propios, sin prefijo "Votando como"', () => {
    render(<BandaVotandoComo enCalidadDe="estudiante" nombreEstudiante="Ana Pérez" aula="4° B" />);

    const banda = screen.getByRole('status');
    expect(banda).toHaveTextContent('Ana Pérez · 4° B');
    expect(banda).not.toHaveTextContent(/votando como/i);
  });

  it('[20.2] no ofrece ningún control para cambiar de derecho a mitad de flujo', () => {
    render(<BandaVotandoComo enCalidadDe="padre" nombreEstudiante="Ana Pérez" aula="4° B" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
