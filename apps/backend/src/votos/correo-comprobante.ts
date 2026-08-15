/**
 * outbox-correo-comprobante-autenticado (#15, PR1; design.md D2, "Contenido del correo").
 * Renderizador PURO del correo de confirmación de voto: sin E/S, sin reloj propio, sin acceso a
 * Prisma. Firma CERRADA de cuatro campos obligatorios — no puede filtrar la elección del votante
 * porque nunca la recibe (`lista_id`/`opcion_id`/`candidato_id`/`blanco`/`eleccion_resumen` no
 * existen en este módulo, ni en el tipo de entrada ni en ningún import). El worker de #15/PR2
 * envía el `cuerpo`/`asunto` resultantes tal cual, sin recomponerlos (D2: contenido materializado
 * en la transacción del voto).
 *
 * Asunto fijo (sin el nombre del proceso): uniforma la bandeja de entrada y elimina de raíz
 * cualquier superficie de inyección de cabeceras SMTP desde `ProcesoElectoral.nombre` (texto
 * capturado por un usuario de gestión). El nombre del proceso viaja únicamente en el CUERPO
 * (`text` plano, nunca HTML/cabeceras) y se normaliza (se retiran caracteres de control) antes de
 * interpolarse — threat matrix: "Inyección de cabeceras SMTP".
 */

const ASUNTO_FIJO = 'Comprobante de tu voto';

export interface DatosCorreoComprobante {
  codigo_comprobante: string;
  hora_servidor: Date;
  proceso_nombre: string;
  voto_id: string;
  /** Ausente ⇒ el cuerpo omite el enlace y mantiene código/hora, nunca lanza (design.md D2). */
  app_base_url?: string;
}

export interface CorreoComprobante {
  asunto: string;
  cuerpo: string;
}

/**
 * Retira caracteres de control (incluidos `\r`/`\n`) de un texto libre capturado por un usuario
 * de gestión, antes de interpolarlo en el cuerpo del correo — evita que un `\r\nBcc: x@y` inyecte
 * un salto de cabecera dentro del cuerpo `text` plano.
 */
function normalizarTextoLibre(texto: string): string {
  // eslint-disable-next-line no-control-regex
  return texto.replace(/[\x00-\x1F\x7F]+/g, ' ').trim();
}

export function construirCorreoComprobante(datos: DatosCorreoComprobante): CorreoComprobante {
  const procesoNombre = normalizarTextoLibre(datos.proceso_nombre);
  const horaIso = datos.hora_servidor.toISOString();

  const enlace = datos.app_base_url
    ? `\n\nPara ver tu comprobante completo, inicia sesión:\n${datos.app_base_url}/comprobante/${datos.voto_id}`
    : '';

  const cuerpo =
    `Tu voto quedó registrado.\n\n` +
    `Proceso: ${procesoNombre}\n` +
    `Código de comprobante: ${datos.codigo_comprobante}\n` +
    `Hora del servidor: ${horaIso}` +
    `${enlace}\n\n` +
    `Este correo no incluye tu elección: sólo tú puedes verla, tras iniciar sesión.`;

  return { asunto: ASUNTO_FIJO, cuerpo };
}
