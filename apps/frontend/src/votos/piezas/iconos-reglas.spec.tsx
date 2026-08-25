import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import {
  IconoVotoSecreto,
  IconoUnaSolaVez,
  IconoIrreversible,
  IconoInformacion,
  IconoProhibido,
} from './iconos-reglas';

// [design.md D5; tasks.md 5.1-5.2] SVG inline propios, mismo `baseProps` que `app/iconos-menu.tsx`
// (viewBox 0 0 24 24, fill none, stroke currentColor, aria-hidden), sin librería de íconos nueva.
describe('iconos-reglas', () => {
  const iconos = [
    ['IconoVotoSecreto', IconoVotoSecreto],
    ['IconoUnaSolaVez', IconoUnaSolaVez],
    ['IconoIrreversible', IconoIrreversible],
    ['IconoInformacion', IconoInformacion],
    ['IconoProhibido', IconoProhibido],
  ] as const;

  it.each(iconos)('[5.1] %s renderiza un svg oculto para lectores de pantalla con el viewBox estándar', (_nombre, Icono) => {
    const { container } = render(<Icono />);

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('fill', 'none');
    expect(svg).toHaveAttribute('stroke', 'currentColor');
  });

  it('[5.1] cada ícono dibuja un trazo distinto (no son copias del mismo path)', () => {
    const { container: c1 } = render(<IconoVotoSecreto />);
    const { container: c2 } = render(<IconoIrreversible />);

    expect(c1.querySelector('svg')?.innerHTML).not.toBe(c2.querySelector('svg')?.innerHTML);
  });
});
