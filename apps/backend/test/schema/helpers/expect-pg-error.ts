// Helper compartido del arnés `test:schema` (design.md, D3). Ejecuta `fn`, espera que Postgres la
// rechace con el código de error y (opcionalmente) el nombre de restricción indicados, y lanza un
// error propio si la operación es aceptada en vez de rechazada — así un `CHECK`/índice/FK
// eliminado por error hace fallar el test en lugar de pasar en silencio.
export async function expectPgError(
  fn: () => Promise<unknown>,
  esperado: { code: string; constraint?: string },
): Promise<void> {
  try {
    await fn();
  } catch (e) {
    const err = e as { code?: string; constraint?: string };
    expect(err.code).toBe(esperado.code);
    if (esperado.constraint) expect(err.constraint).toBe(esperado.constraint);
    return;
  }
  throw new Error(`Se esperaba ${esperado.code} y la operación fue aceptada`);
}
