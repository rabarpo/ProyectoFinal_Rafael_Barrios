/**
 * administracion-academica, PR1 (#26; design.md D2). Dato puro, fuente única de la barra de
 * pestañas y del `switch` de `AcademicaPage` — misma disciplina que `MENU_POR_ROL` (D2 de #25):
 * se prueba como dato, no como render.
 */
export type PestanaAcademica = 'anios' | 'niveles' | 'grados' | 'secciones' | 'aulas' | 'matriculas';

export const PESTANAS: readonly { id: PestanaAcademica; etiqueta: string }[] = [
  { id: 'anios', etiqueta: 'Año escolar' },
  { id: 'niveles', etiqueta: 'Nivel' },
  { id: 'grados', etiqueta: 'Grado' },
  { id: 'secciones', etiqueta: 'Sección' },
  { id: 'aulas', etiqueta: 'Aula' },
  { id: 'matriculas', etiqueta: 'Matrícula' },
];
