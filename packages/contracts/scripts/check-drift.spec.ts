import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkGitClean } from './check-drift';

/**
 * Sandbox git aislado del repositorio real: cada test crea su propio repositorio temporal
 * con un subdirectorio `packages/contracts` y otro archivo fuera de él, para reproducir
 * exactamente las dos filas de la Matriz de amenazas de design.md (TM1: selección de
 * repositorio/pathspec; TM2: archivos no rastreados) sin tocar el estado git real del monorepo.
 */
function crearSandboxGit(): string {
  const dir = mkdtempSync(join(tmpdir(), 'seei-contracts-drift-'));
  execFileSync('git', ['init', '--quiet'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });

  mkdirSync(join(dir, 'packages', 'contracts'), { recursive: true });
  writeFileSync(join(dir, 'packages', 'contracts', 'openapi.json'), '{"paths":{}}\n');
  writeFileSync(join(dir, 'otro-paquete.txt'), 'contenido inicial\n');

  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '--quiet', '-m', 'estado inicial'], { cwd: dir });

  return dir;
}

describe('checkGitClean', () => {
  let sandbox: string;

  beforeEach(() => {
    sandbox = crearSandboxGit();
  });

  afterEach(() => {
    rmSync(sandbox, { recursive: true, force: true });
  });

  it('[TM1] pasa cuando el archivo sucio está fuera de packages/contracts', () => {
    writeFileSync(join(sandbox, 'otro-paquete.txt'), 'contenido modificado fuera del pathspec\n');

    const result = checkGitClean(sandbox, 'packages/contracts');

    expect(result.clean).toBe(true);
  });

  it('[TM2][R3b] falla cuando la regeneración produce un archivo nuevo no rastreado dentro de packages/contracts', () => {
    writeFileSync(
      join(sandbox, 'packages', 'contracts', 'api.d.ts'),
      'export interface paths { "/nuevo-endpoint": unknown }\n',
    );

    const result = checkGitClean(sandbox, 'packages/contracts');

    expect(result.clean).toBe(false);
  });
});
