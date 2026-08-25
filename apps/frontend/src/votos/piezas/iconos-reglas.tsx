import type { SVGProps } from 'react';

/**
 * fidelidad-visual-boleta-votacion, PR2 (design.md D5, tasks.md 5.1-5.2). SVG inline propios para
 * el Paso 1 y el Paso 2 de la boleta — mismo criterio que `app/iconos-menu.tsx`/`auth/iconos.tsx`:
 * self-hosted, sin CDN ni dependencia de librería de íconos. Viven en `votos/piezas` porque son
 * específicos de las reglas de votación y del banner de instrucciones, no del menú de navegación.
 */
type IconoProps = SVGProps<SVGSVGElement>;

const baseProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconoVotoSecreto(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3.5 5 6v5c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-2.5Z" />
      <rect x="9.5" y="11" width="5" height="4" rx="0.75" />
      <path d="M10.5 11V9.3a1.5 1.5 0 0 1 3 0V11" />
    </svg>
  );
}

export function IconoUnaSolaVez(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" />
      <path d="M11 8.5 13 7.5v9" />
    </svg>
  );
}

export function IconoIrreversible(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v6" />
      <path d="M12 16.7v.1" />
    </svg>
  );
}

export function IconoInformacion(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 7.7v.1" />
    </svg>
  );
}

export function IconoProhibido(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.5 6.5l11 11" />
    </svg>
  );
}
