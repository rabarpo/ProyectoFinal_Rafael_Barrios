import { useEffect, useState } from 'react';
import { abrir, detalle } from './procesos-api';
import { navegar } from '../app/useRuta';
import { PanelConfirmacionApertura } from './piezas/PanelConfirmacionApertura';
import type { ResumenProceso } from './piezas/PanelConfirmacionApertura';

interface AperturaProcesoPageProps {
  procesoId: string;
}

/**
 * Contenedor con TODOS los efectos de este batch (design.md D13/D14, tasks.md
 * 18.1): `GET /procesos/:id` (`procesos-api.detalle()`, ya existente) para el
 * resumen mostrado en `PanelConfirmacionApertura`, `procesos-api.abrir()` al
 * confirmar. D14: no se previsualiza el conteo del padrón acá — recalcularlo
 * antes de la apertura mostraría un número potencialmente desactualizado; los
 * conteos reales viajan en el `200` de `abrir()`. Tras el `200`, navega de
 * vuelta al índice (tasks.md 18.5): la apertura ya quedó registrada en el
 * servidor.
 */
export function AperturaProcesoPage({ procesoId }: AperturaProcesoPageProps) {
  const [resumen, setResumen] = useState<ResumenProceso | undefined>(undefined);
  const [cargandoDetalle, setCargandoDetalle] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let activo = true;
    detalle(procesoId)
      .then(({ data }) => {
        if (!activo || !data) return;
        setResumen({
          nombre: data.nombre,
          tipo: data.tipo,
          publico_objetivo: data.publico_objetivo,
          alcance: data.alcance,
          aulas: data.aulas.length,
          ocultar_resultados: data.ocultar_resultados,
        });
      })
      .finally(() => {
        if (activo) setCargandoDetalle(false);
      });
    return () => {
      activo = false;
    };
  }, [procesoId]);

  async function confirmar() {
    setEnviando(true);
    setMensajeError(undefined);

    try {
      const { data, response } = await abrir(procesoId);
      if (response.ok && data) {
        navegar({ nombre: 'procesos' });
      } else {
        setMensajeError('No se pudo abrir el proceso');
      }
    } catch {
      setMensajeError('No se pudo contactar con el servidor');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <div className="mb-6">
        <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">Abrir proceso</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Revisá los datos antes de confirmar: la apertura congela la segmentación y no se puede
          deshacer.
        </p>
      </div>

      {cargandoDetalle && <p className="text-body-md text-on-surface-variant">Cargando…</p>}

      {!cargandoDetalle && resumen && (
        <PanelConfirmacionApertura
          proceso={resumen}
          onConfirmar={confirmar}
          onCancelar={() => navegar({ nombre: 'procesos' })}
          cargando={enviando}
          mensajeError={mensajeError}
        />
      )}
    </div>
  );
}
