interface BotonSeleccionProps {
  /** Texto visible del botón, p. ej. "Seleccionar Lista". */
  texto: string;
  /** Sufijo distintivo para el nombre accesible; se omite cuando `texto` ya es único (voto en blanco). */
  etiqueta?: string;
  seleccionada: boolean;
  onSeleccionar: () => void;
}

/**
 * fidelidad-visual-boleta-votacion, PR3 (design.md D1, tasks.md 9.1-10.1). Único dueño del
 * contrato ARIA compartido por las 4 tarjetas de opción del Paso 2. El botón sólido de selección
 * NO es un `<button>`: es un `<label>` estilizado que contiene el mismo
 * `<input type="radio" name="eleccion" className="sr-only">` de siempre, para conservar gratis
 * (sin código propio) la navegación por flechas, `Space`, wrap-around y el anuncio "N de M" que da
 * el navegador a un grupo de radios nativo. Ver design.md D1 para el razonamiento completo y la
 * alternativa rechazada (`role="radio"` en un `<button>` con roving tabindex manual).
 *
 * Nombre accesible (WCAG 2.5.3, *Label in Name*): `${texto}: ${etiqueta}` cuando `etiqueta` está
 * definida, o solo `texto` cuando ya es único (caso `TarjetaVotoBlanco`).
 *
 * El anillo de foco se pinta con `has-[:focus-visible]:outline-2` sobre el `<label>` — nunca
 * `focus-within`, que también dispara con click de mouse.
 *
 * `onKeyDown` intercepta `Space`/`Enter` explícitamente (`preventDefault` + `onSeleccionar()`) en
 * vez de depender del toggle nativo del navegador en `keyup`, para que el mismo `onSeleccionar`
 * se dispare una única vez sin importar el método de interacción (click, Space o Enter).
 */
export function BotonSeleccion({ texto, etiqueta, seleccionada, onSeleccionar }: BotonSeleccionProps) {
  return (
    // bug reportado por el usuario (diagnosticado con datos reales de consola): sin
    // `position: relative` acá, el `<input>` sr-only (`position: absolute`) no tiene un ancestro
    // posicionado cerca — su "contenedor de posicionamiento" termina siendo `<html>`. Al enfocarlo
    // (click/tab), el navegador hace scroll-into-view sobre ESE contenedor, moviendo `<html>`
    // aunque tenga `overflow: hidden` (el CSS bloquea el scroll del usuario, no el programático).
    // `relative` acá ancla el input a este `<label>` (ya visible, ya en pantalla), así que el
    // navegador no tiene nada que "traer a la vista".
    <label
      className={`relative flex w-full cursor-pointer items-center justify-center rounded-control bg-primary px-4 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-primary has-[:focus-visible]:outline-offset-2`}
    >
      <input
        type="radio"
        name="eleccion"
        aria-label={etiqueta ? `${texto}: ${etiqueta}` : texto}
        checked={seleccionada}
        onChange={onSeleccionar}
        onKeyDown={(evento) => {
          if (evento.key === ' ' || evento.key === 'Spacebar' || evento.key === 'Enter') {
            evento.preventDefault();
            onSeleccionar();
          }
        }}
        className="sr-only"
      />
      {seleccionada ? 'Seleccionado' : texto}
    </label>
  );
}
