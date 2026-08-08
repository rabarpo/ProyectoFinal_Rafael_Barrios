import type { Provider } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export const GOOGLE_OAUTH_CLIENT = 'GOOGLE_OAUTH_CLIENT';

/**
 * google-oauth-y-recuperacion, PR2 (design.md D2). El `OAuth2Client` no abre conexión ni valida
 * nada al instanciarse — `getFederatedSignonCertsAsync()` (usado internamente por
 * `verifyIdToken()`) recién ocurre en el primer request, así que este provider preserva el
 * gotcha de `src/openapi.ts` igual que `redisProvider`/`EmailModule` (D8). Se inyecta como
 * `GOOGLE_OAUTH_CLIENT` para poder sustituirlo con `overrideProvider()` en los tests, sin red.
 */
export const googleOauthClientProvider: Provider = {
  provide: GOOGLE_OAUTH_CLIENT,
  useFactory: (): OAuth2Client => new OAuth2Client(),
};
