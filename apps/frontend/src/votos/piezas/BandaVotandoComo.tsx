interface BandaVotandoComoProps {
  enCalidadDe: string;
  nombreEstudiante: string;
  aula: string;
}

/**
 * Presentacional puro (design.md D14, ADR-0011, tasks.md 20.1-20.3), espejo del criterio visual de
 * `PanelConfirmacionApertura`. Declara la calidad del derecho activo — "Votando como
 * padre/apoderado de {nombre} · {aula}" cuando `en_calidad_de = 'padre'`, o solo nombre y aula
 * propios en cualquier otro caso (típicamente `'estudiante'`). Nunca ofrece un control (botón,
 * enlace, `select`) para cambiar de derecho a mitad de flujo: el ADR-0011 retira explícitamente el
 * salto "votar por mi otro hijo" — la elección del derecho ocurre antes de entrar a este flujo, en
 * "Mis votaciones" (#16/#20, fuera de alcance de #14).
 */
export function BandaVotandoComo({ enCalidadDe, nombreEstudiante, aula }: BandaVotandoComoProps) {
  const esPadre = enCalidadDe === 'padre';

  return (
    <div
      role="status"
      className="mb-4 rounded-control border border-border-gray bg-surface-white px-4 py-3 text-label-md text-on-surface"
    >
      {esPadre ? `Votando como padre/apoderado de ${nombreEstudiante} · ${aula}` : `${nombreEstudiante} · ${aula}`}
    </div>
  );
}
