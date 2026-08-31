import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import type { ErrorFilaDto } from '../importacion-api';

interface TablaErroresImportacionProps {
  errores: ErrorFilaDto[];
}

/**
 * frontend-importacion-excel, PR4 (#29; design.md D10, tasks.md 4.3-4.4; Threat Matrix).
 * Presentacional puro: `TablaGenerica` SIN pasar `acciones` (su default `[]` evita renderizar la
 * columna de escritura). Cuatro columnas: `fila`, `campo`, `motivo` (traducido desde `MOTIVOS_FILA`)
 * y `valor_recibido` (renderizado como texto en la celda — React escapa por defecto, nunca
 * `dangerouslySetInnerHTML`: su contenido viene del archivo que subió el usuario). Sin paginación ni
 * virtualización (el delta lo prohíbe). Sin fetch, sin `useSesion()`, sin estado propio.
 */
const MOTIVOS_FILA: Record<ErrorFilaDto['motivo'], string> = {
  fila_vacia: 'Fila vacía',
  formato: 'Formato inválido',
  campo_duplicado: 'Campo duplicado',
  referencia_inexistente: 'Referencia inexistente',
};

const COLUMNAS: ColumnaTabla<ErrorFilaDto>[] = [
  { clave: 'fila', encabezado: 'Fila', celda: (error) => error.fila },
  { clave: 'campo', encabezado: 'Campo', celda: (error) => error.campo },
  { clave: 'motivo', encabezado: 'Motivo', celda: (error) => MOTIVOS_FILA[error.motivo] },
  { clave: 'valor_recibido', encabezado: 'Valor recibido', celda: (error) => error.valor_recibido },
];

export function TablaErroresImportacion({ errores }: TablaErroresImportacionProps) {
  return (
    <TablaGenerica
      columnas={COLUMNAS}
      filas={errores}
      claveFila={(error) => `${error.fila}-${error.campo}`}
      mensajeVacio="No hay errores para mostrar."
    />
  );
}
