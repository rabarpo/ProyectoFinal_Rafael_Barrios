import { normalizarTextoLibre } from './texto-libre';

/**
 * notificaciones (#19, PR2; design.md D8). Aprobación del comportamiento movido desde
 * `votos/correo-comprobante.ts` — mismo helper, nueva ubicación compartida por
 * `votos/` y `notificaciones/` (D8: evita una dependencia `notificaciones -> votos`).
 */
describe('normalizarTextoLibre()', () => {
  it('[aprobación] retira caracteres de control (incluidos \\r\\n) y recorta espacios', () => {
    expect(normalizarTextoLibre('Consejo\r\nBcc: atacante@evil.com')).toBe(
      'Consejo Bcc: atacante@evil.com',
    );
  });

  it('[aprobación] recorta espacios al inicio/fin sin alterar el texto intermedio', () => {
    expect(normalizarTextoLibre('  Consejo Estudiantil 2026  ')).toBe('Consejo Estudiantil 2026');
  });

  it('[triangulación] texto sin caracteres de control queda intacto', () => {
    expect(normalizarTextoLibre('Elección Ordinaria')).toBe('Elección Ordinaria');
  });
});
