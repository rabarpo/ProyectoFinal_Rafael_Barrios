import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { barrerNotificaciones } from '../../src/notificaciones/sweep-notificaciones';
import { PrismaSweepRepo } from '../../src/notificaciones/sweep.repo';

const HORA_MS = 60 * 60 * 1000;
const UMBRALES = { recordatorioHoras: 24, cierreProximoHoras: 2 };

/**
 * notificaciones (backlog #19), PR10 (design.md D6, tareas 27.1-27.4). Corre contra Postgres real
 * (`test:e2e`). `PrismaSweepRepo.emitirPendientes()` es el objeto bajo prueba, invocado
 * directamente y a través de `barrerNotificaciones()` — sin BullMQ, sin HTTP.
 */
describe('PrismaSweepRepo / barrerNotificaciones e2e [D6, tareas 27.1-27.4]', () => {
  const prisma = new PrismaClient();
  const repo = new PrismaSweepRepo(prisma);

  let sufijo: number;
  let contador = 0;

  function nombreUnico(): string {
    contador += 1;
    return `Sweep E2E ${sufijo}-${contador}`;
  }

  async function crearUsuario(): Promise<string> {
    contador += 1;
    const s = `${sufijo}-${contador}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo: `e2e-sweep-${s}`,
        dni: `dni-${s}`,
        correo: `sweep-${s}@e2e.local`,
        nombres: `Usuario E2E ${s}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: 'x',
      },
    });
    return usuario.id;
  }

  async function crearProcesoAbierto(horasRestantes: number): Promise<string> {
    const ahora = Date.now();
    const proceso = await prisma.procesoElectoral.create({
      data: {
        nombre: nombreUnico(),
        tipo: 'municipio',
        estado: 'abierto',
        fecha_apertura_prevista: new Date(ahora - HORA_MS),
        fecha_cierre_prevista: new Date(ahora + horasRestantes * HORA_MS),
        publico_objetivo: 'estudiantes',
        alcance: 'institucion',
      },
    });
    return proceso.id;
  }

  async function crearDerechoVoto(procesoId: string, usuarioId: string): Promise<string> {
    const derecho = await prisma.derechoVoto.create({
      data: {
        proceso_id: procesoId,
        usuario_id: usuarioId,
        en_calidad_de: 'estudiante',
        aula_snapshot: '00000000-0000-0000-0000-000000000000',
      },
    });
    return derecho.id;
  }

  async function registrarVoto(derechoVotoId: string, procesoId: string, sufijoVoto: string): Promise<void> {
    await prisma.voto.create({
      data: {
        proceso_id: procesoId,
        derecho_voto_id: derechoVotoId,
        blanco: true,
        codigo_comprobante: `comprobante-${sufijoVoto}`,
        clave_idempotencia: `idem-${sufijoVoto}`,
      },
    });
  }

  beforeAll(() => {
    sufijo = Date.now();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // [27.1] Doble barrido sobre el mismo proceso dentro del umbral ⇒ N notificaciones, no 2N.
  it('[27.1] doble barrido sobre el mismo proceso emite N notificaciones, no 2N', async () => {
    const procesoId = await crearProcesoAbierto(1);
    const usuario1 = await crearUsuario();
    const usuario2 = await crearUsuario();
    await crearDerechoVoto(procesoId, usuario1);
    await crearDerechoVoto(procesoId, usuario2);

    await repo.emitirPendientes(procesoId, 'recordatorio');
    await repo.emitirPendientes(procesoId, 'recordatorio');

    const total = await prisma.notificacion.count({ where: { proceso_id: procesoId, evento: 'recordatorio' } });
    expect(total).toBe(2);
  });

  // [27.2] Barrido concurrente (Promise.all de dos emitirPendientes) ⇒ N, no 2N.
  it('[27.2] dos emitirPendientes concurrentes sobre el mismo proceso convergen a N', async () => {
    const procesoId = await crearProcesoAbierto(1);
    const usuario1 = await crearUsuario();
    const usuario2 = await crearUsuario();
    await crearDerechoVoto(procesoId, usuario1);
    await crearDerechoVoto(procesoId, usuario2);

    await Promise.all([
      repo.emitirPendientes(procesoId, 'cierre_proximo'),
      repo.emitirPendientes(procesoId, 'cierre_proximo'),
    ]);

    const total = await prisma.notificacion.count({ where: { proceso_id: procesoId, evento: 'cierre_proximo' } });
    expect(total).toBe(2);
  });

  // [27.3] Usuario que ya votó no recibe recordatorio.
  it('[27.3] usuario que ya votó queda fuera de los destinatarios', async () => {
    const procesoId = await crearProcesoAbierto(1);
    const usuarioVoto = await crearUsuario();
    const usuarioPendiente = await crearUsuario();
    const derechoVoto = await crearDerechoVoto(procesoId, usuarioVoto);
    await crearDerechoVoto(procesoId, usuarioPendiente);
    await registrarVoto(derechoVoto, procesoId, `${sufijo}-${usuarioVoto}`);

    await repo.emitirPendientes(procesoId, 'recordatorio');

    const notificados = await prisma.notificacion.findMany({
      where: { proceso_id: procesoId, evento: 'recordatorio' },
      select: { usuario_id: true },
    });
    expect(notificados).toHaveLength(1);
    expect(notificados[0].usuario_id).toBe(usuarioPendiente);
  });

  // [27.4] Sweep sobre proceso ya notificado ⇒ cero consultas a DerechoVoto (spy).
  it('[27.4] segundo barrido sobre proceso ya notificado no consulta DerechoVoto', async () => {
    const procesoId = await crearProcesoAbierto(1);
    const usuario1 = await crearUsuario();
    await crearDerechoVoto(procesoId, usuario1);

    await repo.emitirPendientes(procesoId, 'recordatorio');

    const spy = vi.spyOn(prisma.derechoVoto, 'findMany');
    await repo.emitirPendientes(procesoId, 'recordatorio');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  // [27.5 parcial] barrerNotificaciones() de punta a punta contra Postgres real.
  it('[27.5] barrerNotificaciones() de punta a punta emite recordatorio y cierre_proximo', async () => {
    const procesoId = await crearProcesoAbierto(1);
    const usuario1 = await crearUsuario();
    await crearDerechoVoto(procesoId, usuario1);

    await barrerNotificaciones(repo, UMBRALES, new Date());

    const eventos = await prisma.notificacion.findMany({
      where: { proceso_id: procesoId },
      select: { evento: true },
    });
    expect(eventos.map((e) => e.evento).sort()).toEqual(['cierre_proximo', 'recordatorio']);
  });
});
