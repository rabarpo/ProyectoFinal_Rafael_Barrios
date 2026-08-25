import { useEffect, useState } from 'react';
import { comprobante } from './votos-api';
import type { ComprobanteDto } from './votos-api';
import { PanelComprobante } from './piezas/PanelComprobante';
import { navegar } from '../app/useRuta';
import { useSesion } from '../auth/sesion-context';

interface ComprobantePageProps {
  votoId: string;
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'exito'; comprobante: ComprobanteDto }
  | { fase: 'prohibido' }
  | { fase: 'no-disponible' };

/**
 * comprobante-autenticado, PR4 (design.md D12, tasks.md 14.1-14.3). Contenedor con el único
 * efecto de este batch: `GET /votos/comprobante/:votoId` (`votos-api.comprobante()`) al montar.
 * Reutiliza `PanelComprobante` (#14/PR6) para el caso de éxito — la misma pieza presentacional
 * que muestra el comprobante justo después de votar ahora se relee tras autenticarse, vía el
 * enlace del correo de #15 o una URL directa equivalente (spec comprobante-autenticado: "Acceso
 * vía enlace del correo"/"Acceso vía URL directa equivalente"). `403` (voto ajeno o `votoId`
 * inexistente, idéntico por diseño — D11) no distingue entre ambos casos: cierra el oráculo de
 * enumeración también en el cliente, sin cuerpo discriminante que enrutar. Sin sesión, el montaje
 * de esta página no ocurre — `AuthGuard`/`Enrutador` (#12 D11) resuelven eso por fuera, así que
 * `401` no es un estado propio de este contenedor.
 *
 * rediseno-boleta-votacion, PR4 (design.md D6, tasks.md 20.3): siempre pasa `yaRegistrado` —
 * esta relectura autenticada solo ocurre para un voto ya emitido, nunca para uno recién creado.
 *
 * fidelidad-visual-boleta-votacion, PR5 (design.md D7, tasks.md 27.2): mismo wiring que
 * `VotacionPage` para las acciones de `PanelComprobante` — `onVolverAlInicio`/`onCerrarSesion` de
 * `useSesion()` — sin romper el badge `yaRegistrado`.
 */
export function ComprobantePage({ votoId }: ComprobantePageProps) {
  const { logout } = useSesion();
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });

  useEffect(() => {
    let activo = true;
    comprobante(votoId)
      .then(({ data, response }) => {
        if (!activo) return;
        if (response.status === 200 && data) {
          setEstado({ fase: 'exito', comprobante: data });
        } else if (response.status === 403) {
          setEstado({ fase: 'prohibido' });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [votoId]);

  if (estado.fase === 'cargando') {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface-variant md:px-12">
        Cargando…
      </p>
    );
  }

  if (estado.fase === 'prohibido') {
    return (
      <p role="alert" className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No podés ver este comprobante.
      </p>
    );
  }

  if (estado.fase === 'no-disponible') {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No pudimos cargar tu comprobante.
      </p>
    );
  }

  return (
    <PanelComprobante
      comprobante={estado.comprobante}
      yaRegistrado
      onVolverAlInicio={() => navegar({ nombre: 'inicio' })}
      onCerrarSesion={logout}
    />
  );
}
