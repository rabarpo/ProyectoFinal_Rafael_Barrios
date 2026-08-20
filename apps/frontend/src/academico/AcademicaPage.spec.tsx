import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AcademicaPage } from './AcademicaPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import { PESTANAS } from './pestanas';

// [design.md D1/D2/D8; tasks.md 5.1-5.3; spec: minimal-frontend-router,
// menu-navegacion-post-login] `AcademicaPage` resuelve rol ⇒ `soloLectura` y pestaña activa vía
// `useState` local (D1: nunca URL). Mismo patrón `proveer()`/`SesionContext` de
// `Enrutador.spec.tsx`.
const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <AcademicaPage />
    </SesionContext.Provider>
  );
}

function contextoAdministrador(): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: 'administrador', creadoEn: 1 },
    ...acciones,
  };
}

function contextoComite(): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u2', rol: 'comite', creadoEn: 1 },
    ...acciones,
  };
}

describe('AcademicaPage', () => {
  it('[5.1] la pestaña "Año escolar" está activa por defecto y las 6 pestañas son visibles', () => {
    render(proveer(contextoAdministrador()));

    for (const pestana of PESTANAS) {
      expect(screen.getByText(pestana.etiqueta)).toBeInTheDocument();
    }
    expect(screen.getByTestId('panel-stub-anios')).toBeInTheDocument();
  });

  it('[5.2] hacer click en la pestaña "Nivel" renderiza su panel y desmonta el de Años', () => {
    render(proveer(contextoAdministrador()));

    fireEvent.click(screen.getByText('Nivel'));

    expect(screen.getByTestId('panel-stub-niveles')).toBeInTheDocument();
    expect(screen.queryByTestId('panel-stub-anios')).not.toBeInTheDocument();
  });

  it('[5.3] rol comité renderiza AcademicaPage sin lanzar', () => {
    expect(() => render(proveer(contextoComite()))).not.toThrow();
  });
});
