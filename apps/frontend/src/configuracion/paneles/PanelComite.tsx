import { TablaGenerica } from '../../comun/piezas/TablaGenerica';
import type { ColumnaTabla } from '../../comun/piezas/TablaGenerica';
import type { UsuarioRespuestaDto } from '../configuracion-api';

interface PanelComiteProps {
  integrantes: UsuarioRespuestaDto[];
}

const COLUMNAS: ColumnaTabla<UsuarioRespuestaDto>[] = [
  { clave: 'nombres', encabezado: 'Nombres', celda: (fila) => fila.nombres },
  { clave: 'dni', encabezado: 'DNI', celda: (fila) => fila.dni },
  { clave: 'codigo', encabezado: 'Código', celda: (fila) => fila.codigo },
  { clave: 'correo', encabezado: 'Correo', celda: (fila) => fila.correo },
  { clave: 'estado', encabezado: 'Estado', celda: (fila) => fila.estado },
];

/**
 * frontend-configuracion-general, PR4 (#28; design.md D9, tasks.md Fase 15). Lista de comité
 * EXCLUSIVAMENTE de lectura: `TablaGenerica` sin pasar la prop `acciones` en absoluto (no
 * `acciones={[]}`), así el intent queda verificable por lectura — ningún `AccionFila` declarado
 * en este módulo. La edición de usuarios del comité vive en `#27`, no acá. Ciego al rol (D10): no
 * llama `useSesion()`.
 */
export function PanelComite({ integrantes }: PanelComiteProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-title-md text-on-surface">Comité electoral</h2>
      <TablaGenerica
        columnas={COLUMNAS}
        filas={integrantes}
        claveFila={(fila) => fila.id}
        mensajeVacio="No hay integrantes del comité registrados."
      />
    </div>
  );
}
