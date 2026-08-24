import { useEffect, useState } from 'react';
import { misDerechos } from './votos-api';
import type { MiDerechoVotoDto } from './votos-api';
import { navegar } from '../app/useRuta';

type Estado =
  | { fase: 'cargando' }
  | { fase: 'exito'; derechos: MiDerechoVotoDto[] }
  | { fase: 'no-disponible' };

/**
 * descubrimiento-derechos-voto, PR2 (#30; design.md D7, tasks.md 5.5). Contenedor con el único
 * efecto de este batch: `GET /votos/mis-derechos` (`votos-api.misDerechos()`) al montar, mismo
 * estilo que `ComprobantePage` (#15/PR4) — carga única, sin polling (spec: "Aterrizaje frontend
 * con navegación bloqueada en derechos usados"). Sin sesión, esta pantalla nunca monta —
 * `AuthGuard`/`Enrutador` (#12 D11) resuelven eso por fuera, así que `401` no es un estado propio
 * de este contenedor. Entrada con `ya_voto:true` se muestra bloqueada sin `onClick`; entrada con
 * `ya_voto:false` navega a la ruta `votacion` existente (`/votar/:derechoVotoId`,
 * `VotacionPage.tsx`) sin modificarla.
 */
export function MisVotacionesPage() {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });

  useEffect(() => {
    let activo = true;
    misDerechos()
      .then(({ data, response }) => {
        if (!activo) return;
        if (response.status === 200 && data) {
          setEstado({ fase: 'exito', derechos: data });
        } else {
          setEstado({ fase: 'no-disponible' });
        }
      })
      .catch(() => {
        if (activo) setEstado({ fase: 'no-disponible' });
      });
    return () => {
      activo = false;
    };
  }, []);

  if (estado.fase === 'cargando') {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface-variant md:px-12">
        Cargando…
      </p>
    );
  }

  if (estado.fase === 'no-disponible') {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No pudimos cargar tus votaciones.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">Mis votaciones</h1>

      {estado.derechos.length === 0 && (
        <p className="mt-4 text-body-md text-on-surface-variant">
          No tenés votaciones activas en este momento.
        </p>
      )}

      {estado.derechos.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {estado.derechos.map((derecho) =>
            derecho.ya_voto ? (
              <div
                key={derecho.derecho_voto_id}
                className="rounded-card border border-dashed border-border-gray bg-surface-container-low p-6 text-left"
              >
                <p className="text-label-md text-on-surface-variant">{derecho.proceso.nombre}</p>
                <p className="mt-1 text-caption text-on-surface-variant">Ya votaste</p>
              </div>
            ) : (
              <button
                key={derecho.derecho_voto_id}
                type="button"
                onClick={() => navegar({ nombre: 'votacion', derechoVotoId: derecho.derecho_voto_id })}
                className="rounded-card border-t-4 border-primary bg-surface-white p-6 text-left shadow-elevation transition-colors hover:bg-primary/5"
              >
                <p className="text-label-md text-primary">{derecho.proceso.nombre}</p>
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
