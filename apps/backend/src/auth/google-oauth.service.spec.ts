import { UnauthorizedException } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import { GoogleOauthService } from './google-oauth.service';

/**
 * google-oauth-y-recuperacion, PR2 (design.md D2, tarea 6.1-6.5/6.8). Unit test sobre un
 * `OAuth2Client` simulado (`overrideProvider(GOOGLE_OAUTH_CLIENT)` en los e2e) — nunca abre red
 * real. Foco: la política fail-closed completa (D2) — ausencia de env vars, `hd` ausente/no
 * permitido, `email_verified: false`, `aud` incorrecta, y rechazo del propio `verifyIdToken()`.
 */
describe('GoogleOauthService.verificar — política fail-closed (D2)', () => {
  const ENV_ORIGINAL = { ...process.env };

  afterEach(() => {
    process.env = { ...ENV_ORIGINAL };
  });

  function crearServicio(overrides: {
    clientId?: string;
    hostedDomains?: string;
    verifyIdTokenImpl?: (options: unknown) => Promise<{ getPayload: () => unknown }>;
  }) {
    process.env.GOOGLE_CLIENT_ID = overrides.clientId ?? 'client-id-real';
    process.env.GOOGLE_HOSTED_DOMAINS = overrides.hostedDomains ?? 'colegio.edu.ar';

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
    const service = new GoogleOauthService(client);
    return { service, verifyIdToken };
  }

  // 6.1 RED [R2][D2]: sin GOOGLE_CLIENT_ID configurado, todo verificar() rechaza en tiempo de
  // request — la construcción del servicio no lanza (no hay onModuleInit que valide env).
  it('[R2][D2] GOOGLE_CLIENT_ID vacío rechaza en tiempo de request, sin lanzar en la construcción', async () => {
    const { service } = crearServicio({ clientId: '' });

    await expect(service.verificar('token-cualquiera')).rejects.toThrow(UnauthorizedException);
  });

  it('[R2][D2] GOOGLE_HOSTED_DOMAINS vacío rechaza en tiempo de request', async () => {
    const { service } = crearServicio({ hostedDomains: '' });

    await expect(service.verificar('token-cualquiera')).rejects.toThrow(UnauthorizedException);
  });

  // 6.2 RED [R2][D2]: hd ausente (cuenta personal @gmail.com) es rechazada.
  it('[R2][D2] hd ausente es rechazado', async () => {
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

  // 6.3 RED [R2][D2]: hd presente pero no permitido (normalizado trim().toLowerCase()).
  it('[R2][D2] hd presente pero fuera de GOOGLE_HOSTED_DOMAINS es rechazado', async () => {
    const { service } = crearServicio({
      hostedDomains: 'colegio.edu.ar, otro-colegio.edu.ar',
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
  });

  it('[R2][D2] hd permitido normalizado (mayúsculas/espacios) es aceptado', async () => {
    const { service } = crearServicio({
      hostedDomains: ' Colegio.edu.ar ,otro.edu.ar',
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

  // 6.4 RED [R2][D2]: email_verified === false es rechazado.
  it('[R2][D2] email_verified === false es rechazado', async () => {
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

  // 6.5 RED [R2][D2]: aud !== GOOGLE_CLIENT_ID es rechazado — se pasa audience explícitamente a
  // verifyIdToken(), así que el rechazo real ocurre dentro de la librería; este test cubre el caso
  // donde el mock simula ese comportamiento (aud incorrecta ⇒ verifyIdToken lanza).
  it('[R2][D2] audiencia incorrecta (verifyIdToken rechaza) es rechazado', async () => {
    const { service } = crearServicio({
      verifyIdTokenImpl: async () => {
        throw new Error('Wrong recipient, payload audience != requested audience');
      },
    });

    await expect(service.verificar('token-aud-incorrecta')).rejects.toThrow(UnauthorizedException);
  });

  // 6.8 GREEN [R2]: token sintácticamente válido pero con firma inválida es rechazado sin llegar
  // a los chequeos de dominio — el rechazo de la librería ya produce la misma falla uniforme.
  it('[R2] firma inválida (verifyIdToken rechaza a nivel de librería) es rechazado uniformemente', async () => {
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
