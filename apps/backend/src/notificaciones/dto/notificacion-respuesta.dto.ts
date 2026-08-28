import { ApiProperty } from '@nestjs/swagger';

// notificaciones (backlog #19), PR5 (design.md D9, "Contratos"). NUNCA `job_correo_id` crudo:
// `tiene_correo: boolean` es el mismo criterio que `pdf_disponible` en `ActaResumenDto` (`#17` D13).
export class NotificacionDto {
  @ApiProperty({ description: 'ID de la notificación', type: String })
  id!: string;

  @ApiProperty({
    description: 'Evento que originó la notificación',
    enum: ['inicio_votacion', 'recordatorio', 'cierre_proximo', 'resultados'],
  })
  evento!: string;

  @ApiProperty({ description: 'Proceso electoral relacionado, si aplica', type: String, nullable: true })
  proceso_id!: string | null;

  @ApiProperty({ description: 'Título para la bandeja interna', type: String })
  titulo!: string;

  @ApiProperty({ description: 'Cuerpo para la bandeja interna', type: String })
  cuerpo!: string;

  @ApiProperty({ description: 'Momento de creación (ISO-8601)', type: String })
  creado_en!: string;

  @ApiProperty({ description: 'Momento en que se marcó como leída (ISO-8601), null si no se ha leído', type: String, nullable: true })
  leido_en!: string | null;

  @ApiProperty({ description: 'true si la notificación tiene un JobCorreo asociado', type: Boolean })
  tiene_correo!: boolean;
}
