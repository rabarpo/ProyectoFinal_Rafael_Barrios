import { BadRequestException } from '@nestjs/common';

// configuracion-general, PR2 (design.md "Interfaces / Contracts", tarea 2.4). Mismo formato que
// `academico.errors.ts`/`users.errors.ts`: el cliente discrimina por `codigo`; un único código
// aditivo basta porque las tres validaciones son variantes de "formato inválido" del mismo
// dominio.
export const CONFIGURACION_ERROR_CODES = {
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
} as const;

export type ConfiguracionErrorCode =
  (typeof CONFIGURACION_ERROR_CODES)[keyof typeof CONFIGURACION_ERROR_CODES];

// spec "Validación de formato hexadecimal de colores": `#RRGGBB` o `#RGB`, sin expandir la forma
// corta a 6 dígitos — el literal recibido se persiste tal cual (design.md "Interfaces / Contracts").
const COLOR_HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// spec "Validación de dominios Google Workspace permitidos": hostname simple, sin espacios, con
// al menos un punto — suficiente para rechazar entradas evidentemente inválidas sin reimplementar
// RFC 1035 completo (mismo criterio pragmático que el resto de validadores manuales del repo).
const DOMINIO_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * 2.1: `#1A2B3C` y `#abc` aceptados; `azul`, `#12345`, `#1A2B3G` rechazados. `campo` identifica
 * cuál de los dos colores falló en el body de error (`color_primario`/`color_secundario`).
 */
export function validarColorHex(
  campo: 'color_primario' | 'color_secundario',
  valor: string,
): void {
  if (!COLOR_HEX_REGEX.test(valor)) {
    throw new BadRequestException({
      codigo: CONFIGURACION_ERROR_CODES.CAMPO_INVALIDO,
      campo,
      motivo: 'formato',
    });
  }
}

/**
 * 2.2: valida contra `Intl.supportedValuesOf('timeZone')` — sin dependencia nueva (design.md
 * "Interfaces / Contracts").
 */
export function validarZonaHoraria(valor: string): void {
  const zonasValidas = Intl.supportedValuesOf('timeZone');
  if (!zonasValidas.includes(valor)) {
    throw new BadRequestException({
      codigo: CONFIGURACION_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'zona_horaria',
      motivo: 'formato',
    });
  }
}

/**
 * 2.3: normaliza (`trim().toLowerCase()`, deduplicado) y valida cada elemento contra
 * `DOMINIO_REGEX`; un solo elemento inválido rechaza todo el arreglo. Un arreglo vacío es válido
 * (spec "Arreglo vacío se acepta como fail-closed explícito").
 */
export function normalizarYValidarDominiosGoogle(valores: string[]): string[] {
  const normalizados = valores.map((valor) => valor.trim().toLowerCase());

  const invalido = normalizados.find((valor) => !DOMINIO_REGEX.test(valor));
  if (invalido !== undefined) {
    throw new BadRequestException({
      codigo: CONFIGURACION_ERROR_CODES.CAMPO_INVALIDO,
      campo: 'dominios_google',
      motivo: 'formato',
    });
  }

  return Array.from(new Set(normalizados));
}
