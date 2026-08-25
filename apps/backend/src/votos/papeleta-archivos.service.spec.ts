import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { PapeletaArchivosService } from './papeleta-archivos.service';
import type { PapeletaService } from './papeleta.service';

/**
 * rediseno-boleta-votacion, PR2 (design.md D3, tareas 5.1-5.10). Unit tests con `PrismaService` y
 * `PapeletaService.obtenerOpciones()` mockeados — mismo criterio que `papeleta.service.spec.ts`.
 * Los 5 caminos 403 (derecho ajeno, derecho inexistente, id de otro proceso, id de baja, tipo
 * `consulta`) deben ser byte-a-byte idénticos (D9/D13 de #14) y NUNCA leer los bytes del archivo.
 */

const SESION = { userId: 'usuario-1', rol: 'estudiante' as const, creadoEn: 0 };

const DV_PROPIO = {
  id: 'dv-1',
  proceso_id: 'proceso-1',
  usuario_id: 'usuario-1',
  proceso: { id: 'proceso-1', tipo: 'municipio' },
};

const DV_AJENO = {
  ...DV_PROPIO,
  usuario_id: 'usuario-ajeno',
};

const OPCION_MUNICIPIO_CON_FOTO = {
  id: 'lista-1',
  etiqueta: 'Lista A',
  plan_trabajo_presente: true,
  candidato_id: 'candidato-1',
  candidato_nombres: 'Ana Pérez',
  foto_presente: true,
};

const OPCION_MUNICIPIO_SIN_FOTO = {
  ...OPCION_MUNICIPIO_CON_FOTO,
  foto_presente: false,
};

const OPCION_MUNICIPIO_SIN_PLAN = {
  ...OPCION_MUNICIPIO_CON_FOTO,
  plan_trabajo_presente: false,
};

const OPCION_CONSULTA = {
  id: 'opcion-1',
  etiqueta: 'Sí',
};

function construirServicio(overrides: {
  derechoVotoFindUnique?: jest.Mock;
  candidatoFindUnique?: jest.Mock;
  listaFindUnique?: jest.Mock;
  obtenerOpciones?: jest.Mock;
} = {}) {
  const derechoVotoFindUnique = overrides.derechoVotoFindUnique ?? jest.fn().mockResolvedValue(null);
  const candidatoFindUnique = overrides.candidatoFindUnique ?? jest.fn().mockResolvedValue(null);
  const listaFindUnique = overrides.listaFindUnique ?? jest.fn().mockResolvedValue(null);
  const obtenerOpciones = overrides.obtenerOpciones ?? jest.fn().mockResolvedValue([]);

  const prisma = {
    derechoVoto: { findUnique: derechoVotoFindUnique },
    candidato: { findUnique: candidatoFindUnique },
    lista: { findUnique: listaFindUnique },
  };
  const papeletaService = { obtenerOpciones } as unknown as PapeletaService;

  const servicio = new PapeletaArchivosService(prisma as unknown as PrismaService, papeletaService);
  return { servicio, derechoVotoFindUnique, candidatoFindUnique, listaFindUnique, obtenerOpciones };
}

describe('PapeletaArchivosService — autorización por pertenencia (D3, tareas 5.1-5.10)', () => {
  it('[5.1] derecho ajeno (dv.usuario_id !== sesion.userId) -> ForbiddenException() sin cuerpo', async () => {
    const { servicio } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_AJENO),
    });

    await expect(servicio.obtenerFoto('dv-1', 'candidato-1', SESION)).rejects.toEqual(new ForbiddenException());
  });

  it('[5.2] derechoVotoId inexistente -> mismo ForbiddenException() byte-a-byte que 5.1', async () => {
    const { servicio } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(null),
    });

    await expect(servicio.obtenerFoto('dv-inexistente', 'candidato-1', SESION)).rejects.toEqual(
      new ForbiddenException(),
    );
  });

  it('[5.3] id de una opción de otro proceso -> mismo 403 que 5.1/5.2', async () => {
    const { servicio } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_MUNICIPIO_CON_FOTO]),
    });

    await expect(servicio.obtenerFoto('dv-1', 'candidato-de-otro-proceso', SESION)).rejects.toEqual(
      new ForbiddenException(),
    );
  });

  it('[5.4] id de una opción dada de baja (ausente de obtenerOpciones()) -> mismo 403', async () => {
    const { servicio } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([]),
    });

    await expect(servicio.obtenerFoto('dv-1', 'candidato-1', SESION)).rejects.toEqual(new ForbiddenException());
  });

  it('[5.5] tipo consulta (ninguna opción lleva candidato_id/plan_trabajo_presente) -> mismo 403, sin rama especial', async () => {
    const { servicio } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({
        ...DV_PROPIO,
        proceso: { id: 'proceso-1', tipo: 'consulta' },
      }),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_CONSULTA]),
    });

    await expect(servicio.obtenerFoto('dv-1', 'opcion-1', SESION)).rejects.toEqual(new ForbiddenException());
    await expect(servicio.obtenerPlanTrabajo('dv-1', 'opcion-1', SESION)).rejects.toEqual(new ForbiddenException());
  });

  it('[5.6] los 5 cuerpos 403 anteriores son literalmente idénticos (toEqual), sin oráculo de enumeración', async () => {
    const { servicio: ajeno } = construirServicio({ derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_AJENO) });
    const { servicio: inexistente } = construirServicio({ derechoVotoFindUnique: jest.fn().mockResolvedValue(null) });
    const { servicio: otroProceso } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_MUNICIPIO_CON_FOTO]),
    });
    const { servicio: deBaja } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([]),
    });
    const { servicio: consulta } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({ ...DV_PROPIO, proceso: { id: 'proceso-1', tipo: 'consulta' } }),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_CONSULTA]),
    });

    const errores = await Promise.all(
      [
        ajeno.obtenerFoto('dv-1', 'candidato-1', SESION),
        inexistente.obtenerFoto('dv-inexistente', 'candidato-1', SESION),
        otroProceso.obtenerFoto('dv-1', 'candidato-de-otro-proceso', SESION),
        deBaja.obtenerFoto('dv-1', 'candidato-1', SESION),
        consulta.obtenerFoto('dv-1', 'opcion-1', SESION),
      ].map((p) => p.catch((e: unknown) => e)),
    );

    for (const error of errores) {
      expect(error).toEqual(new ForbiddenException());
    }
  });

  it('[5.7] pertenencia válida pero foto_presente=false -> 404, no 403', async () => {
    const { servicio, candidatoFindUnique } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_MUNICIPIO_SIN_FOTO]),
    });

    await expect(servicio.obtenerFoto('dv-1', 'candidato-1', SESION)).rejects.toBeInstanceOf(NotFoundException);
    expect(candidatoFindUnique).not.toHaveBeenCalled();
  });

  it('[5.8] pertenencia válida pero plan_trabajo_presente=false -> 404, no 403', async () => {
    const { servicio, listaFindUnique } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_MUNICIPIO_SIN_PLAN]),
    });

    await expect(servicio.obtenerPlanTrabajo('dv-1', 'lista-1', SESION)).rejects.toBeInstanceOf(NotFoundException);
    expect(listaFindUnique).not.toHaveBeenCalled();
  });

  it('[5.9] camino feliz — foto de candidato cabeza de lista servida con buffer+mime', async () => {
    const buffer = Buffer.from('foto-bytes');
    const { servicio } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_MUNICIPIO_CON_FOTO]),
      candidatoFindUnique: jest.fn().mockResolvedValue({ foto: buffer, foto_mime: 'image/jpeg' }),
    });

    const resultado = await servicio.obtenerFoto('dv-1', 'candidato-1', SESION);

    expect(resultado).toEqual({ buffer, mime: 'image/jpeg' });
  });

  it('[5.10] en los 5 caminos 403, los bytes (candidato.findUnique/lista.findUnique) NUNCA se leen', async () => {
    const { servicio: ajeno, candidatoFindUnique: c1, listaFindUnique: l1 } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_AJENO),
    });
    const { servicio: inexistente, candidatoFindUnique: c2, listaFindUnique: l2 } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(null),
    });
    const { servicio: otroProceso, candidatoFindUnique: c3, listaFindUnique: l3 } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_MUNICIPIO_CON_FOTO]),
    });
    const { servicio: deBaja, candidatoFindUnique: c4, listaFindUnique: l4 } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue(DV_PROPIO),
      obtenerOpciones: jest.fn().mockResolvedValue([]),
    });
    const { servicio: consulta, candidatoFindUnique: c5, listaFindUnique: l5 } = construirServicio({
      derechoVotoFindUnique: jest.fn().mockResolvedValue({ ...DV_PROPIO, proceso: { id: 'proceso-1', tipo: 'consulta' } }),
      obtenerOpciones: jest.fn().mockResolvedValue([OPCION_CONSULTA]),
    });

    await Promise.all(
      [
        ajeno.obtenerPlanTrabajo('dv-1', 'candidato-1', SESION),
        inexistente.obtenerPlanTrabajo('dv-inexistente', 'candidato-1', SESION),
        otroProceso.obtenerPlanTrabajo('dv-1', 'candidato-de-otro-proceso', SESION),
        deBaja.obtenerPlanTrabajo('dv-1', 'candidato-1', SESION),
        consulta.obtenerPlanTrabajo('dv-1', 'opcion-1', SESION),
      ].map((p) => p.catch(() => undefined)),
    );

    for (const mock of [c1, c2, c3, c4, c5, l1, l2, l3, l4, l5]) {
      expect(mock).not.toHaveBeenCalled();
    }
  });
});
