import { IconoInformacion } from './iconos-reglas';

/**
 * fidelidad-visual-boleta-votacion, PR3 (design.md D6, tasks.md 11.1-11.2). Caja estática montada
 * por `PasoBoleta` entre el título y el `role="radiogroup"`. Sin props: el texto es la regla del
 * dominio ("una sola opción", "revisá las propuestas antes de confirmar"), idéntica para los 3
 * tipos de proceso — parametrizarla por `tipo` inventaría variación donde el dominio no la tiene.
 *
 * Sin `role="alert"`/`role="status"`: es contenido estático presente desde el montaje, no un
 * anuncio dinámico — un live region acá interrumpiría al lector de pantalla sin motivo.
 */
// observación del usuario: color distintivo (mostaza) para diferenciar este banner del resto de
// bloques en azul primario — ninguna clave del design system (primary/secondary/tertiary) cae en
// esta familia de color, así que se define acá el par bg/texto con buen contraste (~8:1).
const COLOR_FONDO_MOSTAZA = '#EAB308';
const COLOR_TEXTO_MOSTAZA = '#422006';

export function BannerInstrucciones() {
  return (
    <div
      className="rounded-card p-4"
      style={{ backgroundColor: COLOR_FONDO_MOSTAZA, color: COLOR_TEXTO_MOSTAZA }}
    >
      <div className="flex items-start gap-3">
        <IconoInformacion className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="text-label-md">Instrucciones de Votación</p>
          <p className="text-body-md opacity-90">
            Elegí una sola opción entre las disponibles. Revisá las propuestas antes de confirmar:
            una vez emitido, tu voto es secreto e irreversible.
          </p>
        </div>
      </div>
    </div>
  );
}
