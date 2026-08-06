import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';

/**
 * Copia `apps/backend/dist-openapi/openapi.json` (emitido por
 * `@seei/backend#openapi:extract`, sin servidor vivo, ver design.md D1) hacia
 * `packages/contracts/openapi.json`, y transforma ese contrato en tipos puros con
 * `openapi-typescript`, emitiendo `packages/contracts/src/generated/api.d.ts`.
 *
 * Ambos archivos se versionan en git (design.md D3): el contrato generado es un
 * artefacto de repositorio, no un paso manual, y la verificación de deriva de CI
 * (scripts/check-drift.ts) depende de que estén comiteados y sincronizados.
 */
export const BACKEND_OPENAPI_PATH = resolve(__dirname, '../../../apps/backend/dist-openapi/openapi.json');
export const CONTRACTS_OPENAPI_PATH = resolve(__dirname, '../openapi.json');
export const GENERATED_TYPES_PATH = resolve(__dirname, '../src/generated/api.d.ts');

export async function generateContracts(): Promise<void> {
  if (!existsSync(BACKEND_OPENAPI_PATH)) {
    throw new Error(
      `No se encontró ${BACKEND_OPENAPI_PATH}. Ejecute "pnpm --filter @seei/backend openapi:extract" primero.`,
    );
  }

  const raw = readFileSync(BACKEND_OPENAPI_PATH, 'utf-8');
  writeFileSync(CONTRACTS_OPENAPI_PATH, raw);

  const ast = await openapiTS(new URL(`file://${CONTRACTS_OPENAPI_PATH.replace(/\\/g, '/')}`));
  const contents = astToString(ast);

  mkdirSync(dirname(GENERATED_TYPES_PATH), { recursive: true });
  writeFileSync(GENERATED_TYPES_PATH, contents);
}

if (require.main === module) {
  generateContracts()
    .then(() => {
      // eslint-disable-next-line no-console
      console.log('Contratos generados: openapi.json, src/generated/api.d.ts');
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
