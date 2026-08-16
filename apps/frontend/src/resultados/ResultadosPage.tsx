import { useResultadosEnVivo } from './useResultadosEnVivo';
import { PanelParticipacion } from './piezas/PanelParticipacion';
import { AvisoResultadosOcultos } from './piezas/AvisoResultadosOcultos';
import { DesgloseSimple } from './piezas/DesgloseSimple';

interface ResultadosPageProps {
  procesoId: string;
}

/**
 * resultados-en-vivo (#16, PR3; design.md D11, tasks.md 13.1-13.6). Contenedor: único efecto de
 * este batch es el sondeo de `useResultadosEnVivo` (React Query, D10) — sin `useEffect` manual,
 * a diferencia de `ComprobantePage.tsx` (#15), porque acá el estado de servidor ya lo maneja el
 * hook. Participación (`PanelParticipacion`) se monta siempre; el desglose se delega a
 * `DesgloseSimple` en modo visible (reemplazado por `GraficoDesglose` en PR4, tasks.md 17.7) y a
 * `AvisoResultadosOcultos` en modo oculto, nunca ambos a la vez.
 */
export function ResultadosPage({ procesoId }: ResultadosPageProps) {
  const { data, isLoading, isError } = useResultadosEnVivo(procesoId);

  if (isLoading) {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface-variant md:px-12">
        Cargando…
      </p>
    );
  }

  if (isError || !data) {
    return (
      <p role="alert" className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No pudimos cargar los resultados.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-page space-y-6 px-5 md:px-12">
      <PanelParticipacion
        votosEmitidos={data.votos_emitidos}
        padronTotal={data.padron_total}
        horaServidor={data.hora_servidor}
      />

      {data.estado_visibilidad === 'oculto' ? (
        <AvisoResultadosOcultos />
      ) : (
        <DesgloseSimple desglose={data.desglose ?? []} blancos={data.blancos ?? 0} />
      )}
    </div>
  );
}
