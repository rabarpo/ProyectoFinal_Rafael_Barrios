import { ApiProperty } from '@nestjs/swagger';

// vote-casting, PR1 (design.md D13, "DTO planos con @ApiProperty, sin class-validator" — mismo
// idioma que #11-#13). Respuesta de `GET /votos/papeleta/:derechoVotoId`: todo lo que necesitan
// los 3 pasos en una sola llamada. Nunca es la validación (esa vive en `VotosService.emitir()`,
// PR2) — es sólo UX.
//
// Cada `@ApiProperty()` de este archivo declara `type` explícitamente (`String`/`Boolean`/clase),
// en vez de confiar en la inferencia por metadata de decoradores de TypeScript. Verificado en
// apply: bajo `tsx` (esbuild), la metadata `design:type` de una propiedad primitiva anidada
// DENTRO de un DTO que a su vez es propiedad de otro DTO no siempre se emite, y
// `@nestjs/swagger` 8.1 confunde ese `undefined` con una "dependencia circular" al armar el
// esquema anidado (`pnpm openapi:extract` fallaba con "A circular dependency has been detected
// (property key: id)" antes de este cambio, incluso con resolvers perezosos en el nivel externo).
export class PapeletaProcesoDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  nombre!: string;

  @ApiProperty({ type: String, nullable: true })
  descripcion!: string | null;

  @ApiProperty({ type: String })
  fecha_cierre_prevista!: string;
}

export class PapeletaOpcionDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  etiqueta!: string;
}

export class PapeletaComprobanteDto {
  @ApiProperty({ type: String })
  codigo_comprobante!: string;

  @ApiProperty({ type: String })
  hora_servidor!: string;
}

export class PapeletaDto {
  @ApiProperty({ type: () => PapeletaProcesoDto })
  proceso!: PapeletaProcesoDto;

  @ApiProperty({ type: String })
  en_calidad_de!: string;

  @ApiProperty({ type: () => [PapeletaOpcionDto] })
  opciones!: PapeletaOpcionDto[];

  @ApiProperty({ type: Boolean })
  ya_voto!: boolean;

  @ApiProperty({ type: () => PapeletaComprobanteDto, nullable: true })
  comprobante!: PapeletaComprobanteDto | null;
}
