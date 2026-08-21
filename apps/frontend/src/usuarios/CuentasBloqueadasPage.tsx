import { useCallback, useEffect, useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { desbloquearCuenta, listarCuentasBloqueadas } from './usuarios-api';
import type { UsuarioBloqueadoDto } from './usuarios-api';
import { mensajeDeError } from './mensajes-error';
import { TablaGenerica } from '../comun/piezas/TablaGenerica';
import type { AccionFila, ColumnaTabla } from '../comun/piezas/TablaGenerica';
import { DialogoConfirmacion } from '../comun/piezas/DialogoConfirmacion';

function formatearBloqueadoHasta(valor: string | null): string {
  if (valor === null) return 'Indefinido';
  return new Date(valor).toLocaleString();
}

const COLUMNAS: ColumnaTabla<UsuarioBloqueadoDto>[] = [
  { clave: 'id', encabezado: 'ID', celda: (fila) => fila.id },
  { clave: 'nombres', encabezado: 'Nombres', celda: (fila) => fila.nombres },
  { clave: 'dni', encabezado: 'DNI', celda: (fila) => fila.dni },
  { clave: 'codigo', encabezado: 'Código', celda: (fila) => fila.codigo },
  {
    clave: 'bloqueado_hasta',
    encabezado: 'Bloqueado hasta',
    celda: (fila) => formatearBloqueadoHasta(fila.bloqueado_hasta),
  },
];

/**
 * administracion-usuarios-apoderados, PR7 (#27; design.md D4/D11, tasks.md Fase 19-20). Segundo
 * gate BINARIO allowlist fail-closed, independiente del de `UsuariosPage` (no comparten
 * booleano): `puedeDesbloquear = rol === 'comite'`. Con el gate abierto, lista
 * `GET /auth/usuarios/bloqueados` (siempre `estado === 'bloqueado'`, D11 — no hace falta filtrar
 * por fila) y ofrece "Desbloquear" por fila, mediado por `DialogoConfirmacion` cuyo texto
 * menciona explícitamente que la acción queda registrada en auditoría (ADR-0008: no es un botón
 * silencioso). Confirmar recarga el listado en vez de quitar la fila localmente — es la única
 * forma de reflejar el `desbloqueado: false` idempotente que devuelve el backend cuando la cuenta
 * ya se había recuperado por expiración perezosa (D11).
 */
export function CuentasBloqueadasPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const puedeDesbloquear = rol === 'comite';

  const [filas, setFilas] = useState<UsuarioBloqueadoDto[]>([]);
  const [filaADesbloquear, setFilaADesbloquear] = useState<UsuarioBloqueadoDto | undefined>(undefined);
  const [procesandoDialogo, setProcesandoDialogo] = useState(false);
  const [mensajeErrorDialogo, setMensajeErrorDialogo] = useState<string | undefined>(undefined);

  const recargar = useCallback(async () => {
    const resultado = await listarCuentasBloqueadas();
    setFilas(resultado.ok ? (resultado.data ?? []) : []);
  }, []);

  useEffect(() => {
    if (!puedeDesbloquear) return;
    recargar();
  }, [puedeDesbloquear, recargar]);

  async function confirmarDesbloqueo() {
    if (!filaADesbloquear) return;
    setProcesandoDialogo(true);
    setMensajeErrorDialogo(undefined);
    const resultado = await desbloquearCuenta(filaADesbloquear.id);
    setProcesandoDialogo(false);
    if (!resultado.ok) {
      setMensajeErrorDialogo(mensajeDeError({ codigo: resultado.codigo, status: resultado.status }));
      return;
    }
    setFilaADesbloquear(undefined);
    await recargar();
  }

  function cancelarDesbloqueo() {
    setFilaADesbloquear(undefined);
    setMensajeErrorDialogo(undefined);
  }

  if (!puedeDesbloquear) {
    return (
      <p role="status" className="mx-auto w-full max-w-page px-5 py-6 text-body-md text-on-surface-variant md:px-12">
        Esta sección no está disponible para tu rol.
      </p>
    );
  }

  const acciones: AccionFila<UsuarioBloqueadoDto>[] = [
    { id: 'desbloquear', etiqueta: 'Desbloquear', onEjecutar: (fila) => setFilaADesbloquear(fila) },
  ];

  return (
    <div data-testid="cuentas-bloqueadas-page-shell" className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="mb-6 text-headline-lg-mobile text-primary md:text-headline-lg">Cuentas bloqueadas</h1>

      <div className="rounded-card border border-border-gray bg-surface-white shadow-elevation">
        <TablaGenerica
          columnas={COLUMNAS}
          filas={filas}
          claveFila={(fila) => fila.id}
          mensajeVacio="No hay cuentas bloqueadas."
          acciones={acciones}
        />
      </div>

      {filaADesbloquear && (
        <div className="mt-4">
          <DialogoConfirmacion
            titulo="Desbloquear cuenta"
            descripcion="Esta acción queda registrada en auditoría. ¿Confirmás desbloquear esta cuenta?"
            etiquetaConfirmar="Desbloquear"
            onConfirmar={confirmarDesbloqueo}
            onCancelar={cancelarDesbloqueo}
            procesando={procesandoDialogo}
          />
          {mensajeErrorDialogo && (
            <p role="alert" className="mt-2 text-label-md text-error">
              {mensajeErrorDialogo}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
