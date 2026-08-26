/**
 * notificaciones (#19, PR2; design.md D8). Movido desde `votos/correo-comprobante.ts` (#15):
 * mismo helper, ubicación compartida — `notificaciones/` lo importa sin depender de `votos/`,
 * que no describiría ninguna relación real (D8).
 */

/**
 * Retira caracteres de control (incluidos `\r`/`\n`) de un texto libre capturado por un usuario
 * de gestión, antes de interpolarlo en un cuerpo de correo o notificación — evita que un
 * `\r\nBcc: x@y` inyecte un salto de cabecera dentro de un cuerpo `text` plano.
 */
export function normalizarTextoLibre(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
}
