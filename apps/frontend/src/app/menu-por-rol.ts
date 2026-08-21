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
const ACADEMICA: ItemMenu = {
  clase: 'navegable',
  id: 'academica',
  etiqueta: 'Académica',
  ruta: { nombre: 'academica' },
};
const USUARIOS: ItemMenu = {
  clase: 'navegable',
  id: 'usuarios',
  etiqueta: 'Usuarios',
  ruta: { nombre: 'usuarios' },
};
const CUENTAS_BLOQUEADAS: ItemMenu = {
  clase: 'navegable',
  id: 'cuentas-bloqueadas',
  etiqueta: 'Cuentas bloqueadas',
  ruta: { nombre: 'cuentas-bloqueadas' },
};
const CONFIGURACION: ItemMenu = {
  clase: 'navegable',
  id: 'configuracion',
  etiqueta: 'Configuración',
  ruta: { nombre: 'configuracion' },
};
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
 *
 * `académica` (administracion-academica, PR1, #26; design.md D12) pasa de placeholder a item
 * navegable real con `Ruta { nombre: 'academica' }` para `administrador`/`director`/`comite`.
 *
 * `usuarios` (administracion-usuarios-apoderados, PR1, #27; design.md D2) pasa de placeholder
 * a item navegable con `Ruta { nombre: 'usuarios' }`, sólo para `administrador`/`director`
 * (`UsersController` es `@Roles('administrador','director')`). `cuentas-bloqueadas` es un item
 * nuevo, exclusivo de `comite` (`AuthController.listarBloqueados`/`desbloquear` es
 * `@Roles('comite')`) — un item visible que garantiza `403` al primer click es peor que ningún
 * item, así que ninguno de los dos se comparte entre roles disjuntos.
 *
 * `configuracion` (frontend-configuracion-general, PR1, #28; design.md D2) pasa de placeholder a
 * item navegable con `Ruta { nombre: 'configuracion' }`, sólo para `administrador`/`director`
 * (`ConfiguracionController` es `@Roles('administrador','director')` a nivel de clase) — cero
 * cambios en las filas de `MENU_POR_ROL`, ya figuraba sólo en esos dos roles.
 */
export const MENU_POR_ROL: Record<RolSesion, readonly ItemMenu[]> = {
  administrador: [PROCESOS, PROCESO_NUEVO, ACADEMICA, USUARIOS, CONFIGURACION, IMPORTACION_EXCEL],
  director: [PROCESOS, PROCESO_NUEVO, ACADEMICA, USUARIOS, CONFIGURACION, IMPORTACION_EXCEL],
  comite: [PROCESOS, PROCESO_NUEVO, ACADEMICA, CUENTAS_BLOQUEADAS],
  docente: [],
  estudiante: [],
};
