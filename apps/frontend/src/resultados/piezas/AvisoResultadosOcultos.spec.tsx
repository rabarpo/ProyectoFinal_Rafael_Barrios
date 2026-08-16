import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AvisoResultadosOcultos } from './AvisoResultadosOcultos';

// [spec: "Vista con resultados ocultos"; tasks.md 15.1] Mensaje visible, sin ningún elemento de
// gráfico montado (no hay gráficos en este componente en absoluto).
describe('AvisoResultadosOcultos', () => {
  it('[15.1] muestra el mensaje de resultados ocultos', () => {
    render(<AvisoResultadosOcultos />);

    expect(screen.getByRole('status')).toHaveTextContent(/ocultos hasta el cierre/i);
    expect(document.querySelector('svg')).toBeNull();
  });
});
