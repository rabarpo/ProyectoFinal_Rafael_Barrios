import { ApiProperty } from '@nestjs/swagger';

// auth-server-sessions, PR3 (design.md, tarea 6.1). `codigo` es el identificador de login
// (`Usuario.codigo`, único e institucional); aceptar `correo` queda para un change posterior.
export class LoginDto {
  // administracion-procesos-electorales, PR1 (design.md D9). `type: String` explícito: bajo
  // `tsx`/esbuild (usado por `openapi:extract`) la metadata `design:type` de una propiedad de
  // clase sin inicializador no siempre se emite completa, y `@nestjs/swagger` cae en un falso
  // "circular dependency" al explorar el modelo por primera vez desde `@ApiBody`. Mismo criterio
  // que `UsuarioBloqueadoDto`, que ya declara `type` explícito en cada `@ApiProperty()`.
  @ApiProperty({ description: 'Código institucional único del usuario', example: 'seed-comite', type: String })
  codigo!: string;

  @ApiProperty({ description: 'Contraseña en texto plano (nunca persistida ni auditada)', type: String })
  password!: string;
}
