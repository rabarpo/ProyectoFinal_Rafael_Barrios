import { claveResultados, deserializar, serializar, TTL_RESULTADOS_SEGUNDOS } from './resultados-cache';
import type { ResultadosRespuestaDto } from './dto/resultados-respuesta.dto';

// resultados-en-vivo (#16, PR1; design.md D7, tareas 2.1-2.5). Puro, sin ioredis y sin Prisma.
describe('resultados-cache (D7)', () => {
  const PROCESO_ID_A = '11111111-1111-1111-1111-111111111111';
  const PROCESO_ID_B = '22222222-2222-2222-2222-222222222222';

  const PAYLOAD: ResultadosRespuestaDto = {
    estado_visibilidad: 'visible',
    resultados_ocultos_por_configuracion: false,
    votos_emitidos: 3,
    padron_total: 10,
    hora_servidor: '2026-08-15T14:32:07.123Z',
    dimension: 'lista',
    desglose: [{ id: 'x', etiqueta: 'Lista X', votos: 3, estado: 'activo' }],
    blancos: 0,
  };

  // 2.1
  it('claveResultados(procesoId) es exactamente "resultados:{uuid}"', () => {
    expect(claveResultados(PROCESO_ID_A)).toBe(`resultados:${PROCESO_ID_A}`);
  });

  // 2.2
  it('TTL_RESULTADOS_SEGUNDOS es 8 por defecto', () => {
    expect(TTL_RESULTADOS_SEGUNDOS).toBe(8);
  });

  it('TTL_RESULTADOS_SEGUNDOS respeta RESULTADOS_CACHE_TTL_SECONDS del entorno', () => {
    jest.resetModules();
    process.env.RESULTADOS_CACHE_TTL_SECONDS = '5';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const recargado = require('./resultados-cache');
    expect(recargado.TTL_RESULTADOS_SEGUNDOS).toBe(5);
    delete process.env.RESULTADOS_CACHE_TTL_SECONDS;
    jest.resetModules();
  });

  // 2.3
  it('serializar/deserializar ida y vuelta con el mismo procesoId', () => {
    const crudo = serializar(PROCESO_ID_A, PAYLOAD);
    expect(deserializar(PROCESO_ID_A, crudo)).toEqual(PAYLOAD);
  });

  // 2.4 — autocomprobación anticontaminación (threat: Contaminación cruzada de caché)
  it('deserializar con proceso_id ajeno al envoltorio devuelve null', () => {
    const crudoDeB = serializar(PROCESO_ID_B, PAYLOAD);
    expect(deserializar(PROCESO_ID_A, crudoDeB)).toBeNull();
  });

  // 2.5
  it('deserializar(procesoId, null) devuelve null', () => {
    expect(deserializar(PROCESO_ID_A, null)).toBeNull();
  });

  it('deserializar con JSON corrupto devuelve null sin lanzar', () => {
    expect(() => deserializar(PROCESO_ID_A, '{esto no es json')).not.toThrow();
    expect(deserializar(PROCESO_ID_A, '{esto no es json')).toBeNull();
  });
});
