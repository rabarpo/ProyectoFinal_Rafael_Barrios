import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSesion } from './sesion-context';

// [D8] La sesión vive únicamente en el contexto de `AuthProvider` (whoami al
// montar); no hay espejo en localStorage/sessionStorage. `useSesion()` fuera
// del provider es un error de programación, no un estado válido — debe
// lanzar en vez de devolver un valor por defecto silencioso.
describe('useSesion', () => {
  it('lanza un error cuando se usa fuera de <AuthProvider>', () => {
    expect(() => renderHook(() => useSesion())).toThrow(
      'useSesion debe usarse dentro de <AuthProvider>',
    );
  });
});
