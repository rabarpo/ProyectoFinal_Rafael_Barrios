import { useId, useState, type ChangeEvent } from 'react';

interface CampoDominiosProps {
  valor: string[];
  onCambiar: (dominios: string[]) => void;
  deshabilitado?: boolean;
}

/**
 * Presentacional puro y controlado (design.md D4, tasks.md Fase 8): alta/baja
 * de `dominios_google` como arreglo. Sin fetch, sin `useSesion()`, sin `<form>`
 * propio — "Agregar"/"Quitar" son `type="button"` y solo mutan el arreglo que
 * vive en `PanelDatosInstitucionales` (PR3b); el único disparador del `PUT`
 * sigue siendo el "Guardar cambios" del `FormularioGenerico` hermano. Hermana
 * de `FormularioGenerico` porque esa pieza solo maneja `Record<string, string>`,
 * no arreglos — mismo criterio de "un solo consumidor" que `CampoArchivo` en
 * `candidatos/piezas/`.
 *
 * Guarda mínima local: ignora vacío tras `trim()` y duplicados (`toLowerCase()`,
 * igual que `normalizarYValidarDominiosGoogle` del backend). El formato del
 * dominio lo valida el backend — el 400 se traduce vía `mensajeDeError` (D7).
 */
export function CampoDominios({ valor, onCambiar, deshabilitado }: CampoDominiosProps) {
  const [nuevoDominio, setNuevoDominio] = useState('');
  const idCampo = useId();

  function manejarCambio(evento: ChangeEvent<HTMLInputElement>) {
    setNuevoDominio(evento.target.value);
  }

  function agregar() {
    const candidato = nuevoDominio.trim();
    if (candidato === '') return;
    const yaExiste = valor.some((dominio) => dominio.toLowerCase() === candidato.toLowerCase());
    if (yaExiste) return;
    onCambiar([...valor, candidato]);
    setNuevoDominio('');
  }

  function quitar(indice: number) {
    onCambiar(valor.filter((_, i) => i !== indice));
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={idCampo} className="text-label-md text-on-surface-variant">
        Dominios de Google Workspace permitidos
      </label>
      <div className="flex gap-2">
        <input
          id={idCampo}
          type="text"
          value={nuevoDominio}
          onChange={manejarCambio}
          disabled={deshabilitado}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
        />
        <button
          type="button"
          onClick={agregar}
          disabled={deshabilitado}
          className="rounded-control bg-primary px-4 py-2 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      {valor.length === 0 ? (
        <p className="text-caption text-on-surface-variant">
          Ningún dominio permitido para login de Google Workspace.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {valor.map((dominio, indice) => (
            <li
              key={`${dominio}-${indice}`}
              className="flex items-center justify-between rounded-control border border-border-gray px-3 py-1.5"
            >
              <span className="text-body-md text-on-surface">{dominio}</span>
              <button
                type="button"
                onClick={() => quitar(indice)}
                disabled={deshabilitado}
                className="text-label-md text-primary disabled:opacity-50"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
