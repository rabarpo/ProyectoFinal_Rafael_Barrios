import { describe, expect, it } from 'vitest';
import { MENU_POR_ROL } from './menu-por-rol';
import type { RolSesion } from './menu-por-rol';
import { parsearRuta, rutaAPath } from './rutas';

// [design.md D2/D3/D8; spec: menu-navegacion-post-login] `MENU_POR_ROL` es la ÚNICA fuente para
// `NavegacionPrincipal` e `InicioPage` — espeja los `@Roles` reales verificados en el backend
// (design.md, tabla D3). Se prueba como dato (sin render): exhaustivo por rol, no depende de
// jsdom y no se rompe al retocar un `className`.
describe('MENU_POR_ROL', () => {
  const idsPorRol: Record<RolSesion, string[]> = {
    administrador: [
      'procesos',
      'proceso-nuevo',
      'academica',
      'usuarios',
      'configuracion',
      'importacion-excel',
      'panel-jornada',
    ],
    director: [
      'procesos',
      'proceso-nuevo',
      'academica',
      'usuarios',
      'configuracion',
      'importacion-excel',
      'panel-jornada',
    ],
    comite: ['procesos', 'proceso-nuevo', 'academica', 'cuentas-bloqueadas', 'panel-jornada'],
    docente: [],
    // descubrimiento-derechos-voto, PR2 (#30; design.md D7, tasks.md 5.4): `estudiante` deja de
    // ser `[]` — recibe el item navegable "Mis votaciones".
    estudiante: ['mis-votaciones'],
  };

  // frontend-configuracion-general, PR1 (#28; design.md D2, tasks.md 3.1-3.2). `configuracion`
  // deja de ser placeholder para administrador/director; comite/docente/estudiante no lo tienen
  // (`ConfiguracionController` es `@Roles('administrador','director')` a nivel de clase).
  it('[3.1] configuracion es navegable para administrador y director', () => {
    for (const rol of ['administrador', 'director'] as RolSesion[]) {
      const item = MENU_POR_ROL[rol].find((i) => i.id === 'configuracion');
      expect(item).toEqual({
        clase: 'navegable',
        id: 'configuracion',
        etiqueta: 'Configuración',
        ruta: { nombre: 'configuracion' },
      });
    }
  });

  it('[3.2] comite, docente y estudiante no tienen item configuracion', () => {
    for (const rol of ['comite', 'docente', 'estudiante'] as RolSesion[]) {
      expect(MENU_POR_ROL[rol].find((i) => i.id === 'configuracion')).toBeUndefined();
    }
  });

  it.each(Object.keys(idsPorRol) as RolSesion[])('[4.1] el rol %s expone exactamente su conjunto de ids', (rol) => {
    const idsEsperados = idsPorRol[rol];
    const idsReales = MENU_POR_ROL[rol].map((item) => item.id);

    expect(new Set(idsReales)).toEqual(new Set(idsEsperados));
    expect(idsReales).toHaveLength(idsEsperados.length);
  });

  // administracion-academica, PR1 (#26; design.md D12, tasks.md 2.1). `académica` deja de ser
  // placeholder para administrador/director/comité: pasa a item navegable con `Ruta 'academica'`.
  it('[2.1] académica es navegable para administrador, director y comité', () => {
    for (const rol of ['administrador', 'director', 'comite'] as RolSesion[]) {
      const item = MENU_POR_ROL[rol].find((i) => i.id === 'academica');
      expect(item).toEqual({ clase: 'navegable', id: 'academica', etiqueta: 'Académica', ruta: { nombre: 'academica' } });
    }
  });

  it('[2.1] docente y estudiante no tienen item académica', () => {
    expect(MENU_POR_ROL.docente.find((i) => i.id === 'academica')).toBeUndefined();
    expect(MENU_POR_ROL.estudiante.find((i) => i.id === 'academica')).toBeUndefined();
  });

  // descubrimiento-derechos-voto, PR2 (#30; design.md D7, tasks.md 5.4; spec:
  // descubrimiento-derechos-voto, "Aterrizaje frontend con navegación bloqueada en derechos
  // usados"). `estudiante` pasa de placeholder vacío a item navegable real; `docente` sigue en
  // `[]` (proposal: "Out of Scope", `DerechoVoto` nunca se genera para ese rol).
  it('[5.4] mis-votaciones es navegable sólo para estudiante', () => {
    const item = MENU_POR_ROL.estudiante.find((i) => i.id === 'mis-votaciones');
    expect(item).toEqual({
      clase: 'navegable',
      id: 'mis-votaciones',
      etiqueta: 'Mis votaciones',
      ruta: { nombre: 'mis-votaciones' },
    });

    for (const rol of ['administrador', 'director', 'comite', 'docente'] as RolSesion[]) {
      expect(MENU_POR_ROL[rol].find((i) => i.id === 'mis-votaciones')).toBeUndefined();
    }
  });

  // frontend-importacion-excel, PR1 (#29; design.md D2, tasks.md 1.3-1.4; spec:
  // menu-navegacion-post-login, "Ítem real de importación de Excel para administrador y director").
  // `IMPORTACION_EXCEL` deja de ser placeholder `proximamente`: pasa a item navegable con
  // `Ruta { nombre: 'importacion-excel' }`, sólo para `administrador`/`director`
  // (`ImportacionController` es `@Roles('administrador','director')` a nivel de clase). Cero
  // cambios en las filas de `MENU_POR_ROL`: ya figuraba sólo en esos dos roles.
  it('[1.3] importacion-excel es navegable para administrador y director', () => {
    for (const rol of ['administrador', 'director'] as RolSesion[]) {
      const item = MENU_POR_ROL[rol].find((i) => i.id === 'importacion-excel');
      expect(item).toEqual({
        clase: 'navegable',
        id: 'importacion-excel',
        etiqueta: 'Importación Excel',
        ruta: { nombre: 'importacion-excel' },
      });
    }
  });

  it('[1.3] comite, docente y estudiante no tienen item importacion-excel', () => {
    for (const rol of ['comite', 'docente', 'estudiante'] as RolSesion[]) {
      expect(MENU_POR_ROL[rol].find((i) => i.id === 'importacion-excel')).toBeUndefined();
    }
  });

  it('[1.3] ya no queda ningún item "proximamente" en el mapa', () => {
    for (const items of Object.values(MENU_POR_ROL)) {
      for (const item of items) {
        expect(item.clase).toBe('navegable');
      }
    }
  });

  it('[4.2] ningún item "proximamente" expone una ruta', () => {
    for (const items of Object.values(MENU_POR_ROL)) {
      for (const item of items) {
        if (item.clase === 'proximamente') {
          expect((item as { ruta?: unknown }).ruta).toBeUndefined();
        }
      }
    }
  });

  // administracion-usuarios-apoderados, PR1 (#27; design.md D2, tasks.md 3.1). `usuarios` deja
  // de ser placeholder para administrador/director: pasa a item navegable con `Ruta 'usuarios'`.
  it('[3.1] usuarios es navegable para administrador y director', () => {
    for (const rol of ['administrador', 'director'] as RolSesion[]) {
      const item = MENU_POR_ROL[rol].find((i) => i.id === 'usuarios');
      expect(item).toEqual({ clase: 'navegable', id: 'usuarios', etiqueta: 'Usuarios', ruta: { nombre: 'usuarios' } });
    }
  });

  // administracion-usuarios-apoderados, PR1 (#27; design.md D2, tasks.md 3.2). Defensa en
  // profundidad del lado del cliente: sólo `comite` alcanza `cuentas-bloqueadas`.
  it('[3.2] cuentas-bloqueadas es navegable sólo para comite', () => {
    const item = MENU_POR_ROL.comite.find((i) => i.id === 'cuentas-bloqueadas');
    expect(item).toEqual({
      clase: 'navegable',
      id: 'cuentas-bloqueadas',
      etiqueta: 'Cuentas bloqueadas',
      ruta: { nombre: 'cuentas-bloqueadas' },
    });

    for (const rol of ['administrador', 'director', 'docente', 'estudiante'] as RolSesion[]) {
      expect(MENU_POR_ROL[rol].find((i) => i.id === 'cuentas-bloqueadas')).toBeUndefined();
    }
  });

  // administracion-usuarios-apoderados, PR1 (#27; spec: administracion-usuarios-apoderados,
  // "Comité no ve el item de menú usuarios"; tasks.md 3.3).
  it('[3.3] comite no tiene item usuarios', () => {
    expect(MENU_POR_ROL.comite.find((i) => i.id === 'usuarios')).toBeUndefined();
  });

  // dashboard-panel-jornada, PR3 (Backlog #20; design.md "Cambios de archivos", tasks.md 12.5;
  // spec: menu-navegacion-post-login, "Navegación a Panel de jornada reutiliza la ruta nueva").
  it('[12.5] panel-jornada es navegable para administrador, director y comité', () => {
    for (const rol of ['administrador', 'director', 'comite'] as RolSesion[]) {
      const item = MENU_POR_ROL[rol].find((i) => i.id === 'panel-jornada');
      expect(item).toEqual({
        clase: 'navegable',
        id: 'panel-jornada',
        etiqueta: 'Panel de jornada',
        ruta: { nombre: 'panel-jornada' },
      });
    }
  });

  // dashboard-panel-jornada, PR3 (Backlog #20; tasks.md 12.6; threat: "Rol no autorizado navega
  // a mano"). `MENU_POR_ROL` no expone el ítem a `docente`/`estudiante` — la autorización real
  // sigue siendo `@Roles()` server-side.
  it('[12.6] docente y estudiante no tienen item panel-jornada', () => {
    for (const rol of ['docente', 'estudiante'] as RolSesion[]) {
      expect(MENU_POR_ROL[rol].find((i) => i.id === 'panel-jornada')).toBeUndefined();
    }
  });

  // dashboard-panel-jornada, PR4 (Backlog #20; design.md D10, tasks.md 14.6; spec:
  // "Proyección no aparece en el menú"). Ningún item de `MENU_POR_ROL` enlaza a la ruta de
  // proyección, para ningún rol — requiere `procesoId` que el menú no tiene (mismo criterio que
  // "Candidatos"), y además es intencionalmente inaccesible desde el menú (D10, pantalla de
  // kiosco, sólo por URL directa).
  it('[14.6] ningún item de MENU_POR_ROL enlaza a la ruta de proyección', () => {
    for (const items of Object.values(MENU_POR_ROL)) {
      for (const item of items) {
        if (item.clase === 'navegable') {
          expect(item.ruta.nombre).not.toBe('proyeccion');
        }
      }
    }
  });

  it('[4.3] toda ruta de item navegable hace round-trip con parsearRuta/rutaAPath', () => {
    for (const items of Object.values(MENU_POR_ROL)) {
      for (const item of items) {
        if (item.clase === 'navegable') {
          expect(parsearRuta(rutaAPath(item.ruta))).toEqual(item.ruta);
        }
      }
    }
  });
});
