import { ConfiguracionEmailSender } from './configuracion-email-sender';
import { ConsoleEmailSender } from './console-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';
import type { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';

jest.mock('./smtp-email-sender');
jest.mock('./console-email-sender');

/**
 * configuracion-general, PR4 (design.md D3, tarea 4.4). Unit test con `ConfiguracionLecturaService`
 * mockeado — `ConfiguracionEmailSender.send()` resuelve `smtp()` DENTRO de `send()` (D3), nunca en
 * el constructor, así que instanciarlo no consulta la DB. `smtp_host` no nulo ⇒ delega en
 * `SmtpEmailSender` construido con host/puerto/remitente de DB y contraseña de
 * `SMTP_USER`/`SMTP_PASSWORD` de env var; `smtp_host` nulo ⇒ delega en `ConsoleEmailSender`.
 * Ningún campo de contraseña se lee de `Configuracion` (spec "La contraseña SMTP nunca se lee de
 * `Configuracion`").
 */
describe('ConfiguracionEmailSender.send() — resolución perezosa (D3)', () => {
  const ENV_ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
    jest.clearAllMocks();
  });

  function crearServicio(smtp: ReturnType<typeof jest.fn>) {
    const configuracionLectura = { smtp } as unknown as ConfiguracionLecturaService;
    return new ConfiguracionEmailSender(configuracionLectura);
  }

  it('[4.4] construir la instancia no consulta ConfiguracionLecturaService.smtp()', () => {
    const smtp = jest.fn();
    crearServicio(smtp);
    expect(smtp).not.toHaveBeenCalled();
  });

  it('[4.4] smtp_host no nulo arma SmtpEmailSender con host/puerto/remitente de DB y contraseña de env var', async () => {
    process.env.SMTP_USER = 'usuario-env';
    process.env.SMTP_PASSWORD = 'password-env';
    const smtp = jest.fn().mockResolvedValue({
      host: 'smtp.db.local',
      puerto: 2525,
      remitente: 'no-responder@db.local',
    });
    const sendMailMock = jest.fn().mockResolvedValue(undefined);
    (SmtpEmailSender as unknown as jest.Mock).mockImplementation(function (this: unknown) {
      Object.assign(this as object, { send: sendMailMock });
    });

    const sender = crearServicio(smtp);
    await sender.send('padre@seei.local', 'Recuperación', 'cuerpo con token');

    expect(smtp).toHaveBeenCalledTimes(1);
    expect(SmtpEmailSender).toHaveBeenCalledWith({
      host: 'smtp.db.local',
      port: 2525,
      user: 'usuario-env',
      password: 'password-env',
      from: 'no-responder@db.local',
    });
    expect(sendMailMock).toHaveBeenCalledWith('padre@seei.local', 'Recuperación', 'cuerpo con token');
    expect(ConsoleEmailSender).not.toHaveBeenCalled();
  });

  it('[4.4] smtp_host nulo/ausente usa ConsoleEmailSender como fallback', async () => {
    const smtp = jest.fn().mockResolvedValue(null);
    const sendMailMock = jest.fn().mockResolvedValue(undefined);
    (ConsoleEmailSender as unknown as jest.Mock).mockImplementation(function (this: unknown) {
      Object.assign(this as object, { send: sendMailMock });
    });

    const sender = crearServicio(smtp);
    await sender.send('padre@seei.local', 'Recuperación', 'cuerpo con token');

    expect(smtp).toHaveBeenCalledTimes(1);
    expect(sendMailMock).toHaveBeenCalledWith('padre@seei.local', 'Recuperación', 'cuerpo con token');
    expect(SmtpEmailSender).not.toHaveBeenCalled();
  });

  it('[4.4] ningún campo de contraseña se lee de Configuracion — solo de env var', async () => {
    process.env.SMTP_PASSWORD = 'password-env-real';
    const smtp = jest.fn().mockResolvedValue({
      host: 'smtp.db.local',
      puerto: 587,
      remitente: 'no-responder@db.local',
    });
    const sendMailMock = jest.fn().mockResolvedValue(undefined);
    (SmtpEmailSender as unknown as jest.Mock).mockImplementation(function (this: unknown) {
      Object.assign(this as object, { send: sendMailMock });
    });

    const sender = crearServicio(smtp);
    await sender.send('padre@seei.local', 'Recuperación', 'cuerpo con token');

    const [[config]] = (SmtpEmailSender as unknown as jest.Mock).mock.calls;
    expect(config.password).toBe('password-env-real');
    expect(config).not.toHaveProperty('smtp_password');
  });
});
