import type { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionLecturaService } from './configuracion-lectura.service';

/**
 * configuracion-general, PR1 (design.md D2/D3, tarea 1.6). Unit test con `PrismaService`
 * mockeado — sin Postgres real, mismo criterio que `anios-escolares.service.spec.ts`. Cubre el
 * contrato de lectura consumido por `AuthModule`/`EmailModule` en PR4: fila ausente ⇒
 * valores "vacíos" (fail-closed para `dominiosGooglePermitidos()`, `null` para `smtp()`), fila
 * presente ⇒ los valores se devuelven tal cual, sin transformación.
 */

function construirServicio(findUnique: jest.Mock, anioEscolarFindFirst?: jest.Mock) {
  const prisma = {
    configuracion: { findUnique },
    anioEscolar: { findFirst: anioEscolarFindFirst ?? jest.fn() },
  };
  const servicio = new ConfiguracionLecturaService(prisma as unknown as PrismaService);
  return { servicio, prisma };
}

describe('ConfiguracionLecturaService (D2/D3)', () => {
  describe('fila clave=institucional ausente', () => {
    it('[1.6] obtener() retorna null', async () => {
      const { servicio } = construirServicio(jest.fn().mockResolvedValue(null));
      await expect(servicio.obtener()).resolves.toBeNull();
    });

    it('[1.6] smtp() retorna null', async () => {
      const { servicio } = construirServicio(jest.fn().mockResolvedValue(null));
      await expect(servicio.smtp()).resolves.toBeNull();
    });

    it('[1.6] dominiosGooglePermitidos() retorna [] (fail-closed)', async () => {
      const { servicio } = construirServicio(jest.fn().mockResolvedValue(null));
      await expect(servicio.dominiosGooglePermitidos()).resolves.toEqual([]);
    });
  });

  describe('fila clave=institucional presente con datos', () => {
    const fila = {
      id: 'c1',
      clave: 'institucional',
      anio_escolar_id: 'a1',
      smtp_host: 'smtp.real.local',
      smtp_puerto: 587,
      smtp_remitente: 'no-responder@real.local',
      nombre: 'SEEI',
      director: 'Ana Pérez',
      color_primario: '#1A2B3C',
      color_secundario: '#abc',
      zona_horaria: 'America/Lima',
      dominios_google: ['colegio.edu.pe'],
      actualizado_en: new Date('2026-08-09T00:00:00.000Z'),
    };

    it('[1.6] obtener() retorna la fila tal cual, sin transformación', async () => {
      const { servicio } = construirServicio(jest.fn().mockResolvedValue(fila));
      await expect(servicio.obtener()).resolves.toEqual(fila);
    });

    it('[1.6] smtp() retorna host/puerto/remitente tal cual', async () => {
      const { servicio } = construirServicio(jest.fn().mockResolvedValue(fila));
      await expect(servicio.smtp()).resolves.toEqual({
        host: 'smtp.real.local',
        puerto: 587,
        remitente: 'no-responder@real.local',
      });
    });

    it('[1.6] dominiosGooglePermitidos() retorna el arreglo tal cual', async () => {
      const { servicio } = construirServicio(jest.fn().mockResolvedValue(fila));
      await expect(servicio.dominiosGooglePermitidos()).resolves.toEqual(['colegio.edu.pe']);
    });

    it('[1.6] smtp() retorna null cuando smtp_host es null aunque la fila exista (fallback Console)', async () => {
      const { servicio } = construirServicio(
        jest.fn().mockResolvedValue({ ...fila, smtp_host: null }),
      );
      await expect(servicio.smtp()).resolves.toBeNull();
    });
  });

  it('[1.6] findUnique se invoca siempre con where: { clave: "institucional" }', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const { servicio } = construirServicio(findUnique);
    await servicio.obtener();
    expect(findUnique).toHaveBeenCalledWith({ where: { clave: 'institucional' } });
  });

  // administracion-procesos-electorales, PR4 (design.md D2b, tarea 9.1). `anioEscolarActivoId()`
  // resuelve por `AnioEscolar.activo = true`, NUNCA por `Configuracion.anio_escolar_id` — esa
  // columna puede quedar desfasada (`AniosEscolaresService.activar()` nunca la sincroniza). El
  // mock de `configuracion.findUnique` nunca se invoca desde este método: si el método leyera
  // `Configuracion.anio_escolar_id` en cambio, este assert de "no invocado" fallaría.
  describe('anioEscolarActivoId() (D2b)', () => {
    it('[9.1] devuelve el id del AnioEscolar activo=true aunque Configuracion.anio_escolar_id apunte a otro', async () => {
      const findUnique = jest.fn().mockResolvedValue({
        anio_escolar_id: 'anio-desfasado',
      });
      const anioEscolarFindFirst = jest.fn().mockResolvedValue({ id: 'anio-realmente-activo' });
      const { servicio } = construirServicio(findUnique, anioEscolarFindFirst);

      await expect(servicio.anioEscolarActivoId()).resolves.toBe('anio-realmente-activo');
      expect(anioEscolarFindFirst).toHaveBeenCalledWith({
        where: { activo: true },
        select: { id: true },
      });
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('[9.1] devuelve null cuando ningún AnioEscolar tiene activo=true', async () => {
      const anioEscolarFindFirst = jest.fn().mockResolvedValue(null);
      const { servicio } = construirServicio(jest.fn(), anioEscolarFindFirst);

      await expect(servicio.anioEscolarActivoId()).resolves.toBeNull();
    });
  });
});
