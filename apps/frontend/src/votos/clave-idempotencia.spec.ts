import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useClaveIdempotencia } from './clave-idempotencia';

// [design.md D15; tasks.md 16.5-16.6] `crypto.randomUUID()` generado y persistido en
// `sessionStorage` bajo `seei:voto:{procesoId}:{derechoVotoId}` — estable entre reintentos y entre
// renders del mismo componente. Sin `sessionStorage` disponible (modo privado), cae a un `useRef`
// en memoria que sigue estable dentro de la misma sesión de render.
describe('useClaveIdempotencia', () => {
  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('[16.5] genera y persiste la clave en sessionStorage bajo la llave proceso+derecho', () => {
    const { result } = renderHook(() => useClaveIdempotencia('p1', 'dv1'));

    const clave = result.current;
    expect(clave).toMatch(/^[0-9a-f-]{36}$/i);
    expect(window.sessionStorage.getItem('seei:voto:p1:dv1')).toBe(clave);
  });

  it('[16.5] la clave es estable entre renders y reintentos (misma clave siempre)', () => {
    const { result, rerender } = renderHook(() => useClaveIdempotencia('p1', 'dv1'));
    const primera = result.current;

    rerender();
    expect(result.current).toBe(primera);

    const { result: segundoMontaje } = renderHook(() => useClaveIdempotencia('p1', 'dv1'));
    expect(segundoMontaje.current).toBe(primera);
  });

  it('[16.5] procesos/derechos distintos obtienen claves distintas', () => {
    const { result: a } = renderHook(() => useClaveIdempotencia('p1', 'dv1'));
    const { result: b } = renderHook(() => useClaveIdempotencia('p1', 'dv2'));

    expect(a.current).not.toBe(b.current);
  });

  it('[16.6] sin sessionStorage disponible (modo privado) cae a useRef en memoria, estable entre renders', () => {
    vi.spyOn(window.sessionStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError: modo privado');
    });
    vi.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError: modo privado');
    });

    const { result, rerender } = renderHook(() => useClaveIdempotencia('p1', 'dv1'));
    const primera = result.current;
    expect(primera).toMatch(/^[0-9a-f-]{36}$/i);

    rerender();
    expect(result.current).toBe(primera);
  });
});
