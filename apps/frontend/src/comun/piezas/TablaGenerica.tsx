import type { ReactNode } from 'react';

export interface ColumnaTabla<T> {
  clave: string;
  encabezado: string;
  celda: (fila: T) => ReactNode;
}

export interface AccionFila<T> {
  id: string;
  etiqueta: string;
  onEjecutar: (fila: T) => void;
  tono?: 'normal' | 'peligro';
  visible?: (fila: T) => boolean;
}

interface TablaGenericaProps<T> {
  columnas: ColumnaTabla<T>[];
  filas: T[];
  claveFila: (fila: T) => string;
  mensajeVacio: string;
  acciones?: AccionFila<T>[];
}

/**
 * Presentacional puro (design.md D3, tasks.md Fase 6). `<table>` real, sin
 * orden/paginación/selección — ningún consumidor actual las necesita.
 * `acciones` es la mecánica de la que depende D8: un contenedor que pasa
 * `acciones={[]}` (rol comité) no renderiza ninguna columna de escritura, en
 * vez de mostrar botones `disabled`. Nunca lee `useSesion()` (D8): la
 * decisión de qué acciones ofrecer vive en el panel contenedor.
 */
export function TablaGenerica<T>({
  columnas,
  filas,
  claveFila,
  mensajeVacio,
  acciones = [],
}: TablaGenericaProps<T>) {
  const hayAcciones = acciones.length > 0;

  if (filas.length === 0) {
    return <p className="p-6 text-body-md text-on-surface-variant">{mensajeVacio}</p>;
  }

  return (
    <table className="w-full overflow-hidden rounded-card text-left">
      <thead>
        <tr className="bg-primary-fixed">
          {columnas.map((columna) => (
            <th key={columna.clave} className="px-4 py-3 text-label-md text-on-primary-fixed">
              {columna.encabezado}
            </th>
          ))}
          {hayAcciones && (
            <th className="px-4 py-3 text-label-md text-on-primary-fixed">Acciones</th>
          )}
        </tr>
      </thead>
      <tbody>
        {filas.map((fila) => (
          <tr
            key={claveFila(fila)}
            className="border-b border-border-gray transition-colors last:border-b-0 even:bg-surface hover:bg-primary/5"
          >
            {columnas.map((columna) => (
              <td key={columna.clave} className="px-4 py-3 text-body-md text-on-surface">
                {columna.celda(fila)}
              </td>
            ))}
            {hayAcciones && (
              <td className="flex gap-2 px-4 py-3">
                {acciones
                  .filter((accion) => accion.visible?.(fila) ?? true)
                  .map((accion) => (
                    <button
                      key={accion.id}
                      type="button"
                      onClick={() => accion.onEjecutar(fila)}
                      className={
                        accion.tono === 'peligro'
                          ? 'rounded-control px-3 py-2 text-label-md text-error transition-colors hover:bg-error/10'
                          : 'rounded-control px-3 py-2 text-label-md text-primary transition-colors hover:bg-primary/10'
                      }
                    >
                      {accion.etiqueta}
                    </button>
                  ))}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
