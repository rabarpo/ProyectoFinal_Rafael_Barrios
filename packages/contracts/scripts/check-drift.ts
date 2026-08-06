import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export interface DriftCheckResult {
  clean: boolean;
  diff: string;
}

/**
 * Verificación de deriva de design.md (sección "Verificación de deriva en CI"):
 *
 *   git add --intent-to-add -- <pathspec>
 *   git diff --exit-code -- <pathspec>
 *
 * `[TM1]` Selección de repositorio git: el pathspec explícito (`-- packages/contracts`, nunca
 * el árbol completo) evita que un archivo sucio ajeno produzca un fallo o un aprobado engañoso.
 *
 * `[TM2][R3b]` Estado del índice: `git diff --exit-code` por sí solo **no ve archivos no
 * rastreados**, así que un endpoint nuevo que genera un archivo nuevo pasaría el check en
 * falso. `git add --intent-to-add` resuelve esto: agrega el path al índice con contenido vacío
 * (sin stagear su contenido real), lo que hace que `git diff` sí lo compare contra "nada" y
 * lo reporte como diferencia.
 */
export function checkGitClean(cwd: string, pathspec: string): DriftCheckResult {
  execFileSync('git', ['add', '--intent-to-add', '--', pathspec], { cwd });

  try {
    const diff = execFileSync('git', ['diff', '--exit-code', '--', pathspec], { cwd, encoding: 'utf-8' });
    return { clean: true, diff };
  } catch (error) {
    const execError = error as { status?: number; stdout?: string | Buffer };
    if (execError.status === 1) {
      const diff =
        typeof execError.stdout === 'string' ? execError.stdout : (execError.stdout?.toString('utf-8') ?? '');
      return { clean: false, diff };
    }
    throw error;
  }
}

function resolveRepoRoot(cwd: string): string {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf-8' }).trim();
}

/**
 * Paso completo de CI `[R3a][R3c]`: regenera con `--force` (evita que un acierto de caché de
 * Turborepo convierta el check en un no-op) y compara con `checkGitClean`. Se ejecuta
 * inmediatamente después de generar y antes de `build`/`test` (design.md, tabla de jobs de CI).
 */
export async function verificarDeriva(cwd: string = process.cwd()): Promise<DriftCheckResult> {
  const repoRoot = resolveRepoRoot(cwd);

  execFileSync('pnpm', ['turbo', 'run', 'generate:contracts', '--force'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  return checkGitClean(repoRoot, 'packages/contracts');
}

if (require.main === module) {
  verificarDeriva(resolve(__dirname, '..'))
    .then((result) => {
      if (!result.clean) {
        console.error("Contrato desactualizado: ejecute 'pnpm turbo run generate:contracts' y commitee.");
        console.error(result.diff);
        process.exit(1);
      }
      // eslint-disable-next-line no-console
      console.log('Contratos sincronizados.');
    })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exit(1);
    });
}
