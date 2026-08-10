import { UnauthorizedException } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import { GoogleOauthService } from './google-oauth.service';
import type { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';

/**
 * google-oauth-y-recuperacion, PR2 (design.md D2, tarea 6.1-6.5/6.8), corte de fuente en
 * configuracion-general, PR4 (design.md D2, tarea 4.1). Unit test sobre un `OAuth2Client`
 * simulado y un `ConfiguracionLecturaService` mockeado — nunca abre red ni Postgres real. Foco:
 * la política fail-closed completa (D2) — DB caída, `dominios_google` vacío, `hd` ausente/no
 * permitido, `email_verified: false`, `aud` incorrecta, y rechazo del propio `verifyIdToken()`.
 */
describe('GoogleOauthService.verificar — política fail-closed (D2)', () => {
  const ENV_ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
  });

  function crearServicio(overrides: {
    clientId?: string;
    dominiosGooglePermitidos?: () => Promise<string[]>;
    verifyIdTokenImpl?: (options: unknown) => Promise<{ getPayload: () => unknown }>;
  }) {
    process.env.GOOGLE_CLIENT_ID = overrides.clientId ?? 'client-id-real';

    const verifyIdToken = jest.fn(
      overrides.verifyIdTokenImpl ??
        (async () => ({
          getPayload: () => ({
            sub: 'sub-1',
            aud: 'client-id-real',
            email: 'padre@colegio.edu.ar',
            email_verified: true,
            hd: 'colegio.edu.ar',
          }),
        })),
    );

    const client = { verifyIdToken } as unknown as OAuth2Client;
    const dominiosGooglePermitidos = jest.fn(
      overrides.dominiosGooglePermitidos ?? (async () => ['colegio.edu.ar']),
    );
    const configuracionLectura = {
      dominiosGooglePermitidos,
    } as unknown as ConfiguracionLecturaService;
    const service = new GoogleOauthService(client, configuracionLectura);
    return { service, verifyIdToken, dominiosGooglePermitidos };
  }

  // [4.1][D2] GOOGLE_CLIENT_ID vacío rechaza en tiempo de request, sin lanzar en la construcción.
  it('[4.1][D2] GOOGLE_CLIENT_ID vacío rechaza en tiempo de request, sin lanzar en la construcción', async () => {
    const { service } = crearServicio({ clientId: '' });

    await expect(service.verificar('token-cualquiera')).rejects.toThrow(UnauthorizedException);
  });

  // [4.1][D2] DB caída (dominiosGooglePermitidos() rechaza) ⇒ UnauthorizedException, nunca 500.
  it('[4.1][D2] DB caída al consultar dominios permitidos rechaza con UnauthorizedException (nunca 500)', async () => {
    const { service } = crearServicio({
      dominiosGooglePermitidos: async () => {
        throw new Error('Connection refused');
      },
    });

    await expect(service.verificar('token-cualquiera')).rejects.toThrow(UnauthorizedException);
  });

  // [4.1][D2] Configuracion.dominios_google = [] ⇒ fail-closed, ningún dominio permitido.
  it('[4.1][D2] dominios_google vacío en Configuracion rechaza en tiempo de request (fail-closed)', async () => {
    const { service } = crearServicio({ dominiosGooglePermitidos: async () => [] });

    await expect(service.verificar('token-cualquiera')).rejects.toThrow(UnauthorizedException);
  });

  // [4.1][D2] hd ausente (cuenta personal @gmail.com) es rechazada.
  it('[4.1][D2] hd ausente es rechazado', async () => {
    const { service } = crearServicio({
      verifyIdTokenImpl: async () => ({
        getPayload: () => ({
          sub: 'sub-1',
          aud: 'client-id-real',
          email: 'persona@gmail.com',
          email_verified: true,
          // hd ausente
        }),
      }),
    });

    await expect(service.verificar('token-personal')).rejects.toThrow(UnauthorizedException);
  });

  // [4.1][D2] hd presente pero no permitido (normalizado trim().toLowerCase()), evento
  // LOGIN_OAUTH_FALLIDO lo emite AuthService al capturar este rechazo (ver auth.service.ts).
  it('[4.1][D2] hd presente pero fuera de Configuracion.dominios_google es rechazado', async () => {
    const { service, dominiosGooglePermitidos } = crearServicio({
      dominiosGooglePermitidos: async () => ['colegio.edu.ar', 'otro-colegio.edu.ar'],
      verifyIdTokenImpl: async () => ({
        getPayload: () => ({
          sub: 'sub-1',
          aud: 'client-id-real',
          email: 'x@dominio-no-permitido.com',
          email_verified: true,
          hd: 'DOMINIO-NO-PERMITIDO.com',
        }),
      }),
    });

    await expect(service.verificar('token-hd-no-permitido')).rejects.toThrow(UnauthorizedException);
    expect(dominiosGooglePermitidos).toHaveBeenCalled();
  });

  it('[4.1][D2] hd permitido normalizado (mayúsculas/espacios) es aceptado, payload validado', async () => {
    const { service } = crearServicio({
      dominiosGooglePermitidos: async () => [' Colegio.edu.ar ', 'otro.edu.ar'].map((d) =>
        d.trim().toLowerCase(),
      ),
      verifyIdTokenImpl: async () => ({
        getPayload: () => ({
          sub: 'sub-1',
          aud: 'client-id-real',
          email: 'padre@colegio.edu.ar',
          email_verified: true,
          hd: 'COLEGIO.EDU.AR',
        }),
      }),
    });

    const payload = await service.verificar('token-hd-permitido');
    expect(payload.sub).toBe('sub-1');
    expect(payload.correo).toBe('padre@colegio.edu.ar');
  });

  // [4.1] email_verified === false es rechazado.
  it('[4.1] email_verified === false es rechazado', async () => {
    const { service } = crearServicio({
      verifyIdTokenImpl: async () => ({
        getPayload: () => ({
          sub: 'sub-1',
          aud: 'client-id-real',
          email: 'padre@colegio.edu.ar',
          email_verified: false,
          hd: 'colegio.edu.ar',
        }),
      }),
    });

    await expect(service.verificar('token-no-verificado')).rejects.toThrow(UnauthorizedException);
  });

  // [4.1] aud !== GOOGLE_CLIENT_ID es rechazado — se pasa audience explícitamente a
  // verifyIdToken(), así que el rechazo real ocurre dentro de la librería; este test cubre el caso
  // donde el mock simula ese comportamiento (aud incorrecta ⇒ verifyIdToken lanza).
  it('[4.1] audiencia incorrecta (verifyIdToken rechaza) es rechazado', async () => {
    const { service } = crearServicio({
      verifyIdTokenImpl: async () => {
        throw new Error('Wrong recipient, payload audience != requested audience');
      },
    });

    await expect(service.verificar('token-aud-incorrecta')).rejects.toThrow(UnauthorizedException);
  });

  // [4.1] token sintácticamente válido pero con firma inválida es rechazado sin llegar a los
  // chequeos de dominio — el rechazo de la librería ya produce la misma falla uniforme.
  it('[4.1] firma inválida (verifyIdToken rechaza a nivel de librería) es rechazado uniformemente', async () => {
    const { service, verifyIdToken } = crearServicio({
      verifyIdTokenImpl: async () => {
        throw new Error('Invalid token signature');
      },
    });

    await expect(service.verificar('token-firma-invalida')).rejects.toThrow(UnauthorizedException);
    expect(verifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'token-firma-invalida', audience: 'client-id-real' }),
    );
  });

  it('payload sin getPayload() resuelto (undefined) es rechazado', async () => {
    const { service } = crearServicio({
      verifyIdTokenImpl: async () => ({ getPayload: () => undefined }),
    });

    await expect(service.verificar('token-sin-payload')).rejects.toThrow(UnauthorizedException);
  });
});
