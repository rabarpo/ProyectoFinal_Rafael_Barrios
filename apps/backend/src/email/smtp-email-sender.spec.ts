import nodemailer from 'nodemailer';
import { SmtpEmailSender } from './smtp-email-sender';

jest.mock('nodemailer');

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8): `SmtpEmailSender` usa `nodemailer`, sin `pool`
 * y sin `verify()` al arrancar — la construcción NO debe abrir ningún socket (preserva el gotcha
 * de `src/openapi.ts`: extraer el contrato de CI sin SMTP vivo). `send()` invoca
 * `createTransport(...).sendMail()` de forma perezosa, recién en el primer envío.
 */
describe('SmtpEmailSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 3.3 RED [D8]: la construcción no abre socket — createTransport no se llama en el constructor.
  it('[D8] la construcción no invoca createTransport (sin socket al arrancar)', () => {
    new SmtpEmailSender({
      host: 'smtp.example.com',
      port: 587,
      user: 'user',
      password: 'pass',
      from: 'no-reply@seei.local',
    });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  // 3.3 RED [D8]: send() invoca createTransport(...).sendMail() de forma perezosa.
  it('[D8] send() invoca createTransport(...).sendMail() de forma perezosa', async () => {
    const sendMail = jest.fn().mockResolvedValue(undefined);
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });

    const sender = new SmtpEmailSender({
      host: 'smtp.example.com',
      port: 587,
      user: 'user',
      password: 'pass',
      from: 'no-reply@seei.local',
    });

    expect(nodemailer.createTransport).not.toHaveBeenCalled();

    await sender.send('padre@seei.local', 'Recuperación', 'cuerpo con token');

    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'padre@seei.local',
        subject: 'Recuperación',
        text: 'cuerpo con token',
        from: 'no-reply@seei.local',
      }),
    );
  });
});
