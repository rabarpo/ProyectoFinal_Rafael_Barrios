import type { RolUsuario } from '@prisma/client';

/**
 * auth-server-sessions, PR2 (design.md, "Contratos"). Forma persistida en
 * `session:{id}` (JSON) y adjuntada a `req.usuario` por `AuthGuard`.
 * `creadoEn` es un timestamp Unix en segundos, usado por
 * `SessionService.obtener()` para aplicar el techo absoluto (D1).
 */
export interface SesionUsuario {
  userId: string;
  rol: RolUsuario;
  creadoEn: number;
}

declare global {
  namespace Express {
    interface Request {
      usuario?: SesionUsuario;
    }
  }
}
