import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { EMAIL_SENDER } from './email-sender';
import { EmailModule } from './email.module';
import { ConfiguracionEmailSender } from './configuracion-email-sender';

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8, spec "`EmailSender` mínimo sin outbox"): el
 * sistema MUST NOT escribir en `JobCorreo`/`Notificacion` desde este módulo — esa restricción
 * sigue vigente sin cambios.
 *
 * configuracion-general, PR4 (design.md D3, tarea 4.6): la restricción de PR1 sobre NO leer
 * `Configuracion` fue reemplazada por el requirement MODIFIED "`EmailSender` mínimo sin outbox" —
 * ahora `EMAIL_SENDER` resuelve a `ConfiguracionEmailSender`, que consulta `Configuracion` dentro
 * de `send()` (D3), nunca en la `useFactory` del módulo. El guard test de instanciación confirma
 * que resolver `EMAIL_SENDER` sigue sin abrir Postgres al arrancar el módulo (D2/D3): la factory
 * no llama a `ConfiguracionLecturaService.smtp()`, solo construye el wrapper perezoso.
 */
describe('EmailModule', () => {
  // [4.6][R10] Chequeo estático: ningún import de PrismaService ni referencia directa a
  // JobCorreo/Notificacion en el código fuente del módulo de email (Configuracion sí se referencia
  // ahora, vía ConfiguracionEmailSender/ConfiguracionLecturaModule — D3).
  it('[4.6][R10] no contiene ninguna referencia a PrismaService, JobCorreo o Notificacion', () => {
    for (const file of [
      'email.module.ts',
      'email-sender.ts',
      'console-email-sender.ts',
      'smtp-email-sender.ts',
      'configuracion-email-sender.ts',
    ]) {
      const contenido = readFileSync(join(__dirname, file), 'utf8');
      // Los doc-comments explican deliberadamente qué NO debe tocar este módulo (design.md D8);
      // el chequeo real es sobre código, no prosa, así que se despoja de comentarios primero.
      const sinComentarios = contenido
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(sinComentarios).not.toMatch(/PrismaService|JobCorreo|Notificacion/);
    }
  });

  // [4.6][R10] Guard test: la factory de EMAIL_SENDER se instancia sin consultar la DB — resuelve
  // siempre a ConfiguracionEmailSender, que decide Smtp/Console recién dentro de send() (D3).
  it('[4.6][R10] se instancia sin Prisma client y resuelve EMAIL_SENDER a ConfiguracionEmailSender', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EmailModule],
    }).compile();

    const emailSender = moduleRef.get(EMAIL_SENDER);
    expect(emailSender).toBeInstanceOf(ConfiguracionEmailSender);

    await moduleRef.close();
  });
});
