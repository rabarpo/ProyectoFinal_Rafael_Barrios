/**
 * resultados-en-vivo (#16, PR3; design.md, "Vista frontend de resultados en vivo"; tasks.md
 * 15.1-15.2). Presentacional puro, sin props: se monta cuando `estado_visibilidad === 'oculto'`
 * y nunca junto a ningún componente de gráfico (spec: "MUST mostrar un mensaje de 'resultados
 * ocultos'... sin intentar renderizar un desglose inexistente").
 */
export function AvisoResultadosOcultos() {
  return (
    <div
      role="status"
      className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation"
    >
      <p className="text-body-md text-on-surface">
        Los resultados permanecen ocultos hasta el cierre del proceso.
      </p>
    </div>
  );
}
