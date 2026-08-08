import { ConsoleEmailSender } from './console-email-sender';

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8): `ConsoleEmailSender` es la implementación por
 * defecto de `EmailSender` cuando `SMTP_HOST` no está configurado (desarrollo local). Nunca debe
 * loguear el `cuerpo` — es donde viaja el token de recuperación (spec "Solicitud de recuperación
 * no revela existencia del correo", D5 de design.md).
 */
describe('ConsoleEmailSender', () => {
  // 3.1 RED [D8]: send() loguea únicamente destinatario+asunto, nunca el cuerpo.
  it('[D8] send() loguea solo destinatario y asunto, nunca el cuerpo', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const sender = new ConsoleEmailSender();

    await sender.send('padre@seei.local', 'Recuperación de contraseña', 'token-secreto-no-loguear');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [mensaje] = logSpy.mock.calls[0];
    expect(String(mensaje)).toContain('padre@seei.local');
    expect(String(mensaje)).toContain('Recuperación de contraseña');
    expect(String(mensaje)).not.toContain('token-secreto-no-loguear');

    logSpy.mockRestore();
  });
});
