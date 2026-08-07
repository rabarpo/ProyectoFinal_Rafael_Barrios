import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import type { SessionService } from './session.service';

/**
 * auth-server-sessions, PR2 (design.md D8): AuthGuard (401) lee la cookie `seei_session`,
 * consulta `SessionService.obtener()` y adjunta `req.usuario`, o rechaza sin invocar el handler.
 */
describe('AuthGuard', () => {
  function crearContexto(cookies: Record<string, string> | undefined) {
    const request: { cookies?: Record<string, string>; usuario?: unknown } = { cookies };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  // 5.2 RED [R6a]: solicitud sin cookie es rechazada sin llegar al handler.
  it('[R6a] rechaza sin cookie de sesión, sin llamar a SessionService.obtener()', async () => {
    const sessionService = { obtener: jest.fn() } as unknown as SessionService;
    const guard = new AuthGuard(sessionService);
    const { context } = crearContexto(undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionService.obtener).not.toHaveBeenCalled();
  });

  // 5.3 GREEN: cookie válida referencia una sesión existente -> adjunta req.usuario y deja pasar.
  it('cookie válida adjunta req.usuario y permite continuar', async () => {
    const sesion = { userId: 'u-1', rol: 'docente', creadoEn: 1000 };
    const sessionService = {
      obtener: jest.fn().mockResolvedValue(sesion),
    } as unknown as SessionService;
    const guard = new AuthGuard(sessionService);
    const { context, request } = crearContexto({ seei_session: 'abc123' });

    const resultado = await guard.canActivate(context);

    expect(resultado).toBe(true);
    expect(sessionService.obtener).toHaveBeenCalledWith('abc123');
    expect(request.usuario).toEqual(sesion);
  });

  // 5.4 RED/GREEN [R6b]: cookie referenciando una sesión eliminada/expirada es rechazada.
  it('[R6b] rechaza cuando SessionService.obtener() retorna null (sesión eliminada/expirada)', async () => {
    const sessionService = {
      obtener: jest.fn().mockResolvedValue(null),
    } as unknown as SessionService;
    const guard = new AuthGuard(sessionService);
    const { context } = crearContexto({ seei_session: 'expirada' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
