import type { PrismaService } from '../prisma/prisma.service';
import { MisDerechosService } from './mis-derechos.service';

/**
 * descubrimiento-derechos-voto, PR1 (design.md D1/D2/D4/D6, tarea 1.2). Unit tests con
 * `PrismaService` mockeado — mismo criterio que `papeleta.service.spec.ts`. Cubre:
 * - D1: filtro `estado: 'abierto'` + `fecha_cierre_prevista: { gt: now }` (spec "Múltiples
 *   procesos abiertos ordenados" / "Proceso cerrado excluido").
 * - orden por `fecha_cierre_prevista asc`.
 * - ADR-0011: `en_calidad_de` dual (`estudiante` + `padre`) sin colapsar (spec "Estudiante y
 *   padre coexisten").
 * - D6: `ya_voto` true/false derivado de `votos.length`.
 * - spec "Rol sin DerechoVoto": lista vacía.
 */

const PROCESO_A = {
  id: 'proceso-a',
  nombre: 'Municipio escolar 2026',
  tipo: 'municipio',
  fecha_cierre_prevista: new Date('2026-09-05T18:00:00.000Z'),
};

const PROCESO_B = {
  id: 'proceso-b',
  nombre: 'Consulta uniforme',
  tipo: 'consulta',
  fecha_cierre_prevista: new Date('2026-09-02T18:00:00.000Z'),
};

function construirPrisma(findManyImpl: jest.Mock) {
  return { derechoVoto: { findMany: findManyImpl } };
}

function construirServicio(prisma: ReturnType<typeof construirPrisma>) {
  return new MisDerechosService(prisma as unknown as PrismaService);
}

const SESION = { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 };

describe('MisDerechosService.listar() — filtro D1 y orden (tarea 1.2)', () => {
  it('[1.2] devuelve ambas entradas de procesos abiertos, la de cierre más próximo primero', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 'dv-b',
        en_calidad_de: 'estudiante',
        proceso: PROCESO_B,
        votos: [],
      },
      {
        id: 'dv-a',
        en_calidad_de: 'estudiante',
        proceso: PROCESO_A,
        votos: [],
      },
    ]);
    const servicio = construirServicio(construirPrisma(findMany));

    const derechos = await servicio.listar(SESION);

    expect(derechos.map((d) => d.derecho_voto_id)).toEqual(['dv-b', 'dv-a']);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          usuario_id: 'usuario-1',
          proceso: expect.objectContaining({
            estado: 'abierto',
            fecha_cierre_prevista: expect.objectContaining({ gt: expect.any(Date) }),
          }),
        }),
        orderBy: { proceso: { fecha_cierre_prevista: 'asc' } },
      }),
    );
  });

  it('[1.2] proceso cerrado (filtrado por Prisma) no aparece en la respuesta', async () => {
    // El filtro `estado: 'abierto'` vive en el `where` de Prisma — este caso confirma que el
    // servicio no re-filtra ni re-incluye nada fuera de lo que Prisma ya devolvió.
    const findMany = jest.fn().mockResolvedValue([]);
    const servicio = construirServicio(construirPrisma(findMany));

    const derechos = await servicio.listar(SESION);

    expect(derechos).toEqual([]);
  });
});

describe('MisDerechosService.listar() — ADR-0011, en_calidad_de dual (tarea 1.2)', () => {
  it('[1.2] estudiante y padre coexisten en el mismo proceso como entradas separadas', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'dv-estudiante', en_calidad_de: 'estudiante', proceso: PROCESO_A, votos: [] },
      { id: 'dv-padre', en_calidad_de: 'padre', proceso: PROCESO_A, votos: [] },
    ]);
    const servicio = construirServicio(construirPrisma(findMany));

    const derechos = await servicio.listar(SESION);

    expect(derechos).toHaveLength(2);
    expect(derechos.map((d) => d.en_calidad_de)).toEqual(['estudiante', 'padre']);
    expect(derechos.map((d) => d.derecho_voto_id)).toEqual(['dv-estudiante', 'dv-padre']);
  });
});

describe('MisDerechosService.listar() — ya_voto (D6, tarea 1.2)', () => {
  it('[1.2] derecho con voto asociado -> ya_voto true, sin exponer la elección', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'dv-1', en_calidad_de: 'estudiante', proceso: PROCESO_A, votos: [{ id: 'voto-1' }] },
    ]);
    const servicio = construirServicio(construirPrisma(findMany));

    const [derecho] = await servicio.listar(SESION);

    expect(derecho.ya_voto).toBe(true);
    expect(Object.keys(derecho)).not.toContain('lista_id');
  });

  // 1.4: contrato de serialización (ADR-0010/D6, threat matrix "Secreto del voto"). El DTO NUNCA
  // declara ninguna de estas 5 claves — ni siquiera cuando el voto existe (caso más adversarial:
  // si algún día `votos` trajera más campos del `select`, esta prueba lo detectaría).
  it('[1.4][contrato] MiDerechoVotoDto serializado excluye todo campo que revele la elección', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'dv-1', en_calidad_de: 'estudiante', proceso: PROCESO_A, votos: [{ id: 'voto-1' }] },
    ]);
    const servicio = construirServicio(construirPrisma(findMany));

    const [derecho] = await servicio.listar(SESION);

    const clavesProhibidas = ['lista_id', 'opcion_id', 'candidato_id', 'blanco', 'codigo_comprobante'];
    const claves = Object.keys(derecho);
    for (const clave of clavesProhibidas) {
      expect(claves).not.toContain(clave);
    }
    expect(claves.sort()).toEqual(['derecho_voto_id', 'en_calidad_de', 'proceso', 'ya_voto'].sort());
    expect(Object.keys(derecho.proceso)).not.toContain('lista_id');
  });

  it('[1.2] derecho sin voto asociado -> ya_voto false', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'dv-1', en_calidad_de: 'estudiante', proceso: PROCESO_A, votos: [] },
    ]);
    const servicio = construirServicio(construirPrisma(findMany));

    const [derecho] = await servicio.listar(SESION);

    expect(derecho.ya_voto).toBe(false);
  });
});

describe('MisDerechosService.listar() — sin derechos vigentes (tarea 1.2)', () => {
  it('[1.2] rol sin DerechoVoto devuelve lista vacía', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const servicio = construirServicio(construirPrisma(findMany));

    const derechos = await servicio.listar({ userId: 'docente-1', rol: 'docente', creadoEn: 0 });

    expect(derechos).toEqual([]);
  });
});
