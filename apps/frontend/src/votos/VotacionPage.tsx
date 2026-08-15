import { useEffect, useState } from 'react';
import { emitir, papeleta } from './votos-api';
import type { ComprobanteDto, EmitirVotoDto, PapeletaDto } from './votos-api';
import { useClaveIdempotencia } from './clave-idempotencia';
import { PasoInformacionProceso } from './piezas/PasoInformacionProceso';
import { PasoBoleta } from './piezas/PasoBoleta';
import type { Seleccion } from './piezas/PasoBoleta';
import { PasoConfirmacion } from './piezas/PasoConfirmacion';

interface VotacionPageProps {
  derechoVotoId: string;
}

// D13/D9: `municipio` vota por `Lista`, `consulta` por `OpcionConsulta`, y el resto
// (`representante_aula`/`padres`) por `Candidato` sin lista asociada — mismo mapeo que
// `papeleta.service.ts.obtenerOpciones()`. Determina bajo qué campo de `EmitirVotoDto` viaja el
// id elegido (deviation de PR5: `PapeletaProcesoDto.tipo` se agregó a PR1 para que el cliente
// pueda decidir esto sin adivinar — ver apply-progress).
function campoEleccion(tipo: PapeletaDto['proceso']['tipo']): 'lista_id' | 'opcion_id' | 'candidato_id' {
  if (tipo === 'municipio') return 'lista_id';
  if (tipo === 'consulta') return 'opcion_id';
  return 'candidato_id';
}

type Estado =
  | { fase: 'cargando' }
  | { fase: 'papeleta'; datos: PapeletaDto; paso: 1 | 2 | 3; seleccion: Seleccion | undefined }
  | { fase: 'enviando'; datos: PapeletaDto; seleccion: Seleccion }
  | { fase: 'exito'; comprobante: ComprobanteDto }
  | { fase: 'sin-conexion'; datos: PapeletaDto; seleccion: Seleccion }
  | { fase: 'error'; datos: PapeletaDto; seleccion: Seleccion; mensaje: string }
  | { fase: 'no-disponible' };

/**
 * Contenedor con TODOS los efectos de este batch (design.md D14, tasks.md 18.1): `GET
 * /votos/papeleta/:id` (`votos-api.papeleta()`) al montar, `votos-api.emitir()` al confirmar el
 * paso 3. El paso NO es parte de la URL — es estado del contenedor, espejo literal de
 * `procesos/AperturaProcesoPage` (#13): el paso 2 no es enlazable ni recargable sin contexto
 * (threat matrix "Enrutamiento (cliente)"). PR6 reemplaza la rama `exito`/`sin-conexion`/`error`
 * por `PanelComprobante`/`PantallaRechazo` (tasks.md 22.1) y agrega `BandaVotandoComo` — este PR
 * sólo deja el wiring mínimo funcional.
 */
export function VotacionPage({ derechoVotoId }: VotacionPageProps) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cargando' });
  const procesoId = estado.fase !== 'cargando' && estado.fase !== 'no-disponible' && 'datos' in estado
    ? estado.datos.proceso.id
    : estado.fase === 'exito'
      ? estado.comprobante.proceso.id
      : '';
  const claveIdempotencia = useClaveIdempotencia(procesoId, derechoVotoId);

  useEffect(() => {
    let activo = true;
    papeleta(derechoVotoId)
      .then(({ data, response }) => {
        if (!activo) return;
        if (response.ok && data) {
          setEstado({ fase: 'papeleta', datos: data, paso: 1, seleccion: undefined });
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
  }, [derechoVotoId]);

  function irAPaso(paso: 1 | 2 | 3) {
    setEstado((anterior) => {
      if (anterior.fase !== 'papeleta') return anterior;
      return { ...anterior, paso };
    });
  }

  function seleccionar(seleccion: Seleccion) {
    setEstado((anterior) => {
      if (anterior.fase !== 'papeleta') return anterior;
      return { ...anterior, seleccion };
    });
  }

  async function confirmar(datos: PapeletaDto, seleccion: Seleccion) {
    setEstado({ fase: 'enviando', datos, seleccion });

    const dto: EmitirVotoDto = {
      derecho_voto_id: derechoVotoId,
      clave_idempotencia: claveIdempotencia,
      ...(seleccion.tipo === 'blanco'
        ? { blanco: true }
        : { [campoEleccion(datos.proceso.tipo)]: seleccion.id }),
    };

    try {
      const { data, response } = await emitir(dto);
      if (response.ok && data) {
        setEstado({ fase: 'exito', comprobante: data });
      } else {
        setEstado({ fase: 'error', datos, seleccion, mensaje: 'No se pudo registrar el voto' });
      }
    } catch {
      // 18.4: la petición nunca llegó o se perdió la respuesta — estado del CLIENTE, no del
      // servidor. Nunca se genera un evento RECHAZO acá (eso lo decide únicamente el servidor).
      setEstado({ fase: 'sin-conexion', datos, seleccion });
    }
  }

  if (estado.fase === 'cargando') {
    return <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface-variant md:px-12">Cargando…</p>;
  }

  if (estado.fase === 'no-disponible') {
    return (
      <p className="mx-auto w-full max-w-page px-5 text-body-md text-on-surface md:px-12">
        No pudimos cargar tu papeleta.
      </p>
    );
  }

  if (estado.fase === 'exito') {
    return (
      <div className="mx-auto w-full max-w-page px-5 md:px-12">
        <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">Voto registrado</h1>
        <p className="mt-2 text-body-md text-on-surface">Comprobante: {estado.comprobante.codigo_comprobante}</p>
      </div>
    );
  }

  if (estado.fase === 'sin-conexion' || estado.fase === 'error') {
    return (
      <div className="mx-auto w-full max-w-page px-5 md:px-12">
        <p role="alert" className="text-body-md text-error">
          {estado.fase === 'sin-conexion'
            ? 'Sin conexión al confirmar. Verificá tu conexión e intentá de nuevo.'
            : estado.mensaje}
        </p>
        <button
          type="button"
          onClick={() => confirmar(estado.datos, estado.seleccion)}
          className="mt-4 rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container focus-visible:outline-2 focus-visible:outline-primary"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const { datos, paso, seleccion } = estado.fase === 'papeleta' ? estado : { datos: estado.datos, paso: 3 as const, seleccion: estado.seleccion };

  if (paso === 1) {
    return (
      <PasoInformacionProceso proceso={datos.proceso} yaVoto={datos.ya_voto} onContinuar={() => irAPaso(2)} />
    );
  }

  if (paso === 2) {
    return (
      <PasoBoleta
        opciones={datos.opciones}
        seleccion={seleccion}
        onSeleccionar={seleccionar}
        onContinuar={() => irAPaso(3)}
      />
    );
  }

  const opcionElegida = seleccion?.tipo === 'opcion' ? datos.opciones.find((o) => o.id === seleccion.id) : undefined;
  const resumenSeleccion = seleccion?.tipo === 'blanco' ? 'Voto en blanco' : (opcionElegida?.etiqueta ?? '');

  return (
    <PasoConfirmacion
      resumenSeleccion={resumenSeleccion}
      enviando={estado.fase === 'enviando'}
      onConfirmar={() => seleccion && confirmar(datos, seleccion)}
      onVolver={() => irAPaso(2)}
    />
  );
}
