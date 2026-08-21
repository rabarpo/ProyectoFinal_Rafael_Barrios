import { useState } from 'react';
import { CampoArchivo } from '../../candidatos/piezas/CampoArchivo';
import { subirLogo, urlLogo } from '../configuracion-api';
import { validarArchivoLogo } from '../validar-logo';
import { mensajeDeError } from '../mensajes-error';

interface PanelLogoProps {
  logoPresente: boolean;
  logoMime?: string | null;
  deshabilitado?: boolean;
}

/**
 * frontend-configuracion-general, PR4 (#28; design.md D8, tasks.md Fase 14). Doble barrera: el
 * cliente valida (`validarArchivoLogo`) SÓLO para feedback inmediato — antes de disparar
 * `subirLogo`, no como reemplazo del backend (`filtroArchivoLogo`/`limits.fileSize`/chequeo de 0
 * bytes en `ConfiguracionService`, threat matrix "Clasificación de archivo activo"). `CampoArchivo`
 * queda sin modificar (D8: presentacional puro, compartido con `#12`). La vista previa se renderiza
 * SIEMPRE vía `<img src>` — nunca inyecta el SVG inline (`dangerouslySetInnerHTML` prohibido) — y
 * sólo cuando `logoPresente`, porque `GET /configuracion/logo` responde 404 sin logo persistido.
 * Ciego al rol (D10): no llama `useSesion()`, sólo recibe `deshabilitado` del contenedor.
 */
export function PanelLogo({ logoPresente, deshabilitado }: PanelLogoProps) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [mostrarLogo, setMostrarLogo] = useState(logoPresente);
  const [enviando, setEnviando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);

  async function manejarSubir() {
    setMensajeError(undefined);

    if (!archivo) {
      setMensajeError('Debes seleccionar un archivo para subir.');
      return;
    }

    const errorCliente = validarArchivoLogo(archivo);
    if (errorCliente) {
      setMensajeError(errorCliente);
      return;
    }

    setEnviando(true);
    const resultado = await subirLogo(archivo);
    setEnviando(false);

    if (!resultado.ok) {
      setMensajeError(
        mensajeDeError({ codigo: resultado.codigo, campo: resultado.campo, status: resultado.status }),
      );
      return;
    }

    setMostrarLogo(true);
    setVersion(resultado.data?.logo_actualizado_en);
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-title-md text-on-surface">Logo institucional</h2>
      {mostrarLogo && (
        <img
          src={urlLogo(version)}
          alt="Logo institucional actual"
          className="h-24 w-24 rounded-control border border-border-gray object-contain"
        />
      )}
      <CampoArchivo
        etiqueta="Logo"
        aceptar="image/png,image/jpeg,image/svg+xml"
        onCambiar={setArchivo}
      />
      <button
        type="button"
        onClick={manejarSubir}
        disabled={deshabilitado || enviando}
        className="w-fit rounded-control bg-primary px-4 py-2 text-label-md text-on-primary disabled:opacity-50"
      >
        Subir logo
      </button>
      {mensajeError && (
        <p role="alert" className="text-body-sm text-error">
          {mensajeError}
        </p>
      )}
    </div>
  );
}
