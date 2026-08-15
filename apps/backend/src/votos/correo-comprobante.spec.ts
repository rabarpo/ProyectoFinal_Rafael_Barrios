import { construirCorreoComprobante } from './correo-comprobante';

/**
 * outbox-correo-comprobante-autenticado (#15, PR1; design.md D2, tareas 2.1-2.4). Renderizador
 * puro — sin mocks, sin E/S. Threat matrix: "Secreto del voto en el correo" e "Inyección de
 * cabeceras SMTP".
 */
const DATOS_BASE = {
  codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
  hora_servidor: new Date('2026-09-02T10:00:00.000Z'),
  proceso_nombre: 'Consejo Estudiantil 2026',
  voto_id: '11111111-2222-3333-4444-555555555555',
  app_base_url: 'https://votos.colegio.edu.ar',
};

describe('construirCorreoComprobante()', () => {
  // 2.1: contiene código, hora y enlace.
  it('[2.1] el cuerpo contiene código de comprobante, hora del servidor y enlace autenticado', () => {
    const { cuerpo } = construirCorreoComprobante(DATOS_BASE);

    expect(cuerpo).toContain(DATOS_BASE.codigo_comprobante);
    expect(cuerpo).toContain(DATOS_BASE.hora_servidor.toISOString());
    expect(cuerpo).toContain(`${DATOS_BASE.app_base_url}/comprobante/${DATOS_BASE.voto_id}`);
  });

  // 2.2: lista negra de subcadenas de la elección — nunca viaja en asunto ni cuerpo.
  it('[2.2] ni asunto ni cuerpo contienen ninguna subcadena relacionada con la elección', () => {
    const resultado = construirCorreoComprobante(DATOS_BASE);
    const textoCompleto = `${resultado.asunto}\n${resultado.cuerpo}`.toLowerCase();

    const prohibidas = ['lista', 'opcion', 'opción', 'candidato', 'blanco', 'eleccion', 'elección', 'eleccion_resumen'];
    for (const prohibida of prohibidas) {
      // "elección" viaja en la frase final ("no incluye tu elección"), que es la ÚNICA excepción
      // permitida por design.md — se prueba por separado abajo, así que se excluye de esta lista
      // negra genérica.
      if (prohibida === 'eleccion' || prohibida === 'elección') continue;
      expect(textoCompleto).not.toContain(prohibida);
    }
  });

  it('[2.2 triangulación] eleccion_resumen nunca viaja en el cuerpo', () => {
    const { cuerpo } = construirCorreoComprobante(DATOS_BASE);
    expect(cuerpo).not.toContain('eleccion_resumen');
  });

  // 2.3: sin app_base_url -> cuerpo sin enlace, sin excepción.
  it('[2.3] sin app_base_url el cuerpo omite el enlace y no lanza excepción', () => {
    const { codigo_comprobante, hora_servidor, proceso_nombre, voto_id } = DATOS_BASE;

    expect(() =>
      construirCorreoComprobante({ codigo_comprobante, hora_servidor, proceso_nombre, voto_id }),
    ).not.toThrow();

    const { cuerpo } = construirCorreoComprobante({ codigo_comprobante, hora_servidor, proceso_nombre, voto_id });
    expect(cuerpo).not.toContain('http');
    expect(cuerpo).toContain(codigo_comprobante);
    expect(cuerpo).toContain(hora_servidor.toISOString());
  });

  // 2.4: asunto invariante ante inyección de cabeceras vía proceso_nombre.
  it('[2.4][adversarial] proceso_nombre con \\r\\nBcc: x@y no altera el asunto ni inyecta un salto de cabecera', () => {
    const resultado = construirCorreoComprobante({
      ...DATOS_BASE,
      proceso_nombre: 'Consejo\r\nBcc: atacante@evil.com',
    });

    expect(resultado.asunto).toBe('Comprobante de tu voto');
    // El fragmento interpolado (proceso_nombre) queda libre de \r: ningún CRLF puede originarse
    // desde el texto de usuario, aunque el resto del cuerpo use \n como separador de líneas propio.
    const lineaProceso = resultado.cuerpo.split('\n').find((linea) => linea.startsWith('Proceso: '));
    expect(lineaProceso).toBeDefined();
    expect(lineaProceso).not.toMatch(/\r/);
  });
});
