import type { ComprobanteService } from './comprobante.service';
import type { MisDerechosService } from './mis-derechos.service';
import type { PapeletaService } from './papeleta.service';
import { VotosController } from './votos.controller';
import type { VotosService } from './votos.service';

/**
 * vote-casting, PR3 (design.md D6, tareas 10.3-10.4). Mismo criterio que
 * `procesos.controller.spec.ts` (#13, PR2): instancia el controlador directamente con servicios
 * mockeados, sin levantar el árbol HTTP de Nest — la suite e2e completa (`test/votos/
 * votos-emitir.e2e-spec.ts`) prueba el `@Res({passthrough:true})` real contra un servidor vivo.
 * Acá solo se verifica QUE el controlador traduce `creado` en el status code correcto (D6) y
 * delega en `construirComprobante()`.
 */
describe('VotosController — POST / (D6, tarea 10.3-10.4)', () => {
  function construirControlador(resultado: { creado: boolean }) {
    const emitir = jest.fn().mockResolvedValue({
      creado: resultado.creado,
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: '2026-08-14T12:00:00.000Z',
      proceso_id: 'proceso-1',
      derecho_voto_id: '123e4567-e89b-12d3-a456-426614174000',
    });
    const comprobante = {
      codigo_comprobante: 'K7QM-3XZ9-8HTB-P4WR',
      hora_servidor: '2026-08-14T12:00:00.000Z',
      proceso: { id: 'proceso-1', nombre: 'Proceso E2E' },
      en_calidad_de: 'estudiante',
      eleccion_resumen: 'Lista A',
    };
    const construirComprobante = jest.fn().mockResolvedValue(comprobante);
    const votosService = { emitir, construirComprobante } as unknown as VotosService;
    const papeletaService = {} as unknown as PapeletaService;
    const comprobanteService = {} as unknown as ComprobanteService;
    const misDerechosService = {} as unknown as MisDerechosService;
    const controller = new VotosController(papeletaService, votosService, comprobanteService, misDerechosService);
    const res = { status: jest.fn() };
    return { controller, emitir, construirComprobante, res, comprobante };
  }

  const DTO = {
    derecho_voto_id: '123e4567-e89b-12d3-a456-426614174000',
    lista_id: 'lista-1',
    clave_idempotencia: 'clave-1',
  };
  const SESION = { usuario: { userId: 'usuario-1' } };

  it('[10.3] camino de creación (creado=true) responde 201 con el comprobante', async () => {
    const { controller, emitir, res, comprobante } = construirControlador({ creado: true });

    const cuerpo = await controller.emitir(DTO as never, SESION as never, res as never);

    expect(emitir).toHaveBeenCalledWith(DTO, SESION.usuario);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(cuerpo).toEqual(comprobante);
  });

  it('[10.3] camino de reintento/colisión (creado=false) responde 200 con el mismo cuerpo' , async () => {
    const { controller, res, comprobante } = construirControlador({ creado: false });

    const cuerpo = await controller.emitir(DTO as never, SESION as never, res as never);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(cuerpo).toEqual(comprobante);
  });

  it('[11.12][adversarial] derecho_voto_id no-UUID responde 400 sin invocar VotosService.emitir()', async () => {
    const { controller, emitir, res } = construirControlador({ creado: true });

    await expect(
      controller.emitir(
        { ...DTO, derecho_voto_id: "'; DROP TABLE \"Voto\"; --" } as never,
        SESION as never,
        res as never,
      ),
    ).rejects.toThrow();

    expect(emitir).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

/**
 * descubrimiento-derechos-voto, PR1 (design.md D5, tarea 1.3). `401` sin sesión ya está cubierto
 * estructuralmente por `@UseGuards(AuthGuard)` a nivel de CLASE en `VotosController` (aplica a
 * toda ruta del controlador, incluida esta) — no requiere unit test adicional, es el mismo criterio
 * que las demás rutas del controlador. Acá se prueba lo único unit-testeable de D5: el handler
 * NO declara `@Query()`/`@Param()`, así que `req.usuario` es la ÚNICA fuente del id — cualquier
 * `usuario_id` presente en la query es estructuralmente inerte (Threat Matrix "IDOR / enumeración").
 */
describe('VotosController — GET /mis-derechos (D5, tarea 1.3)', () => {
  function construirControlador(derechos: unknown[]) {
    const listar = jest.fn().mockResolvedValue(derechos);
    const misDerechosService = { listar } as unknown as MisDerechosService;
    const papeletaService = {} as unknown as PapeletaService;
    const votosService = {} as unknown as VotosService;
    const comprobanteService = {} as unknown as ComprobanteService;
    const controller = new VotosController(papeletaService, votosService, comprobanteService, misDerechosService);
    return { controller, listar };
  }

  const SESION_USUARIO = { userId: 'usuario-1', rol: 'estudiante', creadoEn: 0 };

  it('[1.3] el handler resuelve el usuario sólo desde req.usuario y delega en MisDerechosService.listar()', async () => {
    const { controller, listar } = construirControlador([]);

    const respuesta = await controller.misDerechos({ usuario: SESION_USUARIO } as never);

    expect(listar).toHaveBeenCalledWith(SESION_USUARIO);
    expect(respuesta).toEqual([]);
  });

  it('[1.3][adversarial] ?usuario_id=<ajeno> en la request no tiene efecto — no hay @Query() que lo lea', async () => {
    const { controller, listar } = construirControlador([]);
    const requestConQueryAjena = {
      usuario: SESION_USUARIO,
      query: { usuario_id: 'usuario-ajeno' },
    };

    await controller.misDerechos(requestConQueryAjena as never);

    // El handler tiene arity 1 (solo @Req()): TypeScript no permite declarar @Query() sin
    // parámetro adicional, así que la única forma de que `usuario_id` afectara el resultado sería
    // leyendo `req.query` manualmente dentro del método — este assert prueba que no lo hace.
    expect(listar).toHaveBeenCalledWith(SESION_USUARIO);
    expect(listar).not.toHaveBeenCalledWith(expect.objectContaining({ userId: 'usuario-ajeno' }));
  });
});
