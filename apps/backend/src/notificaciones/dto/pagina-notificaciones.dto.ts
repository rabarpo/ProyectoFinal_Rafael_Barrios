import { ApiProperty } from '@nestjs/swagger';
import { NotificacionDto } from './notificacion-respuesta.dto';

// notificaciones (backlog #19), PR5 (design.md D9, "Contratos"). `total`/`no_leidas` viajan en el
// mismo response que el listado paginado: es lo que la insignia de la UI futura necesita sin un
// segundo endpoint.
export class PaginaNotificacionesDto {
  @ApiProperty({ description: 'Notificaciones de la página solicitada', type: [NotificacionDto] })
  datos!: NotificacionDto[];

  @ApiProperty({ description: 'Página solicitada (>=1)', type: Number })
  pagina!: number;

  @ApiProperty({ description: 'Tamaño de página (1..100)', type: Number })
  tamano!: number;

  @ApiProperty({ description: 'Total de notificaciones propias (respetando solo_no_leidas)', type: Number })
  total!: number;

  @ApiProperty({ description: 'Total de notificaciones propias no leídas, sin importar la página', type: Number })
  no_leidas!: number;
}
