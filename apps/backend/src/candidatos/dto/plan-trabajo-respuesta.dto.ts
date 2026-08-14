import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR2 (design.md "Contratos HTTP", tarea 6.1). Respuesta de
// `PUT /listas/:id/plan-trabajo` y `DELETE /listas/:id/plan-trabajo` — nunca incluye los bytes
// (esos solo viajan por `GET /listas/:id/plan-trabajo`), mismo criterio que `LogoRespuestaDto`.
export class PlanTrabajoRespuestaDto {
  @ApiProperty({ description: 'true si la lista tiene un plan de trabajo en PDF almacenado', type: Boolean })
  plan_trabajo_presente!: boolean;

  @ApiPropertyOptional({ description: 'Nombre original del PDF, ausente si no hay plan de trabajo', type: String })
  plan_trabajo_nombre?: string;
}
