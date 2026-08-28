import { ApiPropertyOptional } from '@nestjs/swagger';

// notificaciones (backlog #19), PR5 (design.md D9, tarea 12.1). Query params de
// `GET /notificaciones` validados a mano en `NotificacionesService.listar()` — mismo idioma sin
// `class-validator` que `ListarProcesosQueryDto` (`#13`): valor fuera de rango o de formato ->
// `400 CAMPO_INVALIDO {campo}`.
export class ListarNotificacionesQueryDto {
  @ApiPropertyOptional({
    description: 'Página, entero >=1 (default 1); fuera de rango -> 400 CAMPO_INVALIDO',
    type: Number,
  })
  pagina?: string;

  @ApiPropertyOptional({
    description: 'Tamaño de página, entero 1..100 (default 20); fuera de rango -> 400 CAMPO_INVALIDO',
    type: Number,
  })
  tamano?: string;

  @ApiPropertyOptional({
    description: "Filtra solo las no leídas cuando es 'true'; cualquier otro valor -> 400 CAMPO_INVALIDO",
    enum: ['true', 'false'],
  })
  solo_no_leidas?: string;
}
