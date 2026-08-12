import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * administracion-procesos-electorales, PR1 (design.md D9, tarea 1.4). `pnpm openapi:extract`
 * corre con `tsx` (esbuild): a diferencia de `ts-jest` (usado por este mismo test file), esbuild
 * **no** emite `design:paramtypes` para `emitDecoratorMetadata`, así que `@nestjs/swagger` no
 * puede inferir el DTO de `@Body()` por reflexión sola — de ahí que el contrato generado hoy
 * declare `requestBody?: never` (`packages/contracts/src/generated/api.d.ts:794-818`) pese a que
 * `LoginDto`/`GoogleLoginDto` ya tienen `@ApiProperty()`. Por eso esta prueba lee el artefacto
 * generado y comiteado (`packages/contracts/src/generated/api.d.ts`), el mismo que consume
 * `createSeeiClient`, en vez de reconstruir el documento Swagger vía `ts-jest` (que produciría un
 * falso verde: bajo `tsc` real la inferencia automática SÍ funciona, ocultando el defecto real de
 * la canalización `tsx` → `openapi-typescript`).
 *
 * RED ahora (antes de D9): el archivo comiteado todavía tiene el defecto. GREEN tras 1.1-1.3 +
 * `pnpm generate:contracts` (tarea 1.5): las 4 rutas quedan tipadas y esta prueba pasa.
 */
const GENERATED_TYPES_PATH = resolve(
  __dirname,
  '../../../../packages/contracts/src/generated/api.d.ts',
);

function bloqueDeOperacion(contenido: string, operacion: string, indentacion = '    '): string {
  const marcador = `${indentacion}${operacion}: {`;
  const inicio = contenido.indexOf(marcador);
  if (inicio === -1) {
    throw new Error(`No se encontró "${operacion}" (indentación "${indentacion}") en ${GENERATED_TYPES_PATH}`);
  }

  let profundidad = 0;
  let i = inicio + marcador.length - 1; // posición de la llave de apertura
  for (; i < contenido.length; i++) {
    if (contenido[i] === '{') profundidad++;
    else if (contenido[i] === '}') {
      profundidad--;
      if (profundidad === 0) {
        i++;
        break;
      }
    }
  }
  return contenido.slice(inicio, i);
}

describe('Contrato generado de /auth (D9) — packages/contracts/src/generated/api.d.ts', () => {
  const contenido = readFileSync(GENERATED_TYPES_PATH, 'utf-8');

  it('[D9] AuthController_login ya no declara requestBody?: never y expone MensajeDto en 200', () => {
    const bloque = bloqueDeOperacion(contenido, 'AuthController_login');

    expect(bloque).not.toMatch(/requestBody\?:\s*never/);
    expect(bloque).toContain('components["schemas"]["MensajeDto"]');
  });

  it('[D9] AuthController_loginGoogle ya no declara requestBody?: never y expone MensajeDto en 200', () => {
    const bloque = bloqueDeOperacion(contenido, 'AuthController_loginGoogle');

    expect(bloque).not.toMatch(/requestBody\?:\s*never/);
    expect(bloque).toContain('components["schemas"]["MensajeDto"]');
  });

  it('[D9] AuthController_whoami expone SesionUsuarioDto (con "rol") en la respuesta 200', () => {
    const bloque = bloqueDeOperacion(contenido, 'AuthController_whoami');

    expect(bloque).toContain('components["schemas"]["SesionUsuarioDto"]');

    const schemaBloque = bloqueDeOperacion(contenido, 'SesionUsuarioDto', '        ');
    expect(schemaBloque).toMatch(/\brol\b/);
  });

  it('[D9] SesionUsuarioDto espeja SesionUsuario: userId, rol, creadoEn — sin campos nuevos', () => {
    const schemaBloque = bloqueDeOperacion(contenido, 'SesionUsuarioDto', '        ');

    expect(schemaBloque).toMatch(/\buserId\b/);
    expect(schemaBloque).toMatch(/\brol\b/);
    expect(schemaBloque).toMatch(/\bcreadoEn\b/);
  });
});
