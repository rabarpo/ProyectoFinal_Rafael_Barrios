import { useState } from 'react';
import { FormularioGenerico } from '../../comun/piezas/FormularioGenerico';
import type { CampoFormulario } from '../../comun/piezas/FormularioGenerico';
import { CampoDominios } from '../piezas/CampoDominios';
import { actualizarConfiguracion } from '../configuracion-api';
import type { ActualizarConfiguracionInput, ConfiguracionRespuestaDto } from '../configuracion-api';
import { mensajeDeError } from '../mensajes-error';

interface PanelDatosInstitucionalesProps {
  config: ConfiguracionRespuestaDto;
  deshabilitado?: boolean;
  onGuardado: (data: ConfiguracionRespuestaDto) => void;
}

/**
 * Claves precargadas desde el `GET` (D5). `smtp_*` se manejan aparte porque nunca precargan y
 * `smtp_puerto` necesita coerción a `number` — no encajan en el mismo loop de diff genérico.
 */
const CLAVES_TEXTO_PRECARGADAS = [
  'nombre',
  'director',
  'color_primario',
  'color_secundario',
  'zona_horaria',
] as const;

const CAMPOS: CampoFormulario[] = [
  { tipo: 'texto', clave: 'nombre', etiqueta: 'Nombre de la institución' },
  { tipo: 'texto', clave: 'director', etiqueta: 'Director/a' },
  { tipo: 'texto', clave: 'color_primario', etiqueta: 'Color primario' },
  { tipo: 'texto', clave: 'color_secundario', etiqueta: 'Color secundario' },
  { tipo: 'texto', clave: 'zona_horaria', etiqueta: 'Zona horaria' },
  { tipo: 'texto', clave: 'smtp_host', etiqueta: 'Servidor SMTP' },
  { tipo: 'texto', clave: 'smtp_puerto', etiqueta: 'Puerto SMTP' },
  { tipo: 'texto', clave: 'smtp_remitente', etiqueta: 'Remitente SMTP' },
];

/**
 * Comparación por valor, no por referencia (design.md D5: "reference inequality alone must not
 * trigger a spurious diff") — necesaria porque `CampoDominios` siempre entrega un arreglo nuevo
 * vía `onCambiar`, incluso cuando el contenido termina siendo idéntico al original.
 */
function arraysIguales(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((valor, indice) => valor === b[indice]);
}

/**
 * Contenedor con el diff de merge parcial (design.md D5/D6, tasks.md Fase 9-11; spec:
 * configuracion-institucional). `FormularioGenerico` entrega SIEMPRE las 8 claves de texto como
 * `string` — este panel decide cuáles viajan comparando contra los valores iniciales, y traduce
 * `smtp_puerto` a `number` (Prisma `Int?`, sin `ValidationPipe` — un string crudo saldría 500).
 * `dominios_google` vive como estado local acá (D4: hermana de `FormularioGenerico`, no dentro).
 * No fuerza remount propio en éxito ni en error: el remount por `key={version}` es responsabilidad
 * de `ConfiguracionPage` (D6) para no duplicar la lógica ni perder los valores tras un 4xx.
 */
export function PanelDatosInstitucionales({
  config,
  deshabilitado,
  onGuardado,
}: PanelDatosInstitucionalesProps) {
  const iniciales: Record<string, string> = {
    nombre: config.nombre ?? '',
    director: config.director ?? '',
    color_primario: config.color_primario ?? '',
    color_secundario: config.color_secundario ?? '',
    zona_horaria: config.zona_horaria ?? '',
    smtp_host: '',
    smtp_puerto: '',
    smtp_remitente: '',
  };

  const [dominios, setDominios] = useState<string[]>(config.dominios_google);
  const [enviando, setEnviando] = useState(false);
  const [mensajeError, setMensajeError] = useState<string | undefined>(undefined);

  async function manejarEnviar(valores: Record<string, string>) {
    setMensajeError(undefined);

    const body: ActualizarConfiguracionInput = {};
    for (const clave of CLAVES_TEXTO_PRECARGADAS) {
      if (valores[clave] !== iniciales[clave]) {
        body[clave] = valores[clave];
      }
    }
    if (valores.smtp_host !== '') body.smtp_host = valores.smtp_host;
    if (valores.smtp_remitente !== '') body.smtp_remitente = valores.smtp_remitente;
    if (valores.smtp_puerto !== '') {
      const puerto = Number(valores.smtp_puerto);
      if (!Number.isInteger(puerto) || puerto <= 0) {
        setMensajeError('El puerto SMTP debe ser un número entero positivo.');
        return;
      }
      body.smtp_puerto = puerto;
    }
    if (!arraysIguales(dominios, config.dominios_google)) {
      body.dominios_google = dominios;
    }

    setEnviando(true);
    const resultado = await actualizarConfiguracion(body);
    setEnviando(false);

    if (!resultado.ok) {
      setMensajeError(
        mensajeDeError({ codigo: resultado.codigo, campo: resultado.campo, status: resultado.status }),
      );
      return;
    }

    onGuardado(resultado.data as ConfiguracionRespuestaDto);
  }

  return (
    <div className="flex flex-col gap-6">
      <FormularioGenerico
        campos={CAMPOS}
        modo="edicion"
        valoresIniciales={iniciales}
        onEnviar={manejarEnviar}
        enviando={enviando || Boolean(deshabilitado)}
        mensajeError={mensajeError}
      />
      <CampoDominios valor={dominios} onCambiar={setDominios} deshabilitado={deshabilitado || enviando} />
      <p className="text-caption text-on-surface-variant">
        Dejar los campos SMTP en blanco no modifica el valor guardado.
      </p>
    </div>
  );
}
