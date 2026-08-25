import { ForbiddenException } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import type { PrismaService } from '../prisma/prisma.service';
import { ComprobanteService } from './comprobante.service';
import type { VotosService } from './votos.service';

/**
 * outbox-correo-comprobante-autenticado (#15, PR3; design.md D11, tareas 10.1-10.3). Unit tests
 * con `PrismaService`/`VotosService` mockeados — mismo criterio que `papeleta.service.ts` (`#14`
 * D13): pertenencia por `Voto → DerechoVoto.usuario_id === sesion.userId`, `403` idéntico para
 * ajeno e inexistente (sin `404` oráculo, threat: IDOR/enumeración).
 */

const SESION: SesionUsuario = { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 };
const VOTO_ID = '123e4567-e89b-12d3-a456-426614174000';

function construirVotoFindUnique(voto: unknown) {
  return jest.fn().mockResolvedValue(voto);
}

function construirServicio(overrides: { votoFindUnique?: jest.Mock; construirComprobante?: jest.Mock }) {
  const votoFindUnique = overrides.votoFindUnique ?? construirVotoFindUnique(null);
  const construirComprobante = overrides.construirComprobante ?? jest.fn();

  const prisma = { voto: { findUnique: votoFindUnique } } as unknown as PrismaService;
  const votosService = { construirComprobante } as unknown as VotosService;

  return { servicio: new ComprobanteService(prisma, votosService), votoFindUnique, construirComprobante };
}

describe('ComprobanteService (design.md D11, tareas 10.1-10.3)', () => {
  // 10.1: voto propio -> delega en VotosService.construirComprobante() y responde el ComprobanteDto
  it('[10.1] voto propio delega en construirComprobante() y responde el ComprobanteDto', async () => {
    const voto = {
      id: VOTO_ID,
      proceso_id: 'proceso-1',
      derecho_voto_id: 'derecho-1',
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: new Date('2026-08-14T12:00:00.000Z'),
      derechoVoto: { usuario_id: 'usuario-1' },
    };
    const comprobante = {
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: '2026-08-14T12:00:00.000Z',
      proceso: { id: 'proceso-1', nombre: 'Proceso E2E' },
      en_calidad_de: 'estudiante',
      eleccion_resumen: 'Lista A',
    };
    const { servicio, votoFindUnique, construirComprobante } = construirServicio({
      votoFindUnique: construirVotoFindUnique(voto),
      construirComprobante: jest.fn().mockResolvedValue(comprobante),
    });

    const resultado = await servicio.obtener(VOTO_ID, SESION);

    expect(votoFindUnique).toHaveBeenCalledWith({
      where: { id: VOTO_ID },
      include: { derechoVoto: true },
    });
    expect(construirComprobante).toHaveBeenCalledWith({
      creado: false,
      codigo_comprobante: voto.codigo_comprobante,
      hora_servidor: voto.hora_servidor.toISOString(),
      proceso_id: voto.proceso_id,
      derecho_voto_id: voto.derecho_voto_id,
    });
    expect(resultado).toEqual(comprobante);
  });

  // 10.2: voto ajeno (Voto -> DerechoVoto.usuario_id !== sesion.userId) -> 403
  it('[10.2] voto ajeno responde 403 sin invocar construirComprobante()', async () => {
    const voto = {
      id: VOTO_ID,
      proceso_id: 'proceso-1',
      derecho_voto_id: 'derecho-1',
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: new Date('2026-08-14T12:00:00.000Z'),
      derechoVoto: { usuario_id: 'usuario-ajeno' },
    };
    const { servicio, construirComprobante } = construirServicio({ votoFindUnique: construirVotoFindUnique(voto) });

    await expect(servicio.obtener(VOTO_ID, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(construirComprobante).not.toHaveBeenCalled();
  });

  // 10.3: votoId inexistente -> 403 con el MISMO cuerpo que el caso ajeno (sin 404 oráculo)
  it('[10.3] votoId inexistente responde 403, idéntico al caso ajeno (sin oráculo de enumeración)', async () => {
    const { servicio, construirComprobante } = construirServicio({ votoFindUnique: construirVotoFindUnique(null) });

    await expect(servicio.obtener(VOTO_ID, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(construirComprobante).not.toHaveBeenCalled();
  });

  // fidelidad-visual-boleta-votacion, PR1 (design.md D2, tarea 3.1). El camino de relectura
  // autenticada hereda `periodo_lectivo` sin lógica propia: `obtener()` no lo filtra ni lo
  // recalcula, solo delega en `construirComprobante()` (ya poblado en `#14`/VotosService).
  it('[3.1] el DTO devuelto por obtener() incluye periodo_lectivo cuando construirComprobante() lo trae (delegación, D2)', async () => {
    const voto = {
      id: VOTO_ID,
      proceso_id: 'proceso-1',
      derecho_voto_id: 'derecho-1',
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: new Date('2026-08-14T12:00:00.000Z'),
      derechoVoto: { usuario_id: 'usuario-1' },
    };
    const comprobante = {
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: '2026-08-14T12:00:00.000Z',
      proceso: { id: 'proceso-1', nombre: 'Proceso E2E' },
      en_calidad_de: 'estudiante',
      eleccion_resumen: 'Lista A',
      periodo_lectivo: '2026',
    };
    const { servicio, construirComprobante } = construirServicio({
      votoFindUnique: construirVotoFindUnique(voto),
      construirComprobante: jest.fn().mockResolvedValue(comprobante),
    });

    const resultado = await servicio.obtener(VOTO_ID, SESION);

    expect(construirComprobante).toHaveBeenCalledTimes(1);
    expect(resultado.periodo_lectivo).toBe('2026');
    expect(resultado).toEqual(comprobante);
  });
});
