import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import type { Options as Argon2Options } from '@node-rs/argon2';

/**
 * auth-server-sessions, PR1 (design.md D3/D5). Parámetros mínimos OWASP explícitos: salt y
 * parámetros quedan embebidos en la cadena PHC devuelta por `hash()`, así que `verify()` no
 * necesita recibir estas opciones — las lee de la propia cadena.
 */
const ARGON2_OPTIONS: Argon2Options = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

/**
 * Hash señuelo fijo (design.md D3): PHC precomputado de un secreto constante que nunca
 * corresponde a ningún `Usuario` real. Cuando no hay `password_hash` (usuario inexistente o
 * columna nula), `verificar()` igual ejecuta `verify()` contra este hash — mismo costo
 * computacional que una verificación real — para no abrir un oráculo de tiempo que distinga
 * "usuario inexistente" de "contraseña incorrecta" (D3, respuesta 401 unificada).
 */
const DECOY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$YY7zx9y758U4OJlhur6jDg$zq88hcJ+hKY7u8wz2N0KRMVkASUXh6+G6Tu90MjRLhI';

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return hash(plain, ARGON2_OPTIONS);
  }

  /**
   * `hashAlmacenado` nulo/ausente (usuario inexistente o sin credencial local) verifica igual
   * contra `DECOY_HASH` y siempre retorna `false` — nunca hace `return false` sin antes correr
   * argon2id (D3).
   */
  async verificar(plain: string, hashAlmacenado: string | null | undefined): Promise<boolean> {
    if (!hashAlmacenado) {
      await verify(DECOY_HASH, plain).catch(() => false);
      return false;
    }
    return verify(hashAlmacenado, plain);
  }
}
