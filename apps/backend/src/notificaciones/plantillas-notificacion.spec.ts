import * as fs from 'node:fs';
import * as path from 'node:path';
import { construirNotificacion, type EventoNotificacionSeei } from './plantillas-notificacion';

/**
 * notificaciones (#19, PR2; design.md D8, C8). Motor de plantillas puras — cuatro funciones sin
 * tabla en base de datos, sin usuario en la firma (C8), sin `proceso_nombre` en el `asunto`
 * (anti-inyección SMTP, mismo patrón que `construirCorreoComprobante()` de #15).
 */
const EVENTOS: EventoNotificacionSeei[] = [
  'inicio_votacion',
  'recordatorio',
  'cierre_proximo',
  'resultados',
];

const DATOS_BASE = {
  proceso_nombre: 'Consejo Estudiantil 2026',
  fecha_cierre_prevista: new Date('2026-09-02T18:00:00.000Z'),
  app_base_url: 'https://votos.colegio.edu.ar',
};

describe('construirNotificacion()', () => {
  // 5.1: cada evento produce titulo/cuerpo/asunto deterministas.
  it.each(EVENTOS)('[5.1] %s produce el mismo titulo/cuerpo/asunto ante los mismos datos', (evento) => {
    const primero = construirNotificacion(evento, DATOS_BASE);
    const segundo = construirNotificacion(evento, DATOS_BASE);

    expect(primero).toEqual(segundo);
    expect(primero.titulo.length).toBeGreaterThan(0);
    expect(primero.cuerpo.length).toBeGreaterThan(0);
    expect(primero.asunto.length).toBeGreaterThan(0);
  });

  // 5.2: asunto fijo, sin proceso_nombre, en ninguno de los 4 [threat: inyección SMTP].
  it.each(EVENTOS)('[5.2][adversarial] %s: el asunto no contiene proceso_nombre', (evento) => {
    const { asunto } = construirNotificacion(evento, DATOS_BASE);
    expect(asunto).not.toContain(DATOS_BASE.proceso_nombre);
  });

  // 5.3: proceso_nombre con \r\nBcc: sale normalizado en el cuerpo.
  it('[5.3][adversarial] proceso_nombre con \\r\\nBcc: x@y sale normalizado en el cuerpo', () => {
    const { cuerpo, asunto } = construirNotificacion('inicio_votacion', {
      ...DATOS_BASE,
      proceso_nombre: 'Consejo\r\nBcc: atacante@evil.com',
    });

    expect(asunto).toBe(construirNotificacion('inicio_votacion', DATOS_BASE).asunto);
    expect(cuerpo).not.toMatch(/\r/);
    expect(cuerpo).toContain('Consejo Bcc: atacante@evil.com');
  });

  // 5.4: sin app_base_url el cuerpo omite el enlace y no lanza, en los 4 eventos.
  it.each(EVENTOS)('[5.4] %s: sin app_base_url el cuerpo omite el enlace y no lanza', (evento) => {
    const { proceso_nombre, fecha_cierre_prevista } = DATOS_BASE;

    expect(() =>
      construirNotificacion(evento, { proceso_nombre, fecha_cierre_prevista }),
    ).not.toThrow();

    const { cuerpo } = construirNotificacion(evento, { proceso_nombre, fecha_cierre_prevista });
    expect(cuerpo).not.toContain('http');
  });

  // 5.5 [C8]: la firma no acepta usuario — aserción de aridad + del texto fuente del módulo.
  it('[5.5][C8] construirNotificacion no acepta un parámetro de usuario', () => {
    expect(construirNotificacion.length).toBe(2);

    const fuente = fs.readFileSync(path.join(__dirname, 'plantillas-notificacion.ts'), 'utf-8');
    const sinComentarios = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(sinComentarios.toLowerCase()).not.toContain('usuario');
  });

  // Triangulación adicional: resultados no reporta conteos ni etiquetas de opción.
  it('[triangulación][spec: Fuga lateral gate ocultar_resultados] el cuerpo de resultados no reporta conteos ni etiquetas de opción', () => {
    const { cuerpo } = construirNotificacion('resultados', DATOS_BASE);
    // El nombre del proceso puede legítimamente llevar dígitos (p. ej. un año); lo que NO debe
    // aparecer es un conteo o desglose, así que se descarta esa porción antes de buscar dígitos.
    const sinNombreProceso = cuerpo.replace(DATOS_BASE.proceso_nombre, '');

    expect(sinNombreProceso).not.toMatch(/\d/);
    for (const prohibida of ['lista', 'opcion', 'opción', 'candidato', 'blanco', 'ganador']) {
      expect(cuerpo.toLowerCase()).not.toContain(prohibida);
    }
  });
});
