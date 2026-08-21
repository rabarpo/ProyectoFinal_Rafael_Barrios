import { useEffect, useState } from 'react';
import { listar } from './procesos-api';
import type { ProcesoRespuestaDto } from './procesos-api';
import { navegar } from '../app/useRuta';

/**
 * Punto de entrada al módulo de candidatos (design.md D12): sin este índice
 * no hay forma de alcanzar los candidatos de un proceso creado en otra
 * sesión. Reutiliza `procesos-api.listar()` (#11, sin consumidor hasta este
 * PR). Tokens exclusivamente de `index.css`, mismo lenguaje visual que
 * `ProcesoWizardPage`/`LoginPage` (design.md D13). "Abrir proceso" (design.md
 * D13, `#13`/PR5, tasks.md 18.3) solo aparece cuando `estado === 'borrador'`:
 * es la única transición de estado que este índice expone.
 */
export function ProcesosIndexPage() {
  const [procesos, setProcesos] = useState<ProcesoRespuestaDto[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    listar()
      .then(({ data }) => {
        if (activo) setProcesos(data ?? []);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
            Procesos electorales
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Elegí un proceso para gestionar sus candidatos o creá uno nuevo.
          </p>
        </div>
        <button
          type="button"
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container"
          onClick={() => navegar({ nombre: 'proceso-nuevo' })}
        >
          Nuevo proceso
        </button>
      </div>

      <div className="rounded-card border border-border-gray bg-surface-white shadow-elevation">
        {cargando && (
          <p className="p-6 text-body-md text-on-surface-variant">Cargando procesos…</p>
        )}

        {!cargando && procesos.length === 0 && (
          <p className="p-6 text-body-md text-on-surface-variant">
            Todavía no hay procesos electorales creados.
          </p>
        )}

        {!cargando && procesos.length > 0 && (
          <ul>
            {procesos.map((proceso) => (
              <li
                key={proceso.id}
                className="flex items-center justify-between border-b border-border-gray px-6 py-4 last:border-b-0"
              >
                <div>
                  <p className="text-body-md text-on-surface">{proceso.nombre}</p>
                  <p className="text-caption text-on-surface-variant">
                    {proceso.tipo} · {proceso.estado}
                  </p>
                </div>
                <div className="flex gap-2">
                  {proceso.estado === 'borrador' && (
                    <button
                      type="button"
                      className="rounded-control bg-primary px-4 py-3 text-label-md text-on-primary transition-colors hover:bg-primary/10 hover:text-primary"
                      onClick={() => navegar({ nombre: 'apertura', procesoId: proceso.id })}
                    >
                      Abrir proceso
                    </button>
                  )}
                  <button
                    type="button"
                    className="rounded-control px-4 py-3 text-label-md text-primary hover:bg-surface-container"
                    onClick={() => navegar({ nombre: 'candidatos', procesoId: proceso.id })}
                  >
                    Gestionar candidatos
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
