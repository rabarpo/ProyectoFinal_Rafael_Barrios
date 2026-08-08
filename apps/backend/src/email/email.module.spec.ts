import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { EMAIL_SENDER } from './email-sender';
import { EmailModule } from './email.module';
import { ConsoleEmailSender } from './console-email-sender';

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8, spec "`EmailSender` mínimo sin outbox"): el
 * sistema MUST NOT escribir en `JobCorreo`/`Notificacion` ni leer `Configuracion` desde este
 * módulo. La ausencia total de `PrismaService`/modelo Prisma en `EmailModule` (chequeo estático
 * del código fuente) es la garantía; el guard test de instanciación confirma que el módulo no
 * necesita ningún provider de Prisma para resolver `EMAIL_SENDER`.
 */
describe('EmailModule', () => {
  // 3.6 [R10] Chequeo estático: ningún import de PrismaService ni referencia a JobCorreo/
  // Notificacion/Configuracion en el código fuente del módulo de email.
  it('[R10] no contiene ninguna referencia a PrismaService, JobCorreo, Notificacion o Configuracion', () => {
    for (const file of ['email.module.ts', 'email-sender.ts', 'console-email-sender.ts', 'smtp-email-sender.ts']) {
      const contenido = readFileSync(join(__dirname, file), 'utf8');
      // Los doc-comments explican deliberadamente qué NO debe tocar este módulo (design.md D8);
      // el chequeo real es sobre código, no prosa, así que se despoja de comentarios primero.
      const sinComentarios = contenido
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(sinComentarios).not.toMatch(/PrismaService|JobCorreo|Notificacion|Configuracion/);
    }
  });

  // 3.6 [R10] Guard test: el módulo se instancia sin ningún Prisma client — EMAIL_SENDER resuelve
  // por sí solo a ConsoleEmailSender cuando SMTP_HOST no está definido.
  it('[R10] se instancia sin Prisma client y resuelve EMAIL_SENDER a ConsoleEmailSender', async () => {
    const previo = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;

    const moduleRef = await Test.createTestingModule({
      imports: [EmailModule],
    }).compile();

    const emailSender = moduleRef.get(EMAIL_SENDER);
    expect(emailSender).toBeInstanceOf(ConsoleEmailSender);

    await moduleRef.close();
    if (previo !== undefined) process.env.SMTP_HOST = previo;
  });
});
