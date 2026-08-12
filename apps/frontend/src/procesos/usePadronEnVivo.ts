import { useEffect, useRef, useState } from 'react';
import { padron } from './procesos-api';
import type { PadronRespuestaDto } from './procesos-api';
import type { Segmentacion } from './wizard-reducer';

export interface EstadoPadron {
  cargando: boolean;
  datos: PadronRespuestaDto | undefined;
  error: boolean;
}

const DEBOUNCE_MS = 300;

/**
 * Una segmentación solo dispara el conteo cuando tiene lo mínimo que el
 * backend exige por `alcance` (design.md, "Contratos HTTP" — `SegmentacionDto`):
 * sin esto, `PasoPadron` pediría un conteo con un `nivel_id`/`grado_ids`/
 * `aula_ids` vacío en cuanto el usuario elige el radio, antes de completar la
 * selección.
 */
function segmentacionCompleta(segmentacion: Segmentacion): boolean {
  if (!segmentacion.publico_objetivo || !segmentacion.alcance) return false;
  switch (segmentacion.alcance) {
    case 'nivel':
      return Boolean(segmentacion.nivel_id);
    case 'grados':
      return segmentacion.grado_ids.length > 0;
    case 'aulas':
      return segmentacion.aula_ids.length > 0;
    case 'institucion':
      return true;
    default:
      return false;
  }
}

const ESTADO_VACIO: EstadoPadron = { cargando: false, datos: undefined, error: false };

/**
 * Conteo de padrón en vivo (design.md D7, "Carrera de conteos"): debounce de
 * 300 ms tras cada cambio de segmentación, y una petición con
 * `AbortController` propio. Cada petición lleva un número de secuencia
 * creciente (`secuenciaRef`) — la petición anterior se aborta al cambiar la
 * segmentación (spec: 26.3), y toda respuesta que no sea la última emitida
 * se descarta aunque llegue después de una más reciente (spec: 26.2, "fuera
 * de orden no pisa el conteo vigente"). Solo `debounce` no alcanza: dos
 * respuestas fuera de orden dejarían en pantalla el padrón de una
 * segmentación ya descartada (design.md D7, tabla "Carrera de conteos").
 */
export function usePadronEnVivo(segmentacion: Segmentacion): EstadoPadron {
  const [estado, setEstado] = useState<EstadoPadron>(ESTADO_VACIO);
  const secuenciaRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  const publicoObjetivo = segmentacion.publico_objetivo;
  const alcance = segmentacion.alcance;
  const nivelId = segmentacion.nivel_id;
  const gradoIds = segmentacion.grado_ids.join(',');
  const aulaIds = segmentacion.aula_ids.join(',');

  useEffect(() => {
    // Cambió la segmentación: la petición en vuelo (si la hay) queda
    // desactualizada de inmediato.
    controllerRef.current?.abort();

    if (!segmentacionCompleta(segmentacion)) {
      setEstado(ESTADO_VACIO);
      return;
    }

    const secuencia = ++secuenciaRef.current;
    let cancelado = false;

    const temporizador = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      setEstado((anterior) => ({ ...anterior, cargando: true, error: false }));

      padron(
        {
          publico_objetivo: segmentacion.publico_objetivo!,
          alcance: segmentacion.alcance!,
          nivel_id: segmentacion.nivel_id,
          grado_ids: segmentacion.grado_ids,
          aula_ids: segmentacion.aula_ids,
        },
        controller.signal,
      )
        .then(({ data, response }) => {
          if (cancelado || secuencia !== secuenciaRef.current) return;
          if (response.ok && data) {
            setEstado({ cargando: false, datos: data, error: false });
          } else {
            setEstado({ cargando: false, datos: undefined, error: true });
          }
        })
        .catch(() => {
          if (cancelado || secuencia !== secuenciaRef.current) return;
          setEstado({ cargando: false, datos: undefined, error: true });
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      controllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicoObjetivo, alcance, nivelId, gradoIds, aulaIds]);

  return estado;
}
