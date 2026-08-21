import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { listarUsuarios } from './usuarios-api';
import type { UsuarioRespuestaDto } from './usuarios-api';
import { TablaGenerica } from '../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../comun/piezas/TablaGenerica';
import { FichaUsuarioPage } from './FichaUsuarioPage';

const PAGINA = 25;

const OPCIONES_ROL = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'estudiante', etiqueta: 'Estudiante' },
  { valor: 'docente', etiqueta: 'Docente' },
  { valor: 'comite', etiqueta: 'Comité' },
  { valor: 'administrador', etiqueta: 'Administrador' },
  { valor: 'director', etiqueta: 'Director' },
];

const OPCIONES_ESTADO = [
  { valor: '', etiqueta: 'Todos' },
  { valor: 'activo', etiqueta: 'Activo' },
  { valor: 'inactivo', etiqueta: 'Inactivo' },
  { valor: 'bloqueado', etiqueta: 'Bloqueado' },
];

/**
 * administracion-usuarios-apoderados, PR2 (#27; design.md D4, tasks.md 5.3) — gate binario
 * allowlist fail-closed. PR4 (design.md D3/D12, tasks.md 10.1-12.4) agrega el listado real:
 * filtros `rol`/`estado` server-side, `TablaGenerica` (sin tocar, `#26`) y paginación en cliente
 * (`PAGINA = 25`, `slice` acá — la pieza genérica sigue sin orden/paginación/selección propias).
 * La selección de fila abre `FichaUsuarioPage` en estado local (`usuarioSeleccionado`, D1: nunca
 * en la URL). PR5 (design.md D8/D9, tasks.md Phase 13-15) reemplaza el placeholder anterior por
 * la ficha real: alta/edición sin campo de contraseña y cambio de estado con confirmación.
 * `mostrandoFicha` es un booleano aparte de `usuarioSeleccionado` porque el modo creación de
 * `FichaUsuarioPage` recibe `usuario: null` a propósito — sin este segundo estado, "sin ficha
 * abierta" y "ficha en modo creación" colapsarían en el mismo valor `null` (gap detectado post-PR5,
 * el listado no tenía forma de alcanzar el modo creación ya implementado y probado en la ficha).
 */
export function UsuariosPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const puedeGestionar = rol === 'administrador' || rol === 'director';

  const [filtroRol, setFiltroRol] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filas, setFilas] = useState<UsuarioRespuestaDto[]>([]);
  const [pagina, setPagina] = useState(0);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<UsuarioRespuestaDto | null>(null);
  // Distingue "sin ficha abierta" (listado) de "ficha abierta en modo creación" (usuario null a
  // propósito) — usuarioSeleccionado solo no alcanza para eso, colapsaría ambos casos en null.
  const [mostrandoFicha, setMostrandoFicha] = useState(false);

  const filtros = useMemo(() => {
    const f: { rol?: string; estado?: string } = {};
    if (filtroRol) f.rol = filtroRol;
    if (filtroEstado) f.estado = filtroEstado;
    return f;
  }, [filtroRol, filtroEstado]);

  const cargar = useCallback(async () => {
    const { data } = await listarUsuarios(filtros);
    setFilas(data ?? []);
  }, [filtros]);

  useEffect(() => {
    if (!puedeGestionar) return;
    cargar();
  }, [puedeGestionar, cargar]);

  // D12: cambiar de filtro mientras se está en una página avanzada no debe dejar al usuario
  // varado en una página fuera de rango del resultado nuevo.
  useEffect(() => {
    setPagina(0);
  }, [filtroRol, filtroEstado]);

  if (!puedeGestionar) {
    return (
      <p
        role="status"
        className="mx-auto w-full max-w-page px-5 py-6 text-body-md text-on-surface-variant md:px-12"
      >
        Esta sección no está disponible para tu rol.
      </p>
    );
  }

  if (mostrandoFicha) {
    return (
      <FichaUsuarioPage
        usuario={usuarioSeleccionado}
        soloLectura={!puedeGestionar}
        onVolver={() => {
          setMostrandoFicha(false);
          setUsuarioSeleccionado(null);
        }}
        onCambio={() => {
          setMostrandoFicha(false);
          setUsuarioSeleccionado(null);
          cargar();
        }}
      />
    );
  }

  const columnas: ColumnaTabla<UsuarioRespuestaDto>[] = [
    { clave: 'nombres', encabezado: 'Nombres', celda: (fila) => fila.nombres },
    { clave: 'dni', encabezado: 'DNI', celda: (fila) => fila.dni },
    { clave: 'codigo', encabezado: 'Código', celda: (fila) => fila.codigo },
    { clave: 'correo', encabezado: 'Correo', celda: (fila) => fila.correo },
    { clave: 'rol', encabezado: 'Rol', celda: (fila) => fila.rol },
    { clave: 'estado', encabezado: 'Estado', celda: (fila) => fila.estado },
  ];

  const acciones: AccionFila<UsuarioRespuestaDto>[] = [
    {
      id: 'abrir',
      etiqueta: 'Abrir',
      onEjecutar: (fila) => {
        setUsuarioSeleccionado(fila);
        setMostrandoFicha(true);
      },
    },
  ];

  const inicio = pagina * PAGINA;
  const filasPagina = filas.slice(inicio, inicio + PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / PAGINA));

  return (
    <div data-testid="usuarios-page-shell" className="mx-auto w-full max-w-page px-5 md:px-12">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">Usuarios</h1>
        <button
          type="button"
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
          onClick={() => {
            setUsuarioSeleccionado(null);
            setMostrandoFicha(true);
          }}
        >
          Crear
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-rol" className="text-label-md text-on-surface-variant">
            Rol
          </label>
          <select
            id="filtro-rol"
            value={filtroRol}
            onChange={(evento) => setFiltroRol(evento.target.value)}
            className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
          >
            {OPCIONES_ROL.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-estado" className="text-label-md text-on-surface-variant">
            Estado
          </label>
          <select
            id="filtro-estado"
            value={filtroEstado}
            onChange={(evento) => setFiltroEstado(evento.target.value)}
            className="rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface"
          >
            {OPCIONES_ESTADO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-card border border-border-gray bg-surface-white shadow-elevation">
        <TablaGenerica
          columnas={columnas}
          filas={filasPagina}
          claveFila={(fila) => fila.id}
          mensajeVacio="No hay usuarios para este filtro."
          acciones={acciones}
        />

        {filas.length > 0 && (
          <div className="flex items-center justify-between border-t border-border-gray px-4 py-3">
            <p className="text-label-md text-on-surface-variant">
              Mostrando {inicio + 1}–{Math.min(inicio + PAGINA, filas.length)} de {filas.length}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
                className="rounded-control px-4 py-2 text-label-md text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
              >
                Anterior
              </button>
              <button
                type="button"
                disabled={pagina + 1 >= totalPaginas}
                onClick={() => setPagina((p) => p + 1)}
                className="rounded-control px-4 py-2 text-label-md text-primary transition-colors hover:bg-primary/10 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
