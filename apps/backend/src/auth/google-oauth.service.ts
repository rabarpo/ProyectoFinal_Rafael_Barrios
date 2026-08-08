import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { OAuth2Client } from 'google-auth-library';
import { GOOGLE_OAUTH_CLIENT } from './google-oauth.provider';

export interface GooglePayloadValidado {
  sub: string;
  correo: string;
}

/**
 * google-oauth-y-recuperacion, PR2 (design.md D2, ADR-0017). Verificación manual del ID token de
 * Google, fallando en cerrado: firma/`iss` (los valida la librería), `aud === GOOGLE_CLIENT_ID`,
 * `email_verified === true`, y `hd` **presente** y contenido en `GOOGLE_HOSTED_DOMAINS`
 * (normalizado `trim().toLowerCase()`). `GOOGLE_CLIENT_ID`/`GOOGLE_HOSTED_DOMAINS` ausentes o
 * vacíos rechazan TODO login en tiempo de request — nunca una excepción en el constructor ni en
 * `onModuleInit`, así que `pnpm openapi:extract` sigue funcionando sin secretos (D2/D8).
 */
@Injectable()
export class GoogleOauthService {
  constructor(@Inject(GOOGLE_OAUTH_CLIENT) private readonly client: OAuth2Client) {}

  async verificar(idToken: string): Promise<GooglePayloadValidado> {
    const clientId = process.env.GOOGLE_CLIENT_ID ?? '';
    const dominiosPermitidos = this.dominiosPermitidos();

    if (!clientId || dominiosPermitidos.length === 0) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const payload = await this.client
      .verifyIdToken({ idToken, audience: clientId })
      .then((ticket) => ticket.getPayload())
      .catch(() => undefined);

    if (
      !payload ||
      !payload.sub ||
      !payload.email ||
      payload.email_verified !== true ||
      !payload.hd ||
      !dominiosPermitidos.includes(payload.hd.trim().toLowerCase())
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return { sub: payload.sub, correo: payload.email.trim().toLowerCase() };
  }

  private dominiosPermitidos(): string[] {
    const raw = process.env.GOOGLE_HOSTED_DOMAINS ?? '';
    return raw
      .split(',')
      .map((dominio) => dominio.trim().toLowerCase())
      .filter((dominio) => dominio.length > 0);
  }
}
