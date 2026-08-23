import type { SVGProps } from 'react';

/**
 * Íconos del menú de navegación vertical (mismo criterio que `auth/iconos.tsx`: SVG inline
 * self-hosted, sin CDN, trazos minimalistas). Viven acá y no en `auth/` porque son específicos de
 * `MENU_POR_ROL` — `IconoInstitucion`/`IconoUsuario`/`IconoCandado` de `auth/iconos.tsx` se
 * reutilizan tal cual para los ítems que ya tenían un ícono equivalente.
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

export function IconoProcesos(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function IconoProcesoNuevo(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function IconoConfiguracion(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M17.7 6.3l-1.6 1.6M7.9 16.1l-1.6 1.6M17.7 17.7l-1.6-1.6M7.9 7.9 6.3 6.3" />
    </svg>
  );
}

export function IconoImportacion(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M12 15V4M8 8l4-4 4 4" />
      <path d="M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15" />
    </svg>
  );
}

// dashboard-panel-jornada (Backlog #20, PR3; design.md "Cambios de archivos", tasks.md 12.5).
export function IconoPanel(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="1.5" />
      <path d="M8 17V11M12 17V7M16 17v-4" />
    </svg>
  );
}

export function IconoColapsar(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M9 5l-6 7 6 7M20 5l-6 7 6 7" />
    </svg>
  );
}

export function IconoExpandir(props: IconoProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M15 5l6 7-6 7M4 5l6 7-6 7" />
    </svg>
  );
}
