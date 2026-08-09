import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR2 (design.md D3, tarea 6.1). Sin `class-validator` — mismo criterio
// que el resto del proyecto (`CrearUsuarioDto`), toda validación de negocio vive en
// `AniosEscolaresService`. `activo` nunca aparece aquí: siempre se fija en `false` en la creación
// (design.md "Contratos HTTP"); activar es el endpoint dedicado de PR3.
export class CrearAnioEscolarDto {
  @ApiProperty({ description: 'Nombre único del año escolar', type: String })
  nombre!: string;
}
