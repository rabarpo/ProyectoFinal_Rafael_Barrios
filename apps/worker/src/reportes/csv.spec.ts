import { describe, expect, it } from 'vitest';
import { escaparCeldaCsv, neutralizarFormula } from './csv';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D11, tarea 16.1). Paridad de escaping CSV
 * worker↔backend: los mismos casos, caso por caso, contra `escaparCeldaCsv`/`neutralizarFormula`
 * de `apps/backend/src/importacion/padron-csv.ts` (fuente de verdad, referenciada en el comentario
 * de `csv.ts`). Esta tabla está duplicada A PROPÓSITO en ambos paquetes (D11) — si diverge, uno de
 * los dos archivos hay que corregir, nunca ignorar.
 */
describe('paridad de escaping CSV worker↔backend [16.1]', () => {
  const casos: { entrada: string; esperado: string }[] = [
    { entrada: 'simple', esperado: 'simple' },
    { entrada: 'con,coma', esperado: '"con,coma"' },
    { entrada: 'con"comilla', esperado: '"con""comilla"' },
    { entrada: 'con\nsalto', esperado: '"con\nsalto"' },
    { entrada: '=cmd|calc', esperado: "'=cmd|calc" },
    { entrada: '+suma', esperado: "'+suma" },
    { entrada: '-resta', esperado: "'-resta" },
    { entrada: '@mencion', esperado: "'@mencion" },
    { entrada: '', esperado: '' },
    { entrada: 'ñandú café', esperado: 'ñandú café' },
  ];

  it.each(casos)('escaparCeldaCsv(%j)', ({ entrada, esperado }) => {
    expect(escaparCeldaCsv(entrada)).toBe(esperado);
  });

  it('neutralizarFormula sólo prefija = + - @', () => {
    expect(neutralizarFormula('=x')).toBe("'=x");
    expect(neutralizarFormula('+x')).toBe("'+x");
    expect(neutralizarFormula('-x')).toBe("'-x");
    expect(neutralizarFormula('@x')).toBe("'@x");
    expect(neutralizarFormula('x')).toBe('x');
  });
});
