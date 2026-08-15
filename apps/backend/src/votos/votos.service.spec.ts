import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { SesionUsuario } from '../auth/sesion-usuario';
import type { PrismaService } from '../prisma/prisma.service';
import { VotosService } from './votos.service';

/**
 * vote-casting, PR2 (design.md D2-D5/D7/D8/D10/D12/D16, Phases 6-9). Unit tests con
 * `PrismaService`/`AuditoriaService` mockeados, `tx.$queryRaw` como `jest.fn()` — mismo criterio
 * que `procesos.service.spec.ts` (`abrir()`). La garantía transaccional completa (validación +
 * `UNIQUE` + idempotencia) vive en `VotosService.emitir()`, sin descomponer (restricción de
 * no-descomposición del BACKLOG, ver proposal.md).
 */

const SESION: SesionUsuario = { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 };

const DTO_BASE = {
  derecho_voto_id: 'dv-1',
  lista_id: 'lista-1',
  clave_idempotencia: 'clave-1',
};

function filaValidacionBase(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'dv-1',
    usuario_id: 'usuario-1',
    proceso_id: 'proceso-1',
    tipo: 'municipio',
    fecha_cierre_prevista: new Date('2026-09-05T18:00:00.000Z'),
    cerrado_por_hora: false,
    aun_no_abierto: false,
    aula_valida: true,
    voto_id: null,
    voto_codigo_comprobante: null,
    voto_hora_servidor: null,
    comprobante_por_clave: null,
    hora_por_clave: null,
    ...overrides,
  };
}

function construirPrisma(overrides: {
  queryRaw?: jest.Mock;
  votoCreate?: jest.Mock;
  votoFindFirst?: jest.Mock;
  listaFindUnique?: jest.Mock;
  opcionConsultaFindUnique?: jest.Mock;
  candidatoFindUnique?: jest.Mock;
  transactionImpl?: jest.Mock;
}) {
  const queryRaw = overrides.queryRaw ?? jest.fn().mockResolvedValue([filaValidacionBase()]);
  const votoCreate =
    overrides.votoCreate ??
    jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...data,
        hora_servidor: new Date('2026-09-02T10:00:00.000Z'),
      }),
    );
  const votoFindFirst = overrides.votoFindFirst ?? jest.fn().mockResolvedValue(null);
  const listaFindUnique =
    overrides.listaFindUnique ??
    jest.fn().mockResolvedValue({ id: 'lista-1', proceso_id: 'proceso-1', estado: 'activo' });
  const opcionConsultaFindUnique = overrides.opcionConsultaFindUnique ?? jest.fn().mockResolvedValue(null);
  const candidatoFindUnique = overrides.candidatoFindUnique ?? jest.fn().mockResolvedValue(null);

  const tx = {
    $queryRaw: queryRaw,
    voto: { create: votoCreate },
    lista: { findUnique: listaFindUnique },
    opcionConsulta: { findUnique: opcionConsultaFindUnique },
    candidato: { findUnique: candidatoFindUnique },
  };

  const prisma = {
    voto: { findFirst: votoFindFirst },
    $transaction: overrides.transactionImpl ?? jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx)),
  };

  return { prisma, tx, queryRaw, votoCreate, votoFindFirst, listaFindUnique, opcionConsultaFindUnique, candidatoFindUnique };
}

function construirServicio(prisma: unknown) {
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };
  const servicio = new VotosService(prisma as unknown as PrismaService, auditoria as unknown as AuditoriaService);
  return { servicio, auditoria };
}

// 6.1: elección no-exactamente-una -> 400 CAMPO_INVALIDO, sin abrir transacción.
describe('VotosService.emitir() — elección exactamente una (tarea 6.1)', () => {
  it('[6.1] ninguna elección marcada -> 400 CAMPO_INVALIDO, sin abrir transacción', async () => {
    const { prisma } = construirPrisma({});
    const { servicio } = construirServicio(prisma);

    await expect(
      servicio.emitir({ derecho_voto_id: 'dv-1', clave_idempotencia: 'c1' }, SESION),
    ).rejects.toMatchObject({ response: { codigo: 'CAMPO_INVALIDO', campo: 'eleccion' } });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[6.1 triangulación] dos elecciones marcadas (lista + blanco) -> 400 CAMPO_INVALIDO, sin abrir transacción', async () => {
    const { prisma } = construirPrisma({});
    const { servicio } = construirServicio(prisma);

    await expect(
      servicio.emitir({ ...DTO_BASE, blanco: true }, SESION),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// 6.2: derecho_voto_id no pertenece al usuario, o 0 filas -> 403, sin evento RECHAZO.
describe('VotosService.emitir() — derecho ajeno o inexistente (tarea 6.2)', () => {
  it('[6.2] 0 filas -> 403, sin RECHAZO', async () => {
    const { prisma } = construirPrisma({ queryRaw: jest.fn().mockResolvedValue([]) });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  it('[6.2 triangulación] derecho ajeno (usuario_id distinto) -> 403, sin RECHAZO', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([filaValidacionBase({ usuario_id: 'otro-usuario' })]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditoria.log).not.toHaveBeenCalled();
  });
});

// 6.3: comprobante_por_clave no nulo -> responde con el comprobante existente, sin INSERT.
describe('VotosService.emitir() — reintento con misma clave (tarea 6.3)', () => {
  it('[6.3] comprobante_por_clave presente -> creado:false, sin tx.voto.create', async () => {
    const { prisma, tx, votoCreate } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([
        filaValidacionBase({
          comprobante_por_clave: 'K7QM-3XZ9-8HTB-P4WR',
          hora_por_clave: new Date('2026-09-02T09:00:00.000Z'),
        }),
      ]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    const resultado = await servicio.emitir(DTO_BASE, SESION);

    expect(resultado).toMatchObject({
      creado: false,
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      proceso_id: 'proceso-1',
      derecho_voto_id: 'dv-1',
    });
    expect(votoCreate).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

// 6.4: aula_valida=false (D8) -> RechazoVoto(SIN_DERECHO, motivo aula_no_corresponde).
describe('VotosService.emitir() — aula que no corresponde (D8, tarea 6.4)', () => {
  it('[6.4] aula_valida=false -> 409 SIN_DERECHO, evento RECHAZO con motivo aula_no_corresponde', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([filaValidacionBase({ aula_valida: false })]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({
      response: { codigo: 'SIN_DERECHO' },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'RECHAZO',
      'usuario-1',
      'DerechoVoto',
      'dv-1',
      expect.objectContaining({ motivo: 'aula_no_corresponde', proceso_id: 'proceso-1' }),
    );
  });
});

// 6.5: cerrado_por_hora | aun_no_abierto -> RechazoVoto(VOTACION_CERRADA).
describe('VotosService.emitir() — proceso cerrado o no abierto (tarea 6.5)', () => {
  it('[6.5] cerrado_por_hora=true -> 409 VOTACION_CERRADA con cierre, evento RECHAZO motivo proceso_cerrado', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([filaValidacionBase({ cerrado_por_hora: true })]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({
      response: { codigo: 'VOTACION_CERRADA', cierre: '2026-09-05T18:00:00.000Z' },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'RECHAZO',
      'usuario-1',
      'DerechoVoto',
      'dv-1',
      expect.objectContaining({ motivo: 'proceso_cerrado' }),
    );
  });

  it('[6.5 triangulación] aun_no_abierto=true -> 409 VOTACION_CERRADA, motivo proceso_no_abierto', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([filaValidacionBase({ aun_no_abierto: true })]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({
      response: { codigo: 'VOTACION_CERRADA' },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'RECHAZO',
      'usuario-1',
      'DerechoVoto',
      'dv-1',
      expect.objectContaining({ motivo: 'proceso_no_abierto' }),
    );
  });
});

// 6.6: voto_id ya existe (clave distinta) -> RechazoVoto(DERECHO_YA_EJERCIDO, comprobante) -> 200-shape.
describe('VotosService.emitir() — derecho ya ejercido (tarea 6.6)', () => {
  it('[6.6] voto_id no nulo -> responde con el comprobante ya emitido (creado:false), evento RECHAZO', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([
        filaValidacionBase({
          voto_id: 'voto-existente',
          voto_codigo_comprobante: 'ABCD-EFGH-JKMN-PQRS',
          voto_hora_servidor: new Date('2026-09-01T08:00:00.000Z'),
        }),
      ]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    const resultado = await servicio.emitir(DTO_BASE, SESION);

    expect(resultado).toMatchObject({ creado: false, codigo_comprobante: 'ABCD-EFGH-JKMN-PQRS' });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'RECHAZO',
      'usuario-1',
      'DerechoVoto',
      'dv-1',
      expect.objectContaining({ motivo: 'derecho_ya_ejercido' }),
    );
  });
});

// 7.1-7.6: camino feliz — INSERT, auditoría VOTO, marcador D16.
describe('VotosService.emitir() — camino feliz (D2/D11, tareas 7.1/7.4/7.5)', () => {
  it('[7.1] inserta Voto, DerechoVoto queda ejercido por la existencia de la fila (sin columna), responde creado:true', async () => {
    const { prisma, votoCreate } = construirPrisma({});
    const { servicio, auditoria } = construirServicio(prisma);

    const resultado = await servicio.emitir(DTO_BASE, SESION);

    expect(resultado.creado).toBe(true);
    expect(votoCreate).toHaveBeenCalledTimes(1);
    expect(votoCreate.mock.calls[0][0].data).toMatchObject({
      proceso_id: 'proceso-1',
      derecho_voto_id: 'dv-1',
      lista_id: 'lista-1',
      blanco: false,
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'VOTO',
      'usuario-1',
      'Voto',
      expect.any(String),
      expect.objectContaining({ proceso_id: 'proceso-1', derecho_voto_id: 'dv-1' }),
    );
  });

  it('[7.2] voto en blanco -> Voto.blanco=true y el resto de columnas de elección en null', async () => {
    const { prisma, votoCreate } = construirPrisma({});
    const { servicio } = construirServicio(prisma);

    await servicio.emitir({ derecho_voto_id: 'dv-1', clave_idempotencia: 'c1', blanco: true }, SESION);

    expect(votoCreate.mock.calls[0][0].data).toMatchObject({
      blanco: true,
      lista_id: null,
      opcion_id: null,
      candidato_id: null,
    });
  });

  it('[7.3] lista de otro proceso -> 409 ELECCION_INVALIDA, sin tx.voto.create', async () => {
    const { prisma, votoCreate } = construirPrisma({
      listaFindUnique: jest.fn().mockResolvedValue({ id: 'lista-1', proceso_id: 'otro-proceso', estado: 'activo' }),
    });
    const { servicio } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({
      response: { codigo: 'ELECCION_INVALIDA' },
    });
    expect(votoCreate).not.toHaveBeenCalled();
  });

  it('[7.3 triangulación] lista dada de baja -> 409 ELECCION_INVALIDA', async () => {
    const { prisma, votoCreate } = construirPrisma({
      listaFindUnique: jest.fn().mockResolvedValue({ id: 'lista-1', proceso_id: 'proceso-1', estado: 'baja' }),
    });
    const { servicio } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({
      response: { codigo: 'ELECCION_INVALIDA' },
    });
    expect(votoCreate).not.toHaveBeenCalled();
  });

  it('[7.4] el payload de VOTO no contiene claves prohibidas de elección', async () => {
    const { prisma } = construirPrisma({});
    const { servicio, auditoria } = construirServicio(prisma);

    await servicio.emitir(DTO_BASE, SESION);

    const payload = auditoria.log.mock.calls[0][5];
    expect(payload).not.toHaveProperty('candidato_id');
    expect(payload).not.toHaveProperty('lista_id');
    expect(payload).not.toHaveProperty('opcion_id');
    expect(payload).not.toHaveProperty('blanco');
    expect(payload).not.toHaveProperty('eleccion');
  });
});

// 8.1-8.5: colisión 23505 fuera del callback + RECHAZO en transacción separada.
describe('VotosService.emitir() — colisión 23505 fuera del callback (D5, tareas 8.1/8.2)', () => {
  it('[8.1] P2002 sobre Voto_proceso_id_derecho_voto_id_key -> reconsulta y responde con el comprobante existente', async () => {
    const error = { code: 'P2002', meta: { target: 'Voto_proceso_id_derecho_voto_id_key' } };
    const { prisma, votoFindFirst } = construirPrisma({
      transactionImpl: jest.fn().mockRejectedValueOnce(error),
    });
    votoFindFirst.mockResolvedValue({
      proceso_id: 'proceso-1',
      derecho_voto_id: 'dv-1',
      codigo_comprobante: 'GANADOR-0000-0000-0000',
      hora_servidor: new Date('2026-09-01T08:00:00.000Z'),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    const resultado = await servicio.emitir(DTO_BASE, SESION);

    expect(resultado).toMatchObject({ creado: false, codigo_comprobante: 'GANADOR-0000-0000-0000' });
    expect(votoFindFirst).toHaveBeenCalledWith({ where: { derecho_voto_id: 'dv-1' } });
    // La colisión NO es un RechazoVoto: no dispara la segunda $transaction de auditoría RECHAZO.
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  it('[8.1 triangulación] P2002 sobre Voto_proceso_id_clave_idempotencia_key -> mismo camino de reconsulta', async () => {
    const error = { code: 'P2002', meta: { target: ['Voto_proceso_id_clave_idempotencia_key'] } };
    const { prisma, votoFindFirst } = construirPrisma({
      transactionImpl: jest.fn().mockRejectedValueOnce(error),
    });
    votoFindFirst.mockResolvedValue({
      proceso_id: 'proceso-1',
      derecho_voto_id: 'dv-1',
      codigo_comprobante: 'GANADOR-0000-0000-0000',
      hora_servidor: new Date('2026-09-01T08:00:00.000Z'),
    });
    const { servicio } = construirServicio(prisma);

    const resultado = await servicio.emitir(DTO_BASE, SESION);
    expect(resultado.creado).toBe(false);
  });

  it('[8.2] P2002 con meta.target distinto a las dos restricciones de voto -> burbujea, no se confunde con colisión de voto', async () => {
    const error = { code: 'P2002', meta: { target: 'Usuario_correo_key' } };
    const { prisma } = construirPrisma({
      transactionImpl: jest.fn().mockRejectedValueOnce(error),
    });
    const { servicio } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toBe(error);
  });
});

describe('VotosService.emitir() — RechazoVoto en transacción separada (D10, tareas 8.3/8.4)', () => {
  it('[8.3] RechazoVoto dispara una $transaction nueva para auditoria.log(RECHAZO) antes de lanzar la excepción HTTP', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([filaValidacionBase({ cerrado_por_hora: true })]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({ response: { codigo: 'VOTACION_CERRADA' } });

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(auditoria.log).toHaveBeenCalledTimes(1);
  });

  it('[8.4] el payload de RECHAZO contiene únicamente proceso_id/derecho_voto_id/motivo — nunca la elección', async () => {
    const { prisma } = construirPrisma({
      queryRaw: jest.fn().mockResolvedValue([filaValidacionBase({ cerrado_por_hora: true })]),
    });
    const { servicio, auditoria } = construirServicio(prisma);

    await expect(servicio.emitir(DTO_BASE, SESION)).rejects.toMatchObject({ response: { codigo: 'VOTACION_CERRADA' } });

    const payload = auditoria.log.mock.calls[0][5];
    expect(Object.keys(payload).sort()).toEqual(['derecho_voto_id', 'motivo', 'proceso_id']);
  });
});
