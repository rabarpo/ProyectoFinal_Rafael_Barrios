import { urlFoto } from '../candidatos-api';
import type { CandidatoRespuestaDto, ListaRespuestaDto } from '../candidatos-api';

interface TablaCandidatosProps {
  candidatos: CandidatoRespuestaDto[];
  listas: ListaRespuestaDto[];
  onEditar: (id: string) => void;
  onDarBaja: (id: string) => void;
  onReactivar: (id: string) => void;
  onBorrar: (id: string) => void;
}

/**
 * Presentacional puro (design.md D13, tasks.md 23.1): filas con
 * foto/nombres/cargo/lista/estado, sin fetch propio — recibe `candidatos`/
 * `listas` ya cargados por `GestionCandidatosPage` y delega las acciones a
 * callbacks. `onDarBaja`/`onReactivar` reflejan D6 (baja distinta del
 * borrado físico); `onBorrar` es el borrado guardado (D7), cuyo rechazo
 * `409 ENTIDAD_CON_DEPENDIENTES` lo maneja el contenedor.
 */
export function TablaCandidatos({
  candidatos,
  listas,
  onEditar,
  onDarBaja,
  onReactivar,
  onBorrar,
}: TablaCandidatosProps) {
  function nombreLista(listaId?: string): string {
    if (!listaId) return 'Sin lista';
    return listas.find((lista) => lista.id === listaId)?.nombre ?? 'Sin lista';
  }

  if (candidatos.length === 0) {
    return (
      <p className="p-6 text-body-md text-on-surface-variant">
        Todavía no hay candidatos registrados en este proceso.
      </p>
    );
  }

  return (
    <ul>
      {candidatos.map((candidato) => (
        <li
          key={candidato.id}
          className="flex items-center justify-between gap-4 border-b border-border-gray px-6 py-4 last:border-b-0"
        >
          <div className="flex items-center gap-4">
            {candidato.foto_presente && (
              <img
                src={urlFoto(candidato.id)}
                alt={candidato.nombres}
                className="h-10 w-10 rounded-full object-cover"
              />
            )}
            <div>
              <p className="text-body-md text-on-surface">{candidato.nombres}</p>
              <p className="text-caption text-on-surface-variant">
                <span>{candidato.cargo ?? 'Sin cargo'}</span>{' · '}
                <span>{nombreLista(candidato.lista_id)}</span>{' · '}
                <span>{candidato.estado}</span>
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              className="rounded-control px-3 py-2 text-label-md text-primary hover:bg-surface-container"
              onClick={() => onEditar(candidato.id)}
            >
              Editar
            </button>
            {candidato.estado === 'activo' ? (
              <button
                type="button"
                className="rounded-control px-3 py-2 text-label-md text-on-surface-variant hover:bg-surface-container"
                onClick={() => onDarBaja(candidato.id)}
              >
                Dar de baja
              </button>
            ) : (
              <button
                type="button"
                className="rounded-control px-3 py-2 text-label-md text-on-surface-variant hover:bg-surface-container"
                onClick={() => onReactivar(candidato.id)}
              >
                Reactivar
              </button>
            )}
            <button
              type="button"
              className="rounded-control px-3 py-2 text-label-md text-error hover:bg-surface-container"
              onClick={() => onBorrar(candidato.id)}
            >
              Eliminar
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
