import type { PapeletaDto, PapeletaOpcionDto } from '../votos-api';
import { urlFotoOpcion, urlPlanTrabajoOpcion } from '../votos-api';
import { BarraProgresoVotacion } from './BarraProgresoVotacion';
import { BannerInstrucciones } from './BannerInstrucciones';
import { TarjetaLista } from './TarjetaLista';
import { TarjetaCandidato } from './TarjetaCandidato';
import { TarjetaOpcion } from './TarjetaOpcion';
import { TarjetaVotoBlanco } from './TarjetaVotoBlanco';

export type Seleccion = { tipo: 'opcion'; id: string } | { tipo: 'blanco' };

interface PasoBoletaProps {
  opciones: PapeletaOpcionDto[];
  tipo: PapeletaDto['proceso']['tipo'];
  derechoVotoId: string;
  seleccion: Seleccion | undefined;
  onSeleccionar: (seleccion: Seleccion) => void;
  onContinuar: () => void;
  onVolver: () => void;
}

/**
 * rediseno-boleta-votacion, PR4 (design.md D6/D7, tasks.md 17.1-18.1). Reescritura completa:
 * consume las 4 piezas de tarjeta de PR3, eligiendo la variante por `tipo` de proceso
 * (`PapeletaDto['proceso']['tipo']`), NUNCA por heurística sobre los campos presentes de
 * `opcion`. `TarjetaVotoBlanco` es siempre una tarjeta adicional, nunca preseleccionada.
 *
 * Invariante crítica de `Seleccion` (D6): el `id` notificado por `onSeleccionar` es SIEMPRE
 * `opcion.id` (`Lista.id`/`Candidato.id`/`OpcionConsulta.id`), NUNCA `opcion.candidato_id` —
 * `candidato_id` solo sirve para resolver la foto/nombre del cabeza de lista en `municipio`.
 * Usarlo como id de selección haría que `campoEleccion('municipio')` (`VotacionPage`) enviara un
 * uuid de `Candidato` en `lista_id`, y el backend lo rechazaría como `ELECCION_INVALIDA`.
 *
 * Presentacional puro, sin estado propio: las tarjetas son controladas por `seleccion` (prop),
 * así que no hace falta espejar la selección en estado local (a diferencia de la versión previa).
 */
export function PasoBoleta({
  opciones,
  tipo,
  derechoVotoId,
  seleccion,
  onSeleccionar,
  onContinuar,
  onVolver,
}: PasoBoletaProps) {
  function seleccionarOpcion(id: string) {
    onSeleccionar({ tipo: 'opcion', id });
  }

  function verPropuesta(id: string) {
    window.open(urlPlanTrabajoOpcion(derechoVotoId, id), '_blank', 'noopener');
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <BarraProgresoVotacion pasoActual={2} totalPasos={3} />

      <h2 className="mt-4 text-headline-lg-mobile text-primary md:text-headline-lg">Elegí tu opción</h2>

      <div className="mt-4">
        <BannerInstrucciones />
      </div>

      <div role="radiogroup" aria-label="Opciones de la boleta" className="mt-4 grid gap-4 md:grid-cols-3">
        {opciones.map((opcion) => {
          const seleccionada = seleccion?.tipo === 'opcion' && seleccion.id === opcion.id;

          if (tipo === 'municipio') {
            return (
              <TarjetaLista
                key={opcion.id}
                opcion={opcion}
                seleccionada={seleccionada}
                onSeleccionar={() => seleccionarOpcion(opcion.id)}
                urlFoto={opcion.candidato_id ? urlFotoOpcion(derechoVotoId, opcion.candidato_id) : undefined}
                onVerPropuesta={() => verPropuesta(opcion.id)}
              />
            );
          }

          if (tipo === 'representante_aula' || tipo === 'padres') {
            return (
              <TarjetaCandidato
                key={opcion.id}
                opcion={opcion}
                seleccionada={seleccionada}
                onSeleccionar={() => seleccionarOpcion(opcion.id)}
                urlFoto={urlFotoOpcion(derechoVotoId, opcion.candidato_id ?? opcion.id)}
              />
            );
          }

          return (
            <TarjetaOpcion
              key={opcion.id}
              opcion={opcion}
              seleccionada={seleccionada}
              onSeleccionar={() => seleccionarOpcion(opcion.id)}
            />
          );
        })}

        <TarjetaVotoBlanco
          seleccionada={seleccion?.tipo === 'blanco'}
          onSeleccionar={() => onSeleccionar({ tipo: 'blanco' })}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={onVolver}
          className="rounded-control px-4 py-3 text-label-md text-primary focus-visible:outline-2 focus-visible:outline-primary"
        >
          Volver al paso anterior
        </button>
        <button
          type="button"
          onClick={onContinuar}
          disabled={!seleccion}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Siguiente Paso
        </button>
      </div>
    </div>
  );
}
