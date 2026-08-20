import type { SesionUsuario } from '../auth/auth-api';
import type { Ruta } from './rutas';

/**
 * design.md D2/D3: `RolSesion` deriva del contrato generado (`SesionUsuarioDto.rol`), no de una
 * lista mantenida a mano — agregar un rol en `RolUsuario` (`schema.prisma`) rompe la
 * compilación de `MENU_POR_ROL` (totalidad de `Record`) en vez de degradar en silencio a un
 * menú vacío.
 */
export type RolSesion = SesionUsuario['rol'];

/**
 * Unión discriminada, misma disciplina que `Ruta` (D10 de `#12`): el compilador impide los dos
 * estados incoherentes ("placeholder con ruta", "navegable sin ruta") en vez de confiar en una
 * convención de campos opcionales.
 */
export type ItemMenu =
  | { clase: 'navegable'; id: string; etiqueta: string; ruta: Ruta }
  | { clase: 'proximamente'; id: string; etiqueta: string };

const PROCESOS: ItemMenu = { clase: 'navegable', id: 'procesos', etiqueta: 'Procesos', ruta: { nombre: 'procesos' } };
const PROCESO_NUEVO: ItemMenu = {
  clase: 'navegable',
  id: 'proceso-nuevo',
  etiqueta: 'Nuevo proceso',
  ruta: { nombre: 'proceso-nuevo' },
};
const ACADEMICA: ItemMenu = { clase: 'proximamente', id: 'academica', etiqueta: 'Académica' };
const USUARIOS: ItemMenu = { clase: 'proximamente', id: 'usuarios', etiqueta: 'Usuarios' };
const CONFIGURACION: ItemMenu = { clase: 'proximamente', id: 'configuracion', etiqueta: 'Configuración' };
const IMPORTACION_EXCEL: ItemMenu = {
  clase: 'proximamente',
  id: 'importacion-excel',
  etiqueta: 'Importación Excel',
};

/**
 * design.md D3: espeja los `@Roles` reales verificados en el backend
 * (`procesos.controller.ts`, `users.controller.ts`, `configuracion.controller.ts`,
 * `importacion.controller.ts`, `academico/*.controller.ts`). `docente`/`estudiante` no tienen
 * ningún endpoint de gestión, así que reciben `[]` — la autorización real sigue siendo `@Roles()`
 * server-side; este mapa es sólo presentación.
 *
 * Sin item "Candidatos": no existe ruta de listado de candidatos sin un `procesoId` concreto
 * (se llega navegando desde un proceso puntual, ver "Navegación a Procesos reutiliza la
 * pantalla existente" en spec.md) — un item de menú que apuntara a la misma `Ruta 'procesos'`
 * que "Procesos" sería un destino duplicado sin diferencia visible.
 */
export const MENU_POR_ROL: Record<RolSesion, readonly ItemMenu[]> = {
  administrador: [PROCESOS, PROCESO_NUEVO, ACADEMICA, USUARIOS, CONFIGURACION, IMPORTACION_EXCEL],
  director: [PROCESOS, PROCESO_NUEVO, ACADEMICA, USUARIOS, CONFIGURACION, IMPORTACION_EXCEL],
  comite: [PROCESOS, PROCESO_NUEVO, ACADEMICA],
  docente: [],
  estudiante: [],
};
