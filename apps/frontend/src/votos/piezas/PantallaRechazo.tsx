export type VarianteRechazo = 'sin-padron' | 'cerrada' | 'ya-votaste' | 'sin-conexion';

interface ComprobanteResumen {
  codigo_comprobante: string;
  hora_servidor: string;
}

interface PantallaRechazoProps {
  variante: VarianteRechazo;
  horaCierre?: string;
  comprobante?: ComprobanteResumen;
  onReintentar?: () => void;
}

const CONTENIDO: Record<VarianteRechazo, { icono: string; titulo: string; explicacion: string }> = {
  'sin-padron': {
    icono: '⛔',
    titulo: 'No estás en el padrón',
    explicacion: 'No encontramos un derecho de voto activo para tu cuenta en este proceso.',
  },
  cerrada: {
    icono: '⏰',
    titulo: 'Votación cerrada',
    explicacion: 'Este proceso ya no acepta votos.',
  },
  'ya-votaste': {
    icono: '✅',
    titulo: 'Ya emitiste tu voto',
    explicacion: 'Tu voto en este proceso ya quedó registrado — acá está tu comprobante.',
  },
  'sin-conexion': {
    icono: '📶',
    titulo: 'Sin conexión al confirmar',
    explicacion: 'No pudimos confirmar si tu voto se registró. Verificá tu conexión e intentá de nuevo.',
  },
};

/**
 * Pieza única parametrizada (design.md D14, "Taxonomía de rechazos", tasks.md 21.1-21.5) — mismo
 * layout (icono, título, explicación, acción) para las 4 variantes que sí tienen pantalla propia:
 *
 * - `sin-padron` (causa 2/D9 `SIN_DERECHO`, incluida la causa 5 "aula que no corresponde" plegada
 *   por D8): sin acción de reintento automático — reintentar no cambiaría el resultado.
 * - `cerrada` (causa 3 `VOTACION_CERRADA`): muestra la hora exacta de cierre que envió el servidor.
 * - `ya-votaste` (causa 4 `DERECHO_YA_EJERCIDO`, D6 — responde `200`, no es un error HTTP): muestra
 *   el comprobante ya emitido, nunca un mensaje de error genérico.
 * - `sin-conexion` (D14 — estado del CLIENTE, la petición nunca llegó o se perdió la respuesta): la
 *   única variante con acción de reintento, porque acá sí puede cambiar el resultado.
 *
 * La causa 1 (403, sesión/derecho ajeno o inexistente) NO tiene variante acá — D9 manda
 * redirección a "/" sin pantalla dedicada, sin cuerpo discriminante que enrutar.
 */
export function PantallaRechazo({ variante, horaCierre, comprobante, onReintentar }: PantallaRechazoProps) {
  const { icono, titulo, explicacion } = CONTENIDO[variante];

  return (
    <div
      role="alert"
      className="mx-auto w-full max-w-page rounded-card border border-border-gray bg-surface-white p-6 text-center shadow-elevation"
    >
      <p aria-hidden="true" className="text-headline-lg">
        {icono}
      </p>
      <h2 className="mt-2 text-headline-lg-mobile text-primary md:text-headline-lg">{titulo}</h2>
      <p className="mt-2 text-body-md text-on-surface">{explicacion}</p>

      {variante === 'cerrada' && horaCierre && (
        <p className="mt-4 text-label-md text-on-surface-variant">Cerró: {new Date(horaCierre).toLocaleString()}</p>
      )}

      {variante === 'ya-votaste' && comprobante && (
        <dl className="mt-4 space-y-1 text-label-md text-on-surface-variant">
          <div>
            <dt className="inline">Comprobante: </dt>
            <dd className="inline">{comprobante.codigo_comprobante}</dd>
          </div>
          <div>
            <dt className="inline">Registrado: </dt>
            <dd className="inline">{new Date(comprobante.hora_servidor).toLocaleString()}</dd>
          </div>
        </dl>
      )}

      {variante === 'sin-conexion' && onReintentar && (
        <button
          type="button"
          onClick={onReintentar}
          className="mt-6 rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}
