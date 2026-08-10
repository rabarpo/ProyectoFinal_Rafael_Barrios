import { BadRequestException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { ConfiguracionLecturaService } from './configuracion-lectura.service';
import { ConfiguracionService } from './configuracion.service';

/**
 * configuracion-general, PR2 (design.md "Data Flow"/D9, tarea 2.5). Unit test con
 * `PrismaService`/`ConfiguracionLecturaService`/`AuditoriaService` mockeados — sin Postgres real,
 * mismo criterio que `anios-escolares.service.spec.ts`. Cubre la orquestación de `actualizar()`:
 * merge parcial, cálculo de `camposModificados`, los dos eventos de auditoría (D9) y que un fallo
 * de `auditoria.log` dentro del callback de `$transaction` se propaga (con Postgres real esto es
 * lo que dispara el rollback — la prueba de rollback contra Postgres real vive en
 * `test/configuracion/configuracion.e2e-spec.ts`, DESVIACIÓN declarada por falta de Docker en este
 * entorno, mismo criterio que PR1).
 */

const FILA_BASE = {
  id: 'c1',
  clave: 'institucional',
  anio_escolar_id: 'a1',
  smtp_host: null,
  smtp_puerto: null,
  smtp_remitente: null,
  nombre: 'SEEI',
  director: null,
  color_primario: null,
  color_secundario: null,
  zona_horaria: 'America/Lima',
  dominios_google: [] as string[],
  logo: null as Buffer | null,
  logo_mime: null as string | null,
  logo_actualizado_en: null as Date | null,
  actualizado_en: new Date('2026-08-09T00:00:00.000Z'),
};

function construirServicio(overrides: {
  findUniqueOrThrow?: jest.Mock;
  update?: jest.Mock;
  auditoriaLog?: jest.Mock;
  lecturaObtener?: jest.Mock;
}) {
  const configuracion = {
    findUniqueOrThrow: overrides.findUniqueOrThrow ?? jest.fn().mockResolvedValue(FILA_BASE),
    update: overrides.update ?? jest.fn().mockResolvedValue(FILA_BASE),
  };
  const tx = { configuracion };
  const prisma = {
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: overrides.auditoriaLog ?? jest.fn().mockResolvedValue(undefined) };
  const lectura = {
    obtener: overrides.lecturaObtener ?? jest.fn().mockResolvedValue(FILA_BASE),
  };

  const servicio = new ConfiguracionService(
    prisma as unknown as PrismaService,
    lectura as unknown as ConfiguracionLecturaService,
    auditoria as unknown as AuditoriaService,
  );

  return { servicio, tx, prisma, auditoria, lectura, configuracion };
}

describe('ConfiguracionService.actualizar() (D9, tarea 2.5)', () => {
  it('[2.5] persiste campos simples y audita CONFIGURACION_ACTUALIZADA con los campos modificados', async () => {
    const actualizado = { ...FILA_BASE, nombre: 'Colegio SEEI', color_primario: '#1A2B3C' };
    const { servicio, auditoria, configuracion } = construirServicio({
      update: jest.fn().mockResolvedValue(actualizado),
    });

    const resultado = await servicio.actualizar(
      { nombre: 'Colegio SEEI', color_primario: '#1A2B3C' },
      'actor-1',
    );

    expect(resultado.nombre).toBe('Colegio SEEI');
    expect(resultado.color_primario).toBe('#1A2B3C');
    expect(configuracion.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { nombre: 'Colegio SEEI', color_primario: '#1A2B3C' },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'CONFIGURACION_ACTUALIZADA',
      'actor-1',
      'Configuracion',
      'c1',
      { campos: ['nombre', 'color_primario'] },
    );
    expect(auditoria.log).toHaveBeenCalledTimes(1);
  });

  it('[2.5] cambio de dominios_google audita CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO con antes/después', async () => {
    const actualizado = { ...FILA_BASE, dominios_google: ['colegio.edu.pe'] };
    const { servicio, auditoria } = construirServicio({
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...FILA_BASE, dominios_google: [] }),
      update: jest.fn().mockResolvedValue(actualizado),
    });

    await servicio.actualizar({ dominios_google: ['colegio.edu.pe'] }, 'actor-1');

    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO',
      'actor-1',
      'Configuracion',
      'c1',
      { antes: [], despues: ['colegio.edu.pe'] },
    );
  });

  it('[2.5] campos simples y dominios_google juntos auditan los dos eventos en la misma transacción', async () => {
    const actualizado = { ...FILA_BASE, nombre: 'Colegio SEEI', dominios_google: ['colegio.edu.pe'] };
    const { servicio, auditoria } = construirServicio({
      update: jest.fn().mockResolvedValue(actualizado),
    });

    await servicio.actualizar({ nombre: 'Colegio SEEI', dominios_google: ['colegio.edu.pe'] }, 'actor-1');

    expect(auditoria.log).toHaveBeenCalledTimes(2);
  });

  it('[2.5] sin cambios efectivos es un no-op: no llama update() ni auditoria.log()', async () => {
    const { servicio, auditoria, configuracion } = construirServicio({});

    const resultado = await servicio.actualizar({ nombre: 'SEEI' }, 'actor-1');

    expect(resultado.nombre).toBe('SEEI');
    expect(configuracion.update).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  it('[2.5] un fallo de auditoria.log() dentro del callback de $transaction se propaga (rollback con Postgres real)', async () => {
    const { servicio, prisma } = construirServicio({
      auditoriaLog: jest.fn().mockRejectedValue(new Error('fallo de auditoría')),
    });

    await expect(servicio.actualizar({ nombre: 'Colegio SEEI' }, 'actor-1')).rejects.toThrow(
      'fallo de auditoría',
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('[2.4] color_primario inválido se rechaza antes de abrir la transacción', async () => {
    const { servicio, prisma } = construirServicio({});

    await expect(servicio.actualizar({ color_primario: 'azul' }, 'actor-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[2.4] dominios_google con un elemento inválido se rechaza antes de abrir la transacción', async () => {
    const { servicio, prisma } = construirServicio({});

    await expect(
      servicio.actualizar({ dominios_google: ['colegio.edu.pe', 'no valido'] }, 'actor-1'),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // [4.7][D3][R2 envio-correo]: PUT /configuracion también puede actualizar smtp_host/puerto/
  // remitente — sin este campo escribible, el escenario "Actualizar el host SMTP vía PUT
  // /configuracion afecta el próximo envío" no tiene forma de disparar el cambio.
  it('[4.7] persiste smtp_host/smtp_puerto/smtp_remitente y audita CONFIGURACION_ACTUALIZADA', async () => {
    const actualizado = {
      ...FILA_BASE,
      smtp_host: 'smtp.nuevo.test',
      smtp_puerto: 2525,
      smtp_remitente: 'no-responder@nuevo.test',
    };
    const { servicio, auditoria, configuracion } = construirServicio({
      update: jest.fn().mockResolvedValue(actualizado),
    });

    await servicio.actualizar(
      {
        smtp_host: 'smtp.nuevo.test',
        smtp_puerto: 2525,
        smtp_remitente: 'no-responder@nuevo.test',
      },
      'actor-1',
    );

    expect(configuracion.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: {
        smtp_host: 'smtp.nuevo.test',
        smtp_puerto: 2525,
        smtp_remitente: 'no-responder@nuevo.test',
      },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'CONFIGURACION_ACTUALIZADA',
      'actor-1',
      'Configuracion',
      'c1',
      { campos: ['smtp_host', 'smtp_puerto', 'smtp_remitente'] },
    );
  });
});

describe('ConfiguracionService.obtener()', () => {
  it('delega en ConfiguracionLecturaService.obtener() y mapea la respuesta sin bytes de logo', async () => {
    const { servicio } = construirServicio({});

    const resultado = await servicio.obtener();

    expect(resultado).toMatchObject({
      id: 'c1',
      nombre: 'SEEI',
      dominios_google: [],
      logo_presente: false,
      logo_mime: null,
    });
  });

  it('con logo persistido, logo_presente es true y logo_mime refleja la fila real', async () => {
    const { servicio } = construirServicio({
      lecturaObtener: jest
        .fn()
        .mockResolvedValue({ ...FILA_BASE, logo: Buffer.from('png'), logo_mime: 'image/png' }),
    });

    const resultado = await servicio.obtener();

    expect(resultado.logo_presente).toBe(true);
    expect(resultado.logo_mime).toBe('image/png');
  });
});

/**
 * PR3 (design.md "Data Flow"/D9, tarea 3.5, spec "Subida de logo institucional"). Complementa el
 * round-trip `bytea` real (`test/configuracion/configuracion.e2e-spec.ts`, tarea 3.4, DESVIACIÓN
 * declarada por falta de Docker) con la orquestación: persiste `logo`/`logo_mime`/
 * `logo_actualizado_en` dentro de la `$transaction` y audita `CONFIGURACION_LOGO_ACTUALIZADO`.
 */
describe('ConfiguracionService.actualizarLogo() (tarea 3.5)', () => {
  it('[3.4] persiste logo/logo_mime/logo_actualizado_en y audita CONFIGURACION_LOGO_ACTUALIZADO', async () => {
    const fechaLogo = new Date('2026-08-09T12:00:00.000Z');
    const actualizado = { ...FILA_BASE, logo: Buffer.from('contenido-png'), logo_mime: 'image/png', logo_actualizado_en: fechaLogo };
    const { servicio, auditoria, configuracion } = construirServicio({
      update: jest.fn().mockResolvedValue(actualizado),
    });

    const resultado = await servicio.actualizarLogo(
      { buffer: Buffer.from('contenido-png'), mimetype: 'image/png' },
      'actor-1',
    );

    expect(configuracion.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: expect.objectContaining({ logo_mime: 'image/png' }),
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'CONFIGURACION_LOGO_ACTUALIZADO',
      'actor-1',
      'Configuracion',
      'c1',
      { campos: ['logo'] },
    );
    expect(resultado).toEqual({ logo_mime: 'image/png', logo_actualizado_en: fechaLogo.toISOString() });
  });

  it('[3.6] un archivo de 0 bytes se rechaza con BadRequestException antes de abrir la transacción', async () => {
    const { servicio, prisma } = construirServicio({});

    await expect(
      servicio.actualizarLogo({ buffer: Buffer.alloc(0), mimetype: 'image/png' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('ConfiguracionService.obtenerLogo() (tarea 3.5)', () => {
  it('devuelve buffer/mime cuando hay logo persistido', async () => {
    const { servicio } = construirServicio({
      lecturaObtener: jest
        .fn()
        .mockResolvedValue({ ...FILA_BASE, logo: Buffer.from('contenido-svg'), logo_mime: 'image/svg+xml' }),
    });

    const resultado = await servicio.obtenerLogo();

    expect(resultado).toEqual({ buffer: Buffer.from('contenido-svg'), mime: 'image/svg+xml' });
  });

  it('devuelve null cuando no hay logo persistido (el controller lo traduce a 404)', async () => {
    const { servicio } = construirServicio({});

    const resultado = await servicio.obtenerLogo();

    expect(resultado).toBeNull();
  });
});
