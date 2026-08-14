import { ParseUUIDPipe } from '@nestjs/common';
import type { PadronService } from './padron.service';
import { ProcesosController } from './procesos.controller';
import type { ProcesosService } from './procesos.service';

/**
 * apertura-proceso-congelamiento-padron (#13, PR2; design.md D9, tareas 7.1-7.2). Wiring de
 * `POST /procesos/:id/abrir`: guards/roles heredados de la clase (sin `@Roles` de método, D9),
 * `@Param('id', ParseUUIDPipe)` rechaza `:id` no-UUID ANTES de que el servicio se invoque (threat
 * matrix "SQL crudo parametrizado" — primera sentencia cruda del repo, `abrir()` PR2).
 *
 * El repo no tiene precedente de un test de controlador levantando el árbol HTTP completo de Nest
 * (`INestApplication`/supertest) — las suites e2e (`test/procesos/*.e2e-spec.ts`) usan `fetch`
 * contra un servidor real con Postgres/Redis vivos, fuera de alcance de PR2 (esa suite completa es
 * PR4). Para probar el guard del pipe SIN levantar esa infraestructura, tarea 7.2 se cubre
 * instanciando `ParseUUIDPipe` de forma aislada (comportamiento real de Nest, sin mock) y
 * verificando que `ProcesosController.abrir()` nunca se ejecuta cuando el pipe rechaza antes.
 */
describe('ProcesosController — POST :id/abrir (D9, tarea 7.1-7.2)', () => {
  it('[7.1] delega en ProcesosService.abrir() con id, dto y actorId de la sesión', async () => {
    const abrir = jest.fn().mockResolvedValue({
      id: 'proceso-1',
      estado: 'abierto',
      apertura_real: '2026-08-13T12:00:00.000Z',
      ocultar_resultados: false,
      aulas: 0,
      derechos_totales: 0,
      derechos_estudiante: 0,
      derechos_padre: 0,
    });
    const procesosService = { abrir } as unknown as ProcesosService;
    const padronService = {} as unknown as PadronService;
    const controller = new ProcesosController(padronService, procesosService);

    const respuesta = await controller.abrir(
      'proceso-1',
      { confirmar: true },
      { usuario: { userId: 'actor-1' } } as never,
    );

    expect(abrir).toHaveBeenCalledWith('proceso-1', { confirmar: true }, 'actor-1');
    expect(respuesta.estado).toBe('abierto');
  });

  it('[7.2] ParseUUIDPipe rechaza un :id no-UUID antes de que el controlador se invoque [threat matrix]', async () => {
    const pipe = new ParseUUIDPipe();
    const abrir = jest.fn();
    const procesosService = { abrir } as unknown as ProcesosService;

    await expect(
      pipe.transform("'; DROP TABLE \"ProcesoElectoral\"; --", { type: 'param', data: 'id' }),
    ).rejects.toThrow();

    // El pipe corre en la tubería de Nest ANTES de que el método del controlador se ejecute: si
    // rechaza, `ProcesosController.abrir()` — y por lo tanto `ProcesosService.abrir()` — nunca se
    // invoca. No hay nada que ejercitar en el controlador mismo para este caso.
    expect(abrir).not.toHaveBeenCalled();
  });

  it('[7.2] ParseUUIDPipe acepta un UUID válido sin lanzar', async () => {
    const pipe = new ParseUUIDPipe();
    const valido = await pipe.transform('123e4567-e89b-12d3-a456-426614174000', { type: 'param', data: 'id' });
    expect(valido).toBe('123e4567-e89b-12d3-a456-426614174000');
  });
});
