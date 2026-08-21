import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConfiguracionPage } from './ConfiguracionPage';
import { SesionContext } from '../auth/sesion-context';
import type { ContextoSesion } from '../auth/sesion-context';
import { obtenerConfiguracion, actualizarConfiguracion, listarComite } from './configuracion-api';
import type { ConfiguracionRespuestaDto, UsuarioRespuestaDto } from './configuracion-api';

// [design.md D6; tasks.md Fase 12/16] `vi.mock('./configuracion-api')`: intercepta el módulo
// resuelto, así que también cubre lo que importa `PanelDatosInstitucionales`/`PanelLogo`
// (`../configuracion-api` resuelve al mismo archivo). Sólo el singleton (`obtenerConfiguracion`)
// gatea el montaje del panel de datos institucionales (D6) — `listarComite` es independiente
// (Fase 16: `PanelLogo`/`PanelComite` no bloquean ni son bloqueados por el `GET` singleton).
vi.mock('./configuracion-api', async () => {
  const actual = await vi.importActual<typeof import('./configuracion-api')>('./configuracion-api');
  return {
    ...actual,
    obtenerConfiguracion: vi.fn(),
    actualizarConfiguracion: vi.fn(),
    listarComite: vi.fn(),
  };
});

const obtenerConfiguracionMock = vi.mocked(obtenerConfiguracion);
const actualizarConfiguracionMock = vi.mocked(actualizarConfiguracion);
const listarComiteMock = vi.mocked(listarComite);

const CONFIG_BASE: ConfiguracionRespuestaDto = {
  id: 'config-1',
  nombre: 'Colegio San Martín',
  director: 'Ana Torres',
  color_primario: '#112233',
  color_secundario: '#445566',
  zona_horaria: 'America/Lima',
  dominios_google: [],
  logo_presente: false,
  logo_mime: null,
};

// [design.md D10; tasks.md 4.1-4.3; spec: configuracion-institucional, "Comité navegando
// directamente a /configuracion no ve la página"] Gate BINARIO allowlist fail-closed:
// `puedeGestionar = rol === 'administrador' || rol === 'director'`. PR1 es sólo el gate + shell:
// CERO fetch en cualquier caso (el `configuracion-api` real llega en PR2/PR3b/PR4). Mismo patrón
// `proveer()`/`SesionContext` de `Enrutador.spec.tsx`/`UsuariosPage.spec.tsx`.
const acciones = { login: vi.fn(), google: vi.fn(), logout: vi.fn(), alRecibir401: vi.fn() };

function proveer(contexto: ContextoSesion) {
  return (
    <SesionContext.Provider value={contexto}>
      <ConfiguracionPage />
    </SesionContext.Provider>
  );
}

function contextoConRol(rol: string): ContextoSesion {
  return {
    estado: 'autenticado',
    sesion: { userId: 'u1', rol: rol as never, creadoEn: 1 },
    ...acciones,
  };
}

const INTEGRANTE_COMITE: UsuarioRespuestaDto = {
  id: 'u1',
  nombres: 'Juan Pérez',
  dni: '12345678',
  codigo: 'C001',
  correo: 'juan.perez@colegio.edu.pe',
  rol: 'comite',
  estado: 'activo',
  creado_en: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  obtenerConfiguracionMock.mockReset();
  actualizarConfiguracionMock.mockReset();
  listarComiteMock.mockReset();
  // Default: GET resuelto de inmediato con datos válidos — los tests de Fase 4 (gate) no les
  // interesa el singleton y no deben crashear por un mock sin implementación; los tests de
  // Fase 12/16 sobreescriben este default cuando necesitan pendiente/fallido.
  obtenerConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
  listarComiteMock.mockResolvedValue({ ok: true, data: [INTEGRANTE_COMITE] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ConfiguracionPage', () => {
  it.each(['administrador', 'director'])(
    '[4.1] rol %s renderiza el shell de la página sin lanzar y sin llamar a fetch',
    (rol) => {
      const fetchEspiado = vi.fn();
      vi.stubGlobal('fetch', fetchEspiado);

      expect(() => render(proveer(contextoConRol(rol)))).not.toThrow();

      expect(screen.getByTestId('configuracion-page-shell')).toBeInTheDocument();
      expect(fetchEspiado).not.toHaveBeenCalled();
    },
  );

  it.each(['comite', 'docente', 'estudiante'])(
    '[4.2] rol %s renderiza un aviso de sección no disponible y sin llamar a fetch',
    (rol) => {
      const fetchEspiado = vi.fn();
      vi.stubGlobal('fetch', fetchEspiado);

      render(proveer(contextoConRol(rol)));

      expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
      expect(fetchEspiado).not.toHaveBeenCalled();
    },
  );

  it('[4.2] sin sesión (rol indefinido) renderiza el aviso de sección no disponible y sin llamar a fetch', () => {
    const fetchEspiado = vi.fn();
    vi.stubGlobal('fetch', fetchEspiado);

    render(proveer({ estado: 'anonimo', ...acciones }));

    expect(screen.getByRole('status')).toHaveTextContent(/no está disponible para tu rol/i);
    expect(fetchEspiado).not.toHaveBeenCalled();
  });
});

// [design.md D6; tasks.md Fase 12] Carga del singleton y remount por `version`/`key`:
// `FormularioGenerico` inicializa su estado UNA sola vez (`useState(() => …)`), así que nada puede
// montarse antes de que resuelva el `GET`, y un `PUT` fallido no debe remontar (los valores
// tipeados por el usuario deben sobrevivir).
describe('ConfiguracionPage — carga y wiring de PanelDatosInstitucionales (Fase 12)', () => {
  it('[12.1] mientras el GET está pendiente, muestra loading y no monta el panel', async () => {
    let resolverPromesa!: (valor: { ok: true; data: ConfiguracionRespuestaDto }) => void;
    const promesaPendiente = new Promise<{ ok: true; data: ConfiguracionRespuestaDto }>((resolve) => {
      resolverPromesa = resolve;
    });
    obtenerConfiguracionMock.mockReturnValue(promesaPendiente as never);

    render(proveer(contextoConRol('administrador')));

    expect(obtenerConfiguracionMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    expect(screen.queryByLabelText(/nombre de la institución/i)).not.toBeInTheDocument();

    resolverPromesa({ ok: true, data: CONFIG_BASE });
    await waitFor(() =>
      expect(screen.getByLabelText(/nombre de la institución/i)).toBeInTheDocument(),
    );
  });

  it('[12.2] una vez resuelto el GET, monta PanelDatosInstitucionales con config={data}', async () => {
    obtenerConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });

    render(proveer(contextoConRol('director')));

    expect(await screen.findByLabelText(/nombre de la institución/i)).toHaveValue(CONFIG_BASE.nombre);
  });

  it('[12.3] guardado exitoso incrementa version y remonta el formulario con los valores devueltos', async () => {
    obtenerConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    const devuelto = { ...CONFIG_BASE, nombre: 'Nombre confirmado por el backend' };
    actualizarConfiguracionMock.mockResolvedValue({ ok: true, data: devuelto });

    render(proveer(contextoConRol('administrador')));
    await screen.findByLabelText(/nombre de la institución/i);

    fireEvent.change(screen.getByLabelText(/nombre de la institución/i), {
      target: { value: 'Nombre intentado por el usuario' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() =>
      expect(screen.getByLabelText(/nombre de la institución/i)).toHaveValue(devuelto.nombre),
    );
  });

  it('[12.4] guardado fallido no remonta el formulario: el valor tipeado por el usuario sobrevive', async () => {
    obtenerConfiguracionMock.mockResolvedValue({ ok: true, data: CONFIG_BASE });
    actualizarConfiguracionMock.mockResolvedValue({
      ok: false,
      status: 400,
      codigo: 'CAMPO_INVALIDO',
      campo: 'color_primario',
    });

    render(proveer(contextoConRol('administrador')));
    await screen.findByLabelText(/nombre de la institución/i);

    fireEvent.change(screen.getByLabelText(/nombre de la institución/i), {
      target: { value: 'Valor que no debe perderse' },
    });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/nombre de la institución/i)).toHaveValue('Valor que no debe perderse');
  });
});

// [design.md D8/D9; tasks.md Fase 16] Cableado final: `listarComite()` corre en paralelo a
// `obtenerConfiguracion()` (no encadenado). `PanelLogo`/`PanelComite` no dependen del `GET`
// singleton ni entre sí — cada sección degrada independientemente.
describe('ConfiguracionPage — cableado final de PanelLogo/PanelComite (Fase 16)', () => {
  it('[16.1] llama listarComite() además de obtenerConfiguracion(), ambas una vez', async () => {
    render(proveer(contextoConRol('administrador')));

    await screen.findByLabelText(/nombre de la institución/i);

    expect(obtenerConfiguracionMock).toHaveBeenCalledTimes(1);
    expect(listarComiteMock).toHaveBeenCalledTimes(1);
  });

  it('[16.2] una vez resueltos ambos, monta PanelLogo y PanelComite con sus props respectivas', async () => {
    render(proveer(contextoConRol('director')));

    expect(await screen.findByText(INTEGRANTE_COMITE.nombres)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subir logo/i })).toBeInTheDocument();
  });

  it('[16.3] un listarComite() fallido no impide que PanelDatosInstitucionales/PanelLogo rendericen', async () => {
    listarComiteMock.mockResolvedValue({ ok: false, status: 500 });

    render(proveer(contextoConRol('administrador')));

    expect(await screen.findByLabelText(/nombre de la institución/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /subir logo/i })).toBeInTheDocument();
  });
});
