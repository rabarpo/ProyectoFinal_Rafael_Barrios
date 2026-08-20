import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FichaUsuarioPage } from './FichaUsuarioPage';
import { actualizarUsuario, cambiarEstadoUsuario, crearUsuario } from './usuarios-api';
import type { UsuarioRespuestaDto } from './usuarios-api';

// [design.md D8/D9; tasks.md 13.1-14.6; spec: administracion-usuarios-apoderados, "Alta y edición
// de Usuario sin campo de contraseña" / "Cambio de estado activo/inactivo sin acción de
// eliminar"] Contenedor con los efectos de la ficha (D3): `usuario === null` ⇒ modo creación (5
// campos, incluye `rol` con opción vacía obligatoria), `usuario` presente ⇒ modo edición (4
// campos, sin `rol`). Mismo patrón `vi.mock` que `PanelAniosEscolares.spec.tsx`.
vi.mock('./usuarios-api');

// [design.md D10; tasks.md 18.1-18.3] `PanelApoderados` se monta condicionalmente por
// `FichaUsuarioPage` — se mockea acá para no depender de sus propios efectos (`listarApoderados`)
// y sólo espiar qué props recibe / si se monta o no.
vi.mock('./paneles/PanelApoderados', () => ({
  PanelApoderados: (props: { usuarioId: string; soloLectura: boolean }) => (
    <div
      data-testid="panel-apoderados"
      data-usuario-id={props.usuarioId}
      data-solo-lectura={String(props.soloLectura)}
    />
  ),
}));

function usuarioDeEjemplo(datos: Partial<UsuarioRespuestaDto> = {}): UsuarioRespuestaDto {
  return {
    id: 'u1',
    nombres: 'Ana Pérez',
    dni: '10000001',
    codigo: 'A001',
    correo: 'ana@example.com',
    rol: 'estudiante',
    estado: 'activo',
    creado_en: '2026-01-01T00:00:00.000Z',
    ...datos,
  };
}

describe('FichaUsuarioPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // [13.1] Modo creación: 5 campos, `rol` con opción vacía inicial (D8: sin ella el submit queda
  // deshabilitado sin explicación, `FormularioGenerico` inicializa todo valor en `''`).
  it('[13.1] modo creación renderiza 5 campos y el select de rol incluye la opción vacía inicial', () => {
    render(
      <FichaUsuarioPage usuario={null} soloLectura={false} onVolver={vi.fn()} onCambio={vi.fn()} />,
    );

    expect(screen.getByLabelText('Nombres')).toBeInTheDocument();
    expect(screen.getByLabelText('DNI')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toBeInTheDocument();

    const selectRol = screen.getByLabelText('Rol') as HTMLSelectElement;
    const opciones = within(selectRol).getAllByRole('option');
    expect(opciones).toHaveLength(6);
    expect(opciones[0]).toHaveValue('');
    expect(opciones[0]).toHaveTextContent('Seleccioná un rol');
    expect(opciones.map((o) => (o as HTMLOptionElement).value).slice(1)).toEqual([
      'estudiante',
      'docente',
      'comite',
      'administrador',
      'director',
    ]);
  });

  // [13.2] Modo edición: `rol` AUSENTE, no deshabilitado (D8: `ActualizarUsuarioDto` lo acepta,
  // la UI lo omite a propósito).
  it('[13.2] modo edición renderiza sólo 4 campos — rol está ausente', () => {
    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo()}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Nombres')).toBeInTheDocument();
    expect(screen.getByLabelText('DNI')).toBeInTheDocument();
    expect(screen.getByLabelText('Código')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo')).toBeInTheDocument();
    expect(screen.queryByLabelText('Rol')).not.toBeInTheDocument();
  });

  // [13.3] Alta: sin campo de contraseña en el payload (spec scenario "Alta de un usuario con rol
  // docente sin campo de contraseña"); éxito ⇒ onCambio.
  it('[13.3] submit en creación llama a crearUsuario con los 5 campos sin contraseña y dispara onCambio', async () => {
    vi.mocked(crearUsuario).mockResolvedValue({
      ok: true,
      data: usuarioDeEjemplo({ rol: 'docente' }),
    });
    const onCambio = vi.fn();

    render(
      <FichaUsuarioPage usuario={null} soloLectura={false} onVolver={vi.fn()} onCambio={onCambio} />,
    );

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Juan Gómez' } });
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '20000002' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'D001' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'docente' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(crearUsuario).toHaveBeenCalledWith({
        nombres: 'Juan Gómez',
        dni: '20000002',
        codigo: 'D001',
        correo: 'juan@example.com',
        rol: 'docente',
      }),
    );
    const payload = vi.mocked(crearUsuario).mock.calls[0][0];
    expect(payload).not.toHaveProperty('password');
    expect(payload).not.toHaveProperty('password_hash');
    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
  });

  // [13.4] Error de unicidad legible, sin reintento automático.
  it('[13.4] error CAMPO_DUPLICADO muestra el mensaje legible y no llama a onCambio', async () => {
    vi.mocked(crearUsuario).mockResolvedValue({
      ok: false,
      status: 409,
      codigo: 'CAMPO_DUPLICADO',
      campo: 'dni',
    });
    const onCambio = vi.fn();

    render(
      <FichaUsuarioPage usuario={null} soloLectura={false} onVolver={vi.fn()} onCambio={onCambio} />,
    );

    fireEvent.change(screen.getByLabelText('Nombres'), { target: { value: 'Juan Gómez' } });
    fireEvent.change(screen.getByLabelText('DNI'), { target: { value: '10000001' } });
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'D001' } });
    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'juan@example.com' } });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: 'docente' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Ya existe otro usuario con ese dni.'),
    );
    expect(onCambio).not.toHaveBeenCalled();
    expect(crearUsuario).toHaveBeenCalledTimes(1);
  });

  // [13.5] Edición: PATCH sólo con la forma de 4 campos (sin rol).
  it('[13.5] submit en edición llama a actualizarUsuario con el correo modificado', async () => {
    vi.mocked(actualizarUsuario).mockResolvedValue({ ok: true, data: usuarioDeEjemplo() });
    const onCambio = vi.fn();
    const usuario = usuarioDeEjemplo();

    render(
      <FichaUsuarioPage usuario={usuario} soloLectura={false} onVolver={vi.fn()} onCambio={onCambio} />,
    );

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'nuevo@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    await waitFor(() =>
      expect(actualizarUsuario).toHaveBeenCalledWith(usuario.id, {
        nombres: usuario.nombres,
        dni: usuario.dni,
        codigo: usuario.codigo,
        correo: 'nuevo@example.com',
      }),
    );
    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
  });

  // [14.1] Desactivar un usuario activo.
  it('[14.1] con estado activo, "Desactivar" pide confirmación y llama a cambiarEstadoUsuario(id, "inactivo")', async () => {
    vi.mocked(cambiarEstadoUsuario).mockResolvedValue({
      ok: true,
      data: { id: 'u1', estado: 'inactivo' },
    });
    const onCambio = vi.fn();

    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo({ estado: 'activo' })}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={onCambio}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }));

    await waitFor(() => expect(cambiarEstadoUsuario).toHaveBeenCalledWith('u1', 'inactivo'));
    await waitFor(() => expect(onCambio).toHaveBeenCalledTimes(1));
  });

  // [14.2] Activar un usuario inactivo.
  it('[14.2] con estado inactivo, la acción dice "Activar" y llama a cambiarEstadoUsuario(id, "activo")', async () => {
    vi.mocked(cambiarEstadoUsuario).mockResolvedValue({
      ok: true,
      data: { id: 'u1', estado: 'activo' },
    });

    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo({ estado: 'inactivo' })}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Activar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Activar' }));

    await waitFor(() => expect(cambiarEstadoUsuario).toHaveBeenCalledWith('u1', 'activo'));
  });

  // [14.3] Estado bloqueado: ninguna acción de estado, se muestra como texto.
  it('[14.3] con estado bloqueado no renderiza ninguna acción de estado', () => {
    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo({ estado: 'bloqueado' })}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.getByText(/bloqueado/i)).toBeInTheDocument();
  });

  // [14.4] Ningún botón "Eliminar" está disponible en la ficha.
  it('[14.4] no existe ningún botón "Eliminar" en la ficha', () => {
    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo()}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    expect(screen.queryByText(/eliminar/i)).not.toBeInTheDocument();
  });

  // [14.5] soloLectura=true: ninguna acción de estado, sin importar el estado.
  it('[14.5] con soloLectura=true no renderiza ninguna acción de estado', () => {
    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo({ estado: 'activo' })}
        soloLectura={true}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Desactivar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activar' })).not.toBeInTheDocument();
  });

  // [18.1] rol === 'estudiante' ⇒ PanelApoderados se monta con las props correctas.
  it('[18.1] con rol estudiante monta PanelApoderados con usuarioId y soloLectura', () => {
    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo({ rol: 'estudiante' })}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    const panel = screen.getByTestId('panel-apoderados');
    expect(panel).toHaveAttribute('data-usuario-id', 'u1');
    expect(panel).toHaveAttribute('data-solo-lectura', 'false');
  });

  // [18.2] Cualquier otro rol ⇒ PanelApoderados NO se monta (evita el 409 USUARIO_NO_ES_ESTUDIANTE).
  it('[18.2] con rol distinto de estudiante no monta PanelApoderados', () => {
    render(
      <FichaUsuarioPage
        usuario={usuarioDeEjemplo({ rol: 'docente' })}
        soloLectura={false}
        onVolver={vi.fn()}
        onCambio={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('panel-apoderados')).not.toBeInTheDocument();
  });

  it('llama a onVolver al hacer click en "Volver"', () => {
    const onVolver = vi.fn();
    render(
      <FichaUsuarioPage usuario={usuarioDeEjemplo()} soloLectura={false} onVolver={onVolver} onCambio={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onVolver).toHaveBeenCalledTimes(1);
  });
});
