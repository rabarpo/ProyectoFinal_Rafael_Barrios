import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { SesionUsuario } from '../auth/sesion-usuario';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificacionesService } from './notificaciones.service';

/**
 * notificaciones (backlog #19), PR5 (design.md D9/D10, tareas 13.1-13.4). Unit tests con
 * `PrismaService` mockeado — mismo criterio que `comprobante.service.spec.ts`/`papeleta.service.spec.ts`
 * (`#14`/`#15` D9/D13): pertenencia por `usuario_id = sesion.userId`, `403` idéntico para ajena e
 * inexistente (sin `404` oráculo, threat: IDOR/enumeración). El listado nunca acepta un `usuario_id`
 * de parámetro: solo sale de `sesion.userId` (threat: oráculo de IDOR).
 */

const SESION: SesionUsuario = { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 };
const NOTIFICACION_ID = '123e4567-e89b-12d3-a456-426614174000';

function construirRegistro(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTIFICACION_ID,
    evento: 'inicio_votacion',
    proceso_id: 'proceso-1',
    titulo: 'Título',
    cuerpo: 'Cuerpo',
    creado_en: new Date('2026-08-25T10:00:00.000Z'),
    leido_en: null,
    job_correo_id: 'job-1',
    usuario_id: 'usuario-1',
    ...overrides,
  };
}

function construirServicio(overrides: {
  findMany?: jest.Mock;
  count?: jest.Mock;
  findFirst?: jest.Mock;
  updateMany?: jest.Mock;
}) {
  const findMany = overrides.findMany ?? jest.fn().mockResolvedValue([]);
  const count = overrides.count ?? jest.fn().mockResolvedValue(0);
  const findFirst = overrides.findFirst ?? jest.fn().mockResolvedValue(null);
  const updateMany = overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 1 });

  const prisma = {
    notificacion: { findMany, count, findFirst, updateMany },
  } as unknown as PrismaService;

  return { servicio: new NotificacionesService(prisma), findMany, count, findFirst, updateMany };
}

describe('NotificacionesService (design.md D9/D10, tareas 13.1-13.4)', () => {
  // 13.1: listado filtra por usuario_id = sesion.userId, nunca por parámetro externo
  it('[13.1] listar() filtra siempre por usuario_id de la sesión, nunca por un parámetro externo', async () => {
    const registro = construirRegistro();
    const { servicio, findMany, count } = construirServicio({
      findMany: jest.fn().mockResolvedValue([registro]),
      count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(1),
    });

    const resultado = await servicio.listar({}, SESION);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usuario_id: 'usuario-1' }),
      }),
    );
    expect(count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ usuario_id: 'usuario-1' }) }));
    expect(resultado.datos).toHaveLength(1);
    expect(resultado.pagina).toBe(1);
    expect(resultado.tamano).toBe(20);
    expect(resultado.total).toBe(1);
    expect(resultado.no_leidas).toBe(1);
    expect(resultado.datos[0]).toEqual({
      id: NOTIFICACION_ID,
      evento: 'inicio_votacion',
      proceso_id: 'proceso-1',
      titulo: 'Título',
      cuerpo: 'Cuerpo',
      creado_en: '2026-08-25T10:00:00.000Z',
      leido_en: null,
      tiene_correo: true,
    });
  });

  // 13.2: pagina/tamano fuera de rango -> CAMPO_INVALIDO
  it.each([
    [{ pagina: '0' }, 'pagina'],
    [{ pagina: 'abc' }, 'pagina'],
    [{ pagina: '1.5' }, 'pagina'],
    [{ tamano: '0' }, 'tamano'],
    [{ tamano: '101' }, 'tamano'],
    [{ tamano: 'abc' }, 'tamano'],
    [{ solo_no_leidas: 'si' }, 'solo_no_leidas'],
  ])('[13.2] query %o fuera de rango/formato -> 400 CAMPO_INVALIDO (%s)', async (query, campoEsperado) => {
    const { servicio, findMany } = construirServicio({});

    await expect(servicio.listar(query, SESION)).rejects.toBeInstanceOf(BadRequestException);
    await expect(servicio.listar(query, SESION)).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: campoEsperado },
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  // 13.3: findFirst({id, usuario_id}) nulo -> 403, idéntico para ajena e inexistente
  it('[13.3] marcarLeido() con notificación inexistente responde 403 sin invocar updateMany()', async () => {
    const { servicio, findFirst, updateMany } = construirServicio({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(servicio.marcarLeido(NOTIFICACION_ID, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: NOTIFICACION_ID, usuario_id: 'usuario-1' } });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('[13.3] marcarLeido() con notificación ajena responde el MISMO 403 que la inexistente', async () => {
    // findFirst siempre filtra por usuario_id, así que una fila ajena nunca aparece: mismo mock que inexistente
    const { servicio, findFirst } = construirServicio({ findFirst: jest.fn().mockResolvedValue(null) });

    await expect(servicio.marcarLeido(NOTIFICACION_ID, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: NOTIFICACION_ID, usuario_id: 'usuario-1' } });
  });

  // 13.4: PATCH con leido_en=NULL -> updateMany CAS puebla leido_en; segundo PATCH -> 200 con el
  // leido_en ORIGINAL, sin sobrescribir
  it('[13.4] marcarLeido() con leido_en=NULL ejecuta el CAS updateMany() y devuelve leido_en recién poblado', async () => {
    const registro = construirRegistro({ leido_en: null });
    const { servicio, findFirst, updateMany } = construirServicio({
      findFirst: jest.fn().mockResolvedValue(registro),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    });

    const resultado = await servicio.marcarLeido(NOTIFICACION_ID, SESION);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: NOTIFICACION_ID, usuario_id: 'usuario-1', leido_en: null },
      data: { leido_en: expect.any(Date) },
    });
    expect(resultado.leido_en).not.toBeNull();
    expect(findFirst).toHaveBeenCalledTimes(1);
  });

  it('[13.4] marcarLeido() sobre una ya leída devuelve el leido_en ORIGINAL, sin invocar updateMany()', async () => {
    const yaLeidoEn = new Date('2026-08-25T09:00:00.000Z');
    const registro = construirRegistro({ leido_en: yaLeidoEn });
    const { servicio, updateMany } = construirServicio({
      findFirst: jest.fn().mockResolvedValue(registro),
    });

    const resultado = await servicio.marcarLeido(NOTIFICACION_ID, SESION);

    expect(updateMany).not.toHaveBeenCalled();
    expect(resultado.leido_en).toBe('2026-08-25T09:00:00.000Z');
  });

  it('[13.4] marcarLeido() concurrente donde el CAS pierde la carrera relee el leido_en real', async () => {
    const registro = construirRegistro({ leido_en: null });
    const ganadorLeidoEn = new Date('2026-08-25T09:30:00.000Z');
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce(registro)
      .mockResolvedValueOnce({ ...registro, leido_en: ganadorLeidoEn });
    const { servicio } = construirServicio({
      findFirst,
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    });

    const resultado = await servicio.marcarLeido(NOTIFICACION_ID, SESION);

    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(resultado.leido_en).toBe('2026-08-25T09:30:00.000Z');
  });
});
