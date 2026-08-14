import { useId, useState, type ChangeEvent } from 'react';

interface CampoArchivoProps {
  etiqueta: string;
  aceptar?: string;
  onCambiar: (archivo: File | null) => void;
  nombreActual?: string;
}

function formatearTamanio(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Presentacional puro (design.md D13, tasks.md 20.3): input de archivo con
 * preview de nombre/tamaño, sin efectos propios. Reutilizado por
 * `FormularioCandidato` (foto) y `FormularioLista` (plan de trabajo, PR8
 * también). `nombreActual` cubre el modo edición: muestra el archivo ya
 * almacenado hasta que se elige uno nuevo.
 */
export function CampoArchivo({ etiqueta, aceptar, onCambiar, nombreActual }: CampoArchivoProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const idCampo = useId();

  function manejarCambio(evento: ChangeEvent<HTMLInputElement>) {
    const seleccionado = evento.target.files?.[0] ?? null;
    setArchivo(seleccionado);
    onCambiar(seleccionado);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={idCampo} className="text-label-md text-on-surface-variant">
        {etiqueta}
      </label>
      <input
        id={idCampo}
        type="file"
        accept={aceptar}
        onChange={manejarCambio}
        className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface file:mr-3 file:rounded-control file:border-0 file:bg-primary-container file:px-3 file:py-1.5 file:text-label-md file:text-on-primary-container focus-visible:outline-2 focus-visible:outline-primary"
      />
      {archivo && (
        <p className="text-caption text-on-surface-variant">
          {archivo.name} · {formatearTamanio(archivo.size)}
        </p>
      )}
      {!archivo && nombreActual && (
        <p className="text-caption text-on-surface-variant">Actual: {nombreActual}</p>
      )}
    </div>
  );
}
