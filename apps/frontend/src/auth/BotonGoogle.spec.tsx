import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { BotonGoogle } from './BotonGoogle';

// [spec: minimal-login, "Botón Continuar con Google"] [design.md D10]
// `useGoogleIdentity` se mockea: acá se prueba SOLO la decisión de
// renderizar o no el contenedor del botón según `VITE_GOOGLE_CLIENT_ID`
// (fail-closed) — el efecto de carga/inicialización del script vive en
// useGoogleIdentity.ts y no tiene test de componente propio.
const { useGoogleIdentityMock } = vi.hoisted(() => ({
  useGoogleIdentityMock: vi.fn(),
}));

vi.mock('./useGoogleIdentity', () => ({
  useGoogleIdentity: useGoogleIdentityMock,
}));

describe('BotonGoogle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    useGoogleIdentityMock.mockReset();
  });

  it('sin VITE_GOOGLE_CLIENT_ID no renderiza nada (fail-closed, D10)', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

    const { container } = render(<BotonGoogle onCredential={vi.fn()} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('con VITE_GOOGLE_CLIENT_ID renderiza el contenedor del botón', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client-id-de-prueba');

    const { container } = render(<BotonGoogle onCredential={vi.fn()} />);

    expect(container).not.toBeEmptyDOMElement();
    expect(useGoogleIdentityMock).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'client-id-de-prueba' }),
    );
  });
});
