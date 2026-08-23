import { TTL_PANEL_AVANCE_AULAS_SEGUNDOS, TTL_PANEL_INSTITUCION_SEGUNDOS, TTL_PANEL_RESUMEN_SEGUNDOS, TTL_PANEL_VOTOS_HORA_SEGUNDOS, UMBRAL_REZAGO_PP } from './panel-jornada.constantes';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Umbral de rezago"/"Caché", tareas 1.1-1.2).
// Puro: sin ioredis ni Prisma, idioma de `resultados-cache.spec.ts`.
describe('panel-jornada.constantes', () => {
  // 1.1
  it('UMBRAL_REZAGO_PP es 15 por defecto', () => {
    expect(UMBRAL_REZAGO_PP).toBe(15);
  });

  it('UMBRAL_REZAGO_PP respeta PANEL_JORNADA_UMBRAL_REZAGO_PP del entorno', () => {
    jest.resetModules();
    process.env.PANEL_JORNADA_UMBRAL_REZAGO_PP = '20';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const recargado = require('./panel-jornada.constantes');
    expect(recargado.UMBRAL_REZAGO_PP).toBe(20);
    delete process.env.PANEL_JORNADA_UMBRAL_REZAGO_PP;
    jest.resetModules();
  });

  // 1.2
  it('TTLs por defecto: institucion 300, resumen 8, votos-hora 60, avance-aulas 30', () => {
    expect(TTL_PANEL_INSTITUCION_SEGUNDOS).toBe(300);
    expect(TTL_PANEL_RESUMEN_SEGUNDOS).toBe(8);
    expect(TTL_PANEL_VOTOS_HORA_SEGUNDOS).toBe(60);
    expect(TTL_PANEL_AVANCE_AULAS_SEGUNDOS).toBe(30);
  });

  it.each([
    ['PANEL_JORNADA_TTL_INSTITUCION_SECONDS', 'TTL_PANEL_INSTITUCION_SEGUNDOS', '111'],
    ['PANEL_JORNADA_TTL_RESUMEN_SECONDS', 'TTL_PANEL_RESUMEN_SEGUNDOS', '9'],
    ['PANEL_JORNADA_TTL_VOTOS_HORA_SECONDS', 'TTL_PANEL_VOTOS_HORA_SEGUNDOS', '61'],
    ['PANEL_JORNADA_TTL_AVANCE_AULAS_SECONDS', 'TTL_PANEL_AVANCE_AULAS_SEGUNDOS', '31'],
  ])('%s sobreescribe %s', (env, exportName, valor) => {
    jest.resetModules();
    process.env[env] = valor;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const recargado = require('./panel-jornada.constantes');
    expect(recargado[exportName]).toBe(Number(valor));
    delete process.env[env];
    jest.resetModules();
  });
});
