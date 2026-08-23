import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TablaAvanceAulas } from './TablaAvanceAulas';

const AULAS = [
  { aula_id: 'a1', etiqueta: 'Mañana 1ro A', padron: 30, votos: 5, porcentaje: 16.6, rezagada: true },
  { aula_id: 'a2', etiqueta: 'Mañana 1ro B', padron: 30, votos: 25, porcentaje: 83.3, rezagada: false },
  { aula_id: 'a3', etiqueta: 'Tarde 2do A', padron: 0, votos: 0, porcentaje: 0, rezagada: true },
];

// [design.md D7; tasks.md 11.3; threat: inferencia en aulas pequeñas] Aula `rezagada: true` se
// resalta visualmente; `padron === 0` NUNCA se marca rezagada, defensa en profundidad del lado
// del cliente incluso ante un prop adversario.
describe('TablaAvanceAulas', () => {
  it('[11.3] aula rezagada se resalta visualmente', () => {
    render(<TablaAvanceAulas aulas={AULAS} />);

    const filaRezagada = screen.getByText('Mañana 1ro A').closest('tr');
    expect(filaRezagada).toHaveAttribute('data-rezagada', 'true');
  });

  it('[11.3] aula no rezagada no se resalta', () => {
    render(<TablaAvanceAulas aulas={AULAS} />);

    const filaOk = screen.getByText('Mañana 1ro B').closest('tr');
    expect(filaOk).toHaveAttribute('data-rezagada', 'false');
  });

  it('[11.3] padron === 0 nunca se marca rezagada, aunque el prop lo indique', () => {
    render(<TablaAvanceAulas aulas={AULAS} />);

    const filaPadronCero = screen.getByText('Tarde 2do A').closest('tr');
    expect(filaPadronCero).toHaveAttribute('data-rezagada', 'false');
  });
});
