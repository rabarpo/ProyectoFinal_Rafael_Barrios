import { useEffect, useState } from 'react';
import {
  actualizarCandidato,
  crearCandidato,
  listarListas,
  obtenerCandidato,
} from './candidatos-api';
import type { ListaRespuestaDto } from './candidatos-api';
import { navegar } from '../app/useRuta';
import { FormularioCandidato } from './piezas/FormularioCandidato';
import type { DatosCandidatoFormulario } from './piezas/FormularioCandidato';

interface RegistroCandidatoPageProps {
  procesoId: string;
  candidatoId?: string;
}

/**
 * Contenedor con TODOS los efectos de este batch (design.md D13, tasks.md
 * 21.1): orquesta `candidatos-api` y `navegar()`, mismo patrón que
 * `ProcesoWizardPage`. `Enrutador` decide `modo` pasando o no `candidatoId`
 * (evita re-parsear `useRuta()` acá — las props ya traen el resultado del
 * `switch`).
 */
export function RegistroCandidatoPage({ procesoId, candidatoId }: RegistroCandidatoPageProps) {
  const modo = candidatoId ? 'edicion' : 'creacion';
  const [listas, setListas] = useState<ListaRespuestaDto[]>([]);
  const [valoresIniciales, setValoresIniciales] = useState<
    Partial<DatosCandidatoFormulario> | undefined
  >(undefined);
  const [enviando, setEnviando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);

  useEffect(() => {
    let activo = true;
    listarListas(procesoId).then(({ data }) => {
      if (activo) setListas(data ?? []);
    });
    return () => {
      activo = false;
    };
  }, [procesoId]);

  useEffect(() => {
    if (!candidatoId) return;
    let activo = true;
    obtenerCandidato(candidatoId).then(({ data }) => {
      if (!activo || !data) return;
      setValoresIniciales({
        nombres: data.nombres,
        grado: data.grado ?? '',
        aula: data.aula ?? '',
        cargo: data.cargo ?? '',
        lista_id: data.lista_id ?? '',
      });
    });
    return () => {
      activo = false;
    };
  }, [candidatoId]);

  async function enviar(datos: DatosCandidatoFormulario) {
    setEnviando(true);
    setMensajeError(undefined);

    const resultado =
      modo === 'creacion'
        ? await crearCandidato({
            proceso_id: procesoId,
            nombres: datos.nombres,
            grado: datos.grado || undefined,
            aula: datos.aula || undefined,
            cargo: datos.cargo || undefined,
            lista_id: datos.lista_id || undefined,
            foto: datos.foto as File,
          })
        : await actualizarCandidato(candidatoId as string, {
            nombres: datos.nombres,
            grado: datos.grado || undefined,
            aula: datos.aula || undefined,
            cargo: datos.cargo || undefined,
            lista_id: datos.lista_id || undefined,
            foto: datos.foto ?? undefined,
          });

    setEnviando(false);

    if (resultado.ok) {
      navegar({ nombre: 'candidatos', procesoId });
    } else {
      setMensajeError('No se pudo guardar el candidato');
    }
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <div className="mb-6">
        <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
          {modo === 'creacion' ? 'Registro de candidato' : 'Editar candidato'}
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          {modo === 'creacion'
            ? 'Completá los datos y adjuntá una foto para registrar al postulante.'
            : 'Actualizá los datos del candidato.'}
        </p>
      </div>

      <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation md:p-8">
        <FormularioCandidato
          modo={modo}
          valoresIniciales={valoresIniciales}
          listas={listas}
          onEnviar={enviar}
          enviando={enviando}
          mensajeError={mensajeError}
        />
      </div>
    </div>
  );
}
