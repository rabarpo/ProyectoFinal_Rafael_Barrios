import { useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { CampoArchivo } from '../candidatos/piezas/CampoArchivo';
import { descargarCsvErrores, importarPadron } from './importacion-api';
import type { ResultadoImportacionDto } from './importacion-api';
import { validarArchivoPadron } from './validar-archivo-padron';
import { mensajeDeError } from './mensajes-error';
import { ResumenImportacion } from './piezas/ResumenImportacion';
import { TablaErroresImportacion } from './piezas/TablaErroresImportacion';

/**
 * frontend-importacion-excel, PR1 + PR3 (#29; design.md D5/D6/D8/D9, tasks.md 1.6, 3.5-3.6).
 *
 * Contenedor único (D8): el único componente con estado, efectos y llamadas API. Gate binario
 * allowlist fail-closed (D9): `puedeImportar = rol === 'administrador' || rol === 'director'` —
 * `ImportacionController` es `@Roles('administrador','director')` a nivel de clase, así que ninguna
 * otra sesión alcanza sus rutas. Si el gate falla: aviso `role="status"`, cero piezas, cero fetch.
 *
 * PR3 cablea la máquina de estados D5 (unión discriminada, sin booleanos sueltos) y la doble
 * barrera D3/D6:
 *  - `validarArchivoPadron` corre ANTES de cualquier request (feedback inmediato para `.xlsm`/>5 MB);
 *    el backend (`filtroArchivoPadron`, `limits.fileSize`) sigue siendo la autoridad.
 *  - `importarPadron` traduce el `Response` a `ResultadoApi`; un `4xx` se muestra vía `mensajeDeError`
 *    sin desmontar la pantalla.
 * El `File` seleccionado vive en un `useState` APARTE y sobrevive a `fase='resultado'`: el usuario
 * puede elegir un archivo corregido y reenviar sin recargar (spec "Reintento con archivo corregido").
 * La tabla de errores y la descarga del CSV llegan en PR4.
 */
type EstadoImportacion =
  | { fase: 'inactivo' }
  | { fase: 'enviando' }
  | { fase: 'resultado'; datos: ResultadoImportacionDto }
  | { fase: 'error'; mensaje: string };

export function ImportacionExcelPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const puedeImportar = rol === 'administrador' || rol === 'director';

  const [archivo, setArchivo] = useState<File | null>(null);
  const [estado, setEstado] = useState<EstadoImportacion>({ fase: 'inactivo' });
  // El error de descarga vive APARTE (D4/D5): un `404` por reporte vencido NO pisa `fase='resultado'`,
  // así el resumen y la tabla siguen montados (spec "Reporte de errores expirado").
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  async function manejarImportar() {
    if (!archivo) {
      setEstado({ fase: 'error', mensaje: mensajeDeError({ codigo: 'ARCHIVO_REQUERIDO' }) });
      return;
    }

    const errorCliente = validarArchivoPadron(archivo);
    if (errorCliente) {
      setEstado({ fase: 'error', mensaje: errorCliente });
      return;
    }

    setErrorDescarga(null);
    setEstado({ fase: 'enviando' });
    const resultado = await importarPadron(archivo);

    if (resultado.ok && resultado.data) {
      setEstado({ fase: 'resultado', datos: resultado.data });
      return;
    }

    setEstado({
      fase: 'error',
      mensaje: mensajeDeError({ codigo: resultado.codigo, status: resultado.status }),
    });
  }

  async function manejarDescargar() {
    if (estado.fase !== 'resultado') return;
    setErrorDescarga(null);
    const resultado = await descargarCsvErrores(estado.datos.importacion_id);
    if (!resultado.ok) {
      setErrorDescarga(
        mensajeDeError({ codigo: resultado.codigo, status: resultado.status }),
      );
    }
  }

  if (!puedeImportar) {
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
    <div
      data-testid="importacion-excel-contenido"
      className="mx-auto flex w-full max-w-page flex-col gap-6 px-5 py-6 md:px-12"
    >
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
        Importación de padrón
      </h1>
      <p className="text-body-md text-on-surface-variant">
        Selecciona un archivo <code>.xlsx</code> o <code>.csv</code> (máximo 5 MB) con el padrón de
        usuarios y matrículas.
      </p>

      <CampoArchivo etiqueta="Archivo del padrón" aceptar=".xlsx,.csv" onCambiar={setArchivo} />

      <button
        type="button"
        onClick={manejarImportar}
        disabled={estado.fase === 'enviando'}
        className="w-fit rounded-control bg-primary px-4 py-2 text-label-md text-on-primary disabled:opacity-50"
      >
        Importar padrón
      </button>

      {estado.fase === 'enviando' && (
        <p role="status" className="text-body-md text-on-surface-variant">
          Importando el padrón…
        </p>
      )}

      {estado.fase === 'error' && (
        <p role="alert" className="text-body-sm text-error">
          {estado.mensaje}
        </p>
      )}

      {estado.fase === 'resultado' && (
        <>
          <ResumenImportacion resultado={estado.datos} />
          {estado.datos.filas_invalidas > 0 && (
            <>
              <button
                type="button"
                onClick={manejarDescargar}
                className="w-fit rounded-control border border-primary px-4 py-2 text-label-md text-primary"
              >
                Descargar CSV de errores
              </button>
              {errorDescarga && (
                <p role="alert" className="text-body-sm text-error">
                  {errorDescarga}
                </p>
              )}
              <TablaErroresImportacion errores={estado.datos.errores} />
            </>
          )}
        </>
      )}
    </div>
  );
}
