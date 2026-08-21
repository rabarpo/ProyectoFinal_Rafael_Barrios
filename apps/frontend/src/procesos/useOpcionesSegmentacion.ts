import { useEffect, useState } from 'react';
import {
  listarAniosEscolares,
  listarAulas,
  listarGrados,
  listarNiveles,
  listarSecciones,
} from '../academico/academico-api';
import type {
  AulaRespuestaDto,
  GradoRespuestaDto,
  NivelRespuestaDto,
  SeccionRespuestaDto,
} from '../academico/academico-api';

export interface EstadoLista<T> {
  cargando: boolean;
  datos: T[];
  error: boolean;
}

function vacio<T>(): EstadoLista<T> {
  return { cargando: false, datos: [], error: false };
}

/**
 * Carga los Niveles una sola vez (paso 2 del asistente, selector de
 * `nivel_id` y filtro auxiliar para acotar Grados). Sin dependencias: la
 * lista no cambia durante el asistente.
 */
export function useNiveles(): EstadoLista<NivelRespuestaDto> {
  const [estado, setEstado] = useState<EstadoLista<NivelRespuestaDto>>(vacio);

  useEffect(() => {
    const controller = new AbortController();
    let cancelado = false;
    setEstado((anterior) => ({ ...anterior, cargando: true, error: false }));

    listarNiveles(controller.signal)
      .then(({ data, response }) => {
        if (cancelado) return;
        if (response.ok && data) setEstado({ cargando: false, datos: data, error: false });
        else setEstado({ cargando: false, datos: [], error: true });
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({ cargando: false, datos: [], error: true });
      });

    return () => {
      cancelado = true;
      controller.abort();
    };
  }, []);

  return estado;
}

/**
 * Carga Grados filtrados por Nivel cuando el usuario eligió uno en el
 * selector auxiliar (server-side vía `nivel_id` — `GradosController` ya lo
 * soporta, PR4 de administracion-academica); sin filtro, trae todos los
 * Grados.
 */
export function useGrados(nivelId: string | undefined): EstadoLista<GradoRespuestaDto> {
  const [estado, setEstado] = useState<EstadoLista<GradoRespuestaDto>>(vacio);

  useEffect(() => {
    const controller = new AbortController();
    let cancelado = false;
    setEstado((anterior) => ({ ...anterior, cargando: true, error: false }));

    listarGrados(nivelId ? { nivel_id: nivelId } : undefined, controller.signal)
      .then(({ data, response }) => {
        if (cancelado) return;
        if (response.ok && data) setEstado({ cargando: false, datos: data, error: false });
        else setEstado({ cargando: false, datos: [], error: true });
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({ cargando: false, datos: [], error: true });
      });

    return () => {
      cancelado = true;
      controller.abort();
    };
  }, [nivelId]);

  return estado;
}

/**
 * Carga Secciones filtradas por Grado cuando el usuario eligió uno en el selector auxiliar
 * (server-side vía `grado_id` — `SeccionesController` ya lo soporta, PR5 de
 * administracion-academica); sin filtro, trae todas las Secciones. Usado por `FormularioCandidato`
 * para resolver el nombre de Sección de cada Aula al componer su etiqueta legible.
 */
export function useSecciones(gradoId: string | undefined): EstadoLista<SeccionRespuestaDto> {
  const [estado, setEstado] = useState<EstadoLista<SeccionRespuestaDto>>(vacio);

  useEffect(() => {
    const controller = new AbortController();
    let cancelado = false;
    setEstado((anterior) => ({ ...anterior, cargando: true, error: false }));

    listarSecciones(gradoId ? { grado_id: gradoId } : undefined, controller.signal)
      .then(({ data, response }) => {
        if (cancelado) return;
        if (response.ok && data) setEstado({ cargando: false, datos: data, error: false });
        else setEstado({ cargando: false, datos: [], error: true });
      })
      .catch(() => {
        if (cancelado) return;
        setEstado({ cargando: false, datos: [], error: true });
      });

    return () => {
      cancelado = true;
      controller.abort();
    };
  }, [gradoId]);

  return estado;
}

/**
 * Carga Aulas filtradas por Grado cuando el usuario eligió uno en el
 * selector auxiliar (server-side vía `grado_id` — `AulasController` ya lo
 * soporta, PR6 de administracion-academica). Sin ese filtro, se acota al
 * único AnioEscolar activo (`anio_escolar_id`) en vez de traer aulas de
 * TODOS los años escolares, incluidos los ya cerrados.
 */
export function useAulas(gradoId: string | undefined): EstadoLista<AulaRespuestaDto> {
  const [estado, setEstado] = useState<EstadoLista<AulaRespuestaDto>>(vacio);

  useEffect(() => {
    const controller = new AbortController();
    let cancelado = false;
    setEstado((anterior) => ({ ...anterior, cargando: true, error: false }));

    async function cargar() {
      const filtros: { grado_id?: string; anio_escolar_id?: string } = {};

      if (gradoId) {
        filtros.grado_id = gradoId;
      } else {
        const anios = await listarAniosEscolares({ activo: 'true' }, controller.signal);
        if (cancelado) return;
        if (!anios.response.ok || !anios.data) {
          setEstado({ cargando: false, datos: [], error: true });
          return;
        }
        const anioActivo = anios.data[0];
        if (!anioActivo) {
          // Sin AnioEscolar activo: no hay aulas que ofrecer, pero no es un
          // error de red — lista vacía en vez de `error: true`.
          setEstado({ cargando: false, datos: [], error: false });
          return;
        }
        filtros.anio_escolar_id = anioActivo.id;
      }

      const { data, response } = await listarAulas(filtros, controller.signal);
      if (cancelado) return;
      if (response.ok && data) setEstado({ cargando: false, datos: data, error: false });
      else setEstado({ cargando: false, datos: [], error: true });
    }

    cargar().catch(() => {
      if (cancelado) return;
      setEstado({ cargando: false, datos: [], error: true });
    });

    return () => {
      cancelado = true;
      controller.abort();
    };
  }, [gradoId]);

  return estado;
}
