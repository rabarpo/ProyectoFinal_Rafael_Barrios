import type { SVGProps } from 'react';

/**
 * SVG inline, sin dependencia externa ni CDN (design.md D2: fuentes/íconos
 * self-hosted, cero CDN externo). Trazos minimalistas equivalentes a los
 * Material Symbols del mockup de Stitch, sin arrastrar esa fuente.
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

export function IconoUsuario(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.4-3.6 4.4-5.5 7.5-5.5s6.1 1.9 7.5 5.5" />
    </svg>
  );
}

export function IconoCandado(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
    </svg>
  );
}

export function IconoOjo(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function IconoOjoTachado(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.75" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function IconoInstitucion(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 10.5V20h14v-9.5" />
      <path d="M9 20v-6h6v6" />
    </svg>
  );
}

export function IconoEscudo(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 3.5 5 6v5.5c0 4.4 3 8.2 7 9.5 4-1.3 7-5.1 7-9.5V6l-7-2.5Z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  );
}
