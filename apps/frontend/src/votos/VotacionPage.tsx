import { useEffect, useState } from 'react';
import { emitir, papeleta } from './votos-api';
import type { ComprobanteDto, EmitirVotoDto, PapeletaDto } from './votos-api';
import { useClaveIdempotencia } from './clave-idempotencia';
import { navegar } from '../app/useRuta';
import { useSesion } from '../auth/sesion-context';
import { PasoInformacionProceso } from './piezas/PasoInformacionProceso';
import { PasoBoleta } from './piezas/PasoBoleta';
import type { Seleccion } from './piezas/PasoBoleta';
import { PasoConfirmacion } from './piezas/PasoConfirmacion';
import { PantallaRechazo } from './piezas/PantallaRechazo';
import { PanelComprobante } from './piezas/PanelComprobante';

/**
 * vote-casting, PR6 (design.md D9, "Taxonomía de rechazos", tasks.md 22.1). El cuerpo de error de
 * `POST /votos` es `{ codigo, ...detalle }` (`RechazoVoto.aHttp()`, `votos.service.ts`) — mismo
 * criterio de extracción defensiva que `candidatos-api.ts.extraerCodigo`.
 */
function extraerCodigoRechazo(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'codigo' in error) {
    return (error as { codigo?: unknown }).codigo as string | undefined;
  }
  return undefined;
}

function extraerCierre(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'cierre' in error) {
    return (error as { cierre?: unknown }).cierre as string | undefined;
  }
  return undefined;
}

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
  | { fase: 'ya-votaste'; comprobante: ComprobanteDto }
  | { fase: 'sin-padron' }
  | { fase: 'cerrada'; horaCierre: string }
  | { fase: 'sin-conexion'; datos: PapeletaDto; seleccion: Seleccion }
  | { fase: 'error'; datos: PapeletaDto; seleccion: Seleccion; mensaje: string }
  | { fase: 'no-disponible' };

/**
 * Contenedor con TODOS los efectos de este batch (design.md D14, tasks.md 18.1): `GET
 * /votos/papeleta/:id` (`votos-api.papeleta()`) al montar, `votos-api.emitir()` al confirmar el
 * paso 3. El paso NO es parte de la URL — es estado del contenedor, espejo literal de
 * `procesos/AperturaProcesoPage` (#13): el paso 2 no es enlazable ni recargable sin contexto
 * (threat matrix "Enrutamiento (cliente)").
 *
 * PR6 (design.md D9/D6, "Taxonomía de rechazos", tasks.md 22.1) enruta cada resultado de `POST
 * /votos` por su STATUS exacto, nunca por inferencia del cuerpo:
 * - `201` (esta petición creó la fila) -> `PanelComprobante` ("voto registrado ahora").
 * - `200` (reintento con misma clave, colisión `23505` con clave distinta, o derecho ya ejercido —
 *   D6: las tres NUNCA son un error HTTP) -> `PantallaRechazo variante="ya-votaste"` con el
 *   comprobante ya emitido: es la lectura correcta incluso para el reintento idempotente, que
 *   también "ya emitió" el voto.
 * - `403` (causa 1, D9: derecho ajeno o inexistente) -> sin pantalla propia, redirección inmediata
 *   ("/") — el mismo criterio que la Taxonomía de rechazos exige para cerrar el oráculo de
 *   enumeración también en el cliente.
 * - `codigo: 'SIN_DERECHO'` (causa 2, incluida la causa 5 "aula que no corresponde" plegada por D8)
 *   -> `PantallaRechazo variante="sin-padron"`.
 * - `codigo: 'VOTACION_CERRADA'` (causa 3) -> `PantallaRechazo variante="cerrada"` con la hora
 *   exacta de cierre que envió el servidor (`detalle.cierre`).
 * - Fallo de red/lo respuesta perdida (18.4, estado del CLIENTE) -> `PantallaRechazo
 *   variante="sin-conexion"`, con reintento que reusa la MISMA clave de idempotencia.
 *
 * fidelidad-visual-boleta-votacion, PR5 (design.md D7, tasks.md 27.1): cablea las acciones de
 * `PanelComprobante` — `onVolverAlInicio={() => navegar({ nombre: 'inicio' })}` y
 * `onCerrarSesion={logout}` de `useSesion()` — sin que `PanelComprobante` deje de ser
 * presentacional puro.
 */
export function VotacionPage({ derechoVotoId }: VotacionPageProps) {
  const { logout } = useSesion();
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
      const { data, error, response } = await emitir(dto);

      if (response.status === 201 && data) {
        setEstado({ fase: 'exito', comprobante: data });
        return;
      }

      if (response.status === 200 && data) {
        // D6: reintento con misma clave, colisión 23505 con clave distinta, o derecho ya
        // ejercido — ninguna de las tres es un error HTTP; las tres devuelven el comprobante ya
        // emitido.
        setEstado({ fase: 'ya-votaste', comprobante: data });
        return;
      }

      if (response.status === 403) {
        // Causa 1 (D9): derecho ajeno o inexistente — sin pantalla propia, sin cuerpo
        // discriminante que enrutar (cierra el oráculo de enumeración también en el cliente).
        navegar({ nombre: 'proceso-nuevo' });
        return;
      }

      const codigo = extraerCodigoRechazo(error);
      if (codigo === 'SIN_DERECHO') {
        setEstado({ fase: 'sin-padron' });
        return;
      }
      if (codigo === 'VOTACION_CERRADA') {
        setEstado({ fase: 'cerrada', horaCierre: extraerCierre(error) ?? datos.proceso.fecha_cierre_prevista });
        return;
      }

      setEstado({ fase: 'error', datos, seleccion, mensaje: 'No se pudo registrar el voto' });
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
      <PanelComprobante
        comprobante={estado.comprobante}
        onVolverAlInicio={() => navegar({ nombre: 'inicio' })}
        onCerrarSesion={logout}
      />
    );
  }

  if (estado.fase === 'ya-votaste') {
    return <PantallaRechazo variante="ya-votaste" comprobante={estado.comprobante} />;
  }

  if (estado.fase === 'sin-padron') {
    return <PantallaRechazo variante="sin-padron" />;
  }

  if (estado.fase === 'cerrada') {
    return <PantallaRechazo variante="cerrada" horaCierre={estado.horaCierre} />;
  }

  if (estado.fase === 'sin-conexion') {
    return (
      <PantallaRechazo variante="sin-conexion" onReintentar={() => confirmar(estado.datos, estado.seleccion)} />
    );
  }

  if (estado.fase === 'error') {
    return (
      <div className="mx-auto w-full max-w-page px-5 md:px-12">
        <p role="alert" className="text-body-md text-error">
          {estado.mensaje}
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

  if (paso === 2 || paso === 3) {
    const opcionElegida =
      seleccion?.tipo === 'opcion' ? datos.opciones.find((o) => o.id === seleccion.id) : undefined;
    const resumenSeleccion = seleccion?.tipo === 'blanco' ? 'Voto en blanco' : (opcionElegida?.etiqueta ?? '');

    return (
      <>
        <PasoBoleta
          opciones={datos.opciones}
          tipo={datos.proceso.tipo}
          derechoVotoId={derechoVotoId}
          seleccion={seleccion}
          onSeleccionar={seleccionar}
          onContinuar={() => irAPaso(3)}
          onVolver={() => irAPaso(1)}
        />
        {paso === 3 && (
          <PasoConfirmacion
            resumenSeleccion={resumenSeleccion}
            enviando={estado.fase === 'enviando'}
            onConfirmar={() => seleccion && confirmar(datos, seleccion)}
            onVolver={() => irAPaso(2)}
          />
        )}
      </>
    );
  }

  return null;
}
