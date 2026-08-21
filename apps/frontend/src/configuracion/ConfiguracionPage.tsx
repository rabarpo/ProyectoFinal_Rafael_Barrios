import { useEffect, useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { listarComite, obtenerConfiguracion } from './configuracion-api';
import type { ConfiguracionRespuestaDto, UsuarioRespuestaDto } from './configuracion-api';
import { PanelDatosInstitucionales } from './paneles/PanelDatosInstitucionales';
import { PanelLogo } from './paneles/PanelLogo';
import { PanelComite } from './paneles/PanelComite';

/**
 * frontend-configuracion-general, PR1/PR3b (#28; design.md D6/D10, tasks.md 4.1-4.3, 12.1-12.5) —
 * gate binario allowlist fail-closed, mismo criterio que `UsuariosPage` (#27 D4): `puedeGestionar =
 * rol === 'administrador' || rol === 'director'`. A diferencia de `#27` (dos gates independientes),
 * acá hay uno solo porque las tres secciones de esta página (datos institucionales, logo, comité)
 * comparten exactamente el mismo conjunto de roles — `ConfiguracionController` es
 * `@Roles('administrador','director')` a nivel de clase, así que `comite` no alcanza ninguna de
 * sus cuatro rutas. Si el gate falla, CERO llamadas a la API.
 *
 * D6: `FormularioGenerico` inicializa su estado UNA sola vez (`useState(() => …)`), así que
 * `PanelDatosInstitucionales` no se monta hasta que `obtenerConfiguracion()` resuelve (`cargando`
 * ⇒ `<p role="status">`). Tras un `PUT` exitoso (`onGuardado`) se incrementa `version` y se pasa
 * `key={version}` al panel para forzar un remount con los valores devueltos por el backend; tras
 * un `PUT` fallido `version` no cambia y el panel conserva lo que el usuario tipeó (el panel
 * mismo no fuerza ningún remount en el camino de error). `listarComite()` corre EN PARALELO a
 * `obtenerConfiguracion()` (D9, tasks.md Fase 16), no encadenado: `PanelLogo`/`PanelComite` no
 * dependen del `GET` singleton ni entre sí — un `listarComite()` fallido no bloquea el resto de la
 * página, sólo la propia sección de comité degrada (su estado vacío/lista ya maneja el caso).
 */
export function ConfiguracionPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const puedeGestionar = rol === 'administrador' || rol === 'director';

  const [cargando, setCargando] = useState(true);
  const [config, setConfig] = useState<ConfiguracionRespuestaDto | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const [integrantesComite, setIntegrantesComite] = useState<UsuarioRespuestaDto[]>([]);

  useEffect(() => {
    if (!puedeGestionar) return;
    let activo = true;
    (async () => {
      const resultado = await obtenerConfiguracion();
      if (!activo) return;
      if (resultado.ok && resultado.data) setConfig(resultado.data);
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, [puedeGestionar]);

  useEffect(() => {
    if (!puedeGestionar) return;
    let activo = true;
    (async () => {
      const resultado = await listarComite();
      if (!activo) return;
      if (resultado.ok && resultado.data) setIntegrantesComite(resultado.data);
    })();
    return () => {
      activo = false;
    };
  }, [puedeGestionar]);

  if (!puedeGestionar) {
    return (
      <p
        role="status"
        className="mx-auto w-full max-w-page px-5 py-6 text-body-md text-on-surface-variant md:px-12"
      >
        Esta sección no está disponible para tu rol.
      </p>
    );
  }

  return (
    <div data-testid="configuracion-page-shell" className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">Configuración</h1>
      {cargando || !config ? (
        <p role="status" className="py-6 text-body-md text-on-surface-variant">
          Cargando configuración…
        </p>
      ) : (
        <div className="flex flex-col gap-6 py-6">
          <section className="rounded-card border-t-4 border-primary bg-surface-white p-6 shadow-elevation">
            <h2 className="mb-4 text-title-md text-on-surface">Datos institucionales</h2>
            <PanelDatosInstitucionales
              key={version}
              config={config}
              onGuardado={(data) => {
                setConfig(data);
                setVersion((v) => v + 1);
              }}
            />
          </section>
          <section className="rounded-card border-t-4 border-secondary bg-surface-white p-6 shadow-elevation">
            <PanelLogo logoPresente={config.logo_presente} logoMime={config.logo_mime} />
          </section>
          {/* --color-tertiary es negro puro en la paleta (rol de contraste de texto, no de acento
              visual) — se usa la familia tertiary-fixed (verde azulado) para un acento realmente
              visible, misma lógica que primary-fixed en TablaGenerica/AcademicaPage. */}
          <section className="rounded-card border-t-4 border-tertiary-fixed bg-surface-white p-6 shadow-elevation">
            <PanelComite integrantes={integrantesComite} />
          </section>
        </div>
      )}
    </div>
  );
}
