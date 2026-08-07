import { PasswordService } from './password.service';

/**
 * auth-server-sessions, PR1 (design.md D3/D5): argon2id, PHC-embedded salt, y verificación
 * contra un hash señuelo fijo cuando no hay hash real, para no abrir un oráculo de tiempo entre
 * "usuario inexistente" y "contraseña incorrecta".
 */
describe('PasswordService', () => {
  const service = new PasswordService();

  // 3.1 RED [D3]: verificar() contra un hash inexistente ejecuta el mismo trabajo de cómputo
  // que una verificación real (no hace `return false` inmediato) y siempre retorna false.
  it('[D3] verificar() sin hash real corre argon2id contra el hash señuelo (sin retorno anticipado) y retorna false', async () => {
    const inicio = performance.now();
    const resultado = await service.verificar('cualquier-password', null);
    const duracion = performance.now() - inicio;

    expect(resultado).toBe(false);
    // argon2id con memoryCost=19456/timeCost=2 tarda decenas de ms; un `return false`
    // inmediato (oráculo de tiempo) tomaría menos de 1ms.
    expect(duracion).toBeGreaterThan(5);
  });

  // 3.3 GREEN: la contraseña correcta contra su propio hash real verifica true.
  it('la contraseña correcta contra su hash real verifica true', async () => {
    const hashReal = await service.hash('clave-correcta-3-3');

    await expect(service.verificar('clave-correcta-3-3', hashReal)).resolves.toBe(true);
  });

  // 3.3 GREEN: la contraseña incorrecta contra un hash real verifica false.
  it('la contraseña incorrecta contra un hash real verifica false', async () => {
    const hashReal = await service.hash('clave-correcta-3-3');

    await expect(service.verificar('clave-incorrecta-3-3', hashReal)).resolves.toBe(false);
  });
});
