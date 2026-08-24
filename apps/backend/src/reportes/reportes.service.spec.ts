import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { construirModelo } from './dimensiones';
import { ReportesService } from './reportes.service';

/**
 * reportes-y-exportaciones (#18, PR3; design.md D4/D7.1, tareas 8.1-8.4). `PrismaService`
 * mockeado, patrón `procesos.service.spec.ts`. `construirModelo()` (PR2) se mockea aquí: su
 * comportamiento interno (gate=true ⇒ nunca `calcularEscrutinio`) ya está probado en
 * `dimensiones.spec.ts` (5.2) — este archivo prueba que el SERVICIO calcula `gate` correctamente
 * y lo propaga, sin abrir transacción cuando la validación falla antes.
 */
jest.mock('./dimensiones', () => ({
  construirModelo: jest.fn().mockResolvedValue({
    version: 1,
    dimension: 'resultados',
    formato: 'pdf',
    titulo: 'Resultados',
    generado_en: '2026-08-23T10:00:00.000Z',
    meta: [],
    secciones: [],
    notas: [],
  }),
}));

const construirModeloMock = construirModelo as jest.Mock;

function construirPrisma(overrides: {
  transactionImpl?: jest.Mock;
  procesoElectoralFindUnique?: jest.Mock;
  reporteCreate?: jest.Mock;
  reporteFindUnique?: jest.Mock;
}) {
  const procesoElectoralFindUnique = overrides.procesoElectoralFindUnique ?? jest.fn().mockResolvedValue(null);
  const reporteCreate =
    overrides.reporteCreate ??
    jest.fn().mockResolvedValue({
      id: 'reporte-1',
      proceso_id: '11111111-1111-1111-1111-111111111111',
      dimension: 'resultados',
      formato: 'pdf',
      estado: 'borrador',
      gate_aplicado: null,
      contenido: {},
      archivo: null,
      archivo_mime: null,
      archivo_nombre: null,
      solicitado_por: 'actor-1',
      creado_en: new Date('2026-08-23T10:00:00.000Z'),
      emitido_en: null,
    });
  const reporteFindUnique = overrides.reporteFindUnique ?? jest.fn().mockResolvedValue(null);

  const tx = {
    procesoElectoral: { findUnique: procesoElectoralFindUnique },
    reporte: { create: reporteCreate },
  };

  const transactionMock =
    overrides.transactionImpl ?? jest.fn((cb: (tx: unknown) => Promise<unknown>) => cb(tx));

  const prisma = {
    $transaction: transactionMock,
    reporte: { findUnique: reporteFindUnique },
  };

  return { prisma, tx, procesoElectoralFindUnique, reporteCreate, reporteFindUnique, transactionMock };
}

const REPORTE_BASE = {
  id: 'reporte-1',
  proceso_id: '11111111-1111-1111-1111-111111111111',
  dimension: 'resultados',
  formato: 'pdf',
  estado: 'emitida',
  gate_aplicado: false,
  archivo: Buffer.from('%PDF-1.4'),
  archivo_mime: 'application/pdf',
  archivo_nombre: 'reporte.pdf',
  solicitado_por: 'actor-1',
  creado_en: new Date('2026-08-23T10:00:00.000Z'),
  emitido_en: new Date('2026-08-23T10:05:00.000Z'),
  proceso: { ocultar_resultados: false },
};

const PROCESO_VISIBLE = { id: '11111111-1111-1111-1111-111111111111', tipo: 'municipio', ocultar_resultados: false };
const PROCESO_OCULTO = { id: '11111111-1111-1111-1111-111111111111', tipo: 'municipio', ocultar_resultados: true };

describe('ReportesService.solicitar() — validación manual (D4, 8.1)', () => {
  beforeEach(() => construirModeloMock.mockClear());

  it('[8.1] dimension fuera del enum -> 400 CAMPO_INVALIDO sin abrir transacción', async () => {
    const { prisma, transactionMock } = construirPrisma({});
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(
      servicio.solicitar({ proceso_id: '11111111-1111-1111-1111-111111111111', dimension: 'auditoria', formato: 'pdf' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('[8.1] formato fuera del enum -> 400 CAMPO_INVALIDO sin abrir transacción', async () => {
    const { prisma, transactionMock } = construirPrisma({});
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(
      servicio.solicitar({ proceso_id: '11111111-1111-1111-1111-111111111111', dimension: 'resultados', formato: 'word' }, 'actor-1'),
    ).rejects.toMatchObject({ response: { codigo: 'CAMPO_INVALIDO', campo: 'formato' } });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('[8.1] proceso_id no-UUID -> 400 CAMPO_INVALIDO sin abrir transacción', async () => {
    const { prisma, transactionMock } = construirPrisma({});
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(
      servicio.solicitar({ proceso_id: 'no-es-uuid', dimension: 'resultados', formato: 'pdf' }, 'actor-1'),
    ).rejects.toMatchObject({ response: { codigo: 'CAMPO_INVALIDO', campo: 'proceso_id' } });
    expect(transactionMock).not.toHaveBeenCalled();
  });
});

describe('ReportesService.solicitar() — proceso inexistente (8.2)', () => {
  it('[8.2] proceso_id inexistente -> 404 sin crear fila', async () => {
    const { prisma, reporteCreate } = construirPrisma({
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(null),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(
      servicio.solicitar(
        { proceso_id: '123e4567-e89b-12d3-a456-426614174000', dimension: 'resultados', formato: 'pdf' },
        'actor-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(reporteCreate).not.toHaveBeenCalled();
  });
});

describe('ReportesService.solicitar() — solicitado_por y gate (8.3/8.4)', () => {
  beforeEach(() => construirModeloMock.mockClear());

  it('[8.3] solicitado_por se toma del actor autenticado, nunca del cuerpo', async () => {
    const { prisma, reporteCreate } = construirPrisma({
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(PROCESO_VISIBLE),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await servicio.solicitar(
      { proceso_id: '11111111-1111-1111-1111-111111111111', dimension: 'resultados', formato: 'pdf' },
      'actor-real',
    );

    expect(reporteCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ solicitado_por: 'actor-real' }) }),
    );
  });

  it('[8.4] dimension sensible + ocultar_resultados=true -> construirModelo recibe gate:true', async () => {
    const { prisma } = construirPrisma({
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(PROCESO_OCULTO),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await servicio.solicitar({ proceso_id: '11111111-1111-1111-1111-111111111111', dimension: 'resultados', formato: 'pdf' }, 'actor-1');

    expect(construirModeloMock).toHaveBeenCalledWith(
      'resultados',
      expect.anything(),
      expect.objectContaining({ gate: true }),
    );
  });

  it('[8.4] dimension no sensible + ocultar_resultados=true -> construirModelo recibe gate:false', async () => {
    const { prisma } = construirPrisma({
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(PROCESO_OCULTO),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await servicio.solicitar({ proceso_id: '11111111-1111-1111-1111-111111111111', dimension: 'candidatos', formato: 'pdf' }, 'actor-1');

    expect(construirModeloMock).toHaveBeenCalledWith(
      'candidatos',
      expect.anything(),
      expect.objectContaining({ gate: false }),
    );
  });

  it('[8.4] dimension sensible + ocultar_resultados=false -> construirModelo recibe gate:false', async () => {
    const { prisma } = construirPrisma({
      procesoElectoralFindUnique: jest.fn().mockResolvedValue(PROCESO_VISIBLE),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await servicio.solicitar({ proceso_id: '11111111-1111-1111-1111-111111111111', dimension: 'participacion', formato: 'excel' }, 'actor-1');

    expect(construirModeloMock).toHaveBeenCalledWith(
      'participacion',
      expect.anything(),
      expect.objectContaining({ gate: false }),
    );
  });
});

describe('ReportesService.obtener() — GET /reportes/:id (D8)', () => {
  it('reporte existente -> detalle sin contenido ni archivo bytes', async () => {
    const { prisma } = construirPrisma({
      reporteFindUnique: jest.fn().mockResolvedValue(REPORTE_BASE),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    const detalle = await servicio.obtener('reporte-1');

    expect(detalle).not.toHaveProperty('contenido');
    expect(detalle).not.toHaveProperty('archivo');
    expect(detalle.archivo_disponible).toBe(true);
    expect(detalle.archivo_bytes).toBe(REPORTE_BASE.archivo.length);
  });

  it('reporte inexistente -> 404', async () => {
    const { prisma } = construirPrisma({ reporteFindUnique: jest.fn().mockResolvedValue(null) });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(servicio.obtener('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReportesService.archivo() — GET /reportes/:id/archivo (D7.3/D8)', () => {
  it('estado borrador -> 409 REPORTE_NO_EMITIDO', async () => {
    const { prisma } = construirPrisma({
      reporteFindUnique: jest.fn().mockResolvedValue({ ...REPORTE_BASE, estado: 'borrador', archivo: null }),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(servicio.archivo('reporte-1')).rejects.toMatchObject({
      response: { codigo: 'REPORTE_NO_EMITIDO', estado: 'borrador' },
    });
  });

  it('estado fallido -> 409 REPORTE_NO_EMITIDO', async () => {
    const { prisma } = construirPrisma({
      reporteFindUnique: jest.fn().mockResolvedValue({ ...REPORTE_BASE, estado: 'fallido', archivo: null }),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(servicio.archivo('reporte-1')).rejects.toMatchObject({
      response: { codigo: 'REPORTE_NO_EMITIDO', estado: 'fallido' },
    });
  });

  it('reporte inexistente -> 404', async () => {
    const { prisma } = construirPrisma({ reporteFindUnique: jest.fn().mockResolvedValue(null) });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(servicio.archivo('no-existe')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('emitida, gate_aplicado=false, política vigente ya oculta -> 409 REPORTE_NO_DISPONIBLE (D7.3)', async () => {
    const { prisma } = construirPrisma({
      reporteFindUnique: jest.fn().mockResolvedValue({
        ...REPORTE_BASE,
        dimension: 'resultados',
        gate_aplicado: false,
        proceso: { ocultar_resultados: true },
      }),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    await expect(servicio.archivo('reporte-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(servicio.archivo('reporte-1')).rejects.toMatchObject({
      response: { codigo: 'REPORTE_NO_DISPONIBLE' },
    });
  });

  it('emitida, gate_aplicado=true (podado) -> 200 aunque la política siga oculta', async () => {
    const { prisma } = construirPrisma({
      reporteFindUnique: jest.fn().mockResolvedValue({
        ...REPORTE_BASE,
        dimension: 'resultados',
        gate_aplicado: true,
        proceso: { ocultar_resultados: true },
      }),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    const resultado = await servicio.archivo('reporte-1');
    expect(resultado.buffer.equals(REPORTE_BASE.archivo)).toBe(true);
    expect(resultado.mime).toBe('application/pdf');
    expect(resultado.nombre).toBe('reporte.pdf');
  });

  it('dimensión no sensible, política oculta -> 200 sin aplicar el gate (D7)', async () => {
    const { prisma } = construirPrisma({
      reporteFindUnique: jest.fn().mockResolvedValue({
        ...REPORTE_BASE,
        dimension: 'candidatos',
        gate_aplicado: false,
        proceso: { ocultar_resultados: true },
      }),
    });
    const servicio = new ReportesService(prisma as unknown as PrismaService);

    const resultado = await servicio.archivo('reporte-1');
    expect(resultado.buffer.equals(REPORTE_BASE.archivo)).toBe(true);
  });
});
