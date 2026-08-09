import { BadRequestException, Controller, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ResultadoImportacionDto } from './dto/resultado-importacion.dto';
import { IMPORTACION_ERROR_CODES } from './importacion.errors';
import { ImportacionService } from './importacion.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

// `tsconfig.json` acota `types` a `["node", "jest"]` (mismo criterio que `AuthGuard`/`RequestConCookies`:
// evitar depender de `express`/`@types/express`, que no son dependencias directas de
// `@seei/backend`). Shape mínimo local en vez de `Express.Multer.File` global — `@types/multer`
// solo aporta el tipo de `FileInterceptor` en tiempo de ejecución, no la ambient declaration.
export interface ArchivoMulter {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

// D7: allowlist explícita — `.xlsx`/`.csv` únicamente, NUNCA `.xlsm` (ni ninguna otra extensión de
// Excel con macros), evaluada antes de tocar la base (spec "Subida de archivo de padrón...").
const EXTENSIONES_PERMITIDAS = /\.(xlsx|csv)$/i;

// design.md, Open Questions: 5 MB propuesto como tamaño máximo del multipart (sin precedente
// interno) — primer endpoint de subida de archivos del proyecto.
const TAMANIO_MAXIMO_BYTES = 5 * 1024 * 1024;

export function filtroArchivoPadron(
  _req: unknown,
  archivo: Pick<ArchivoMulter, 'originalname'>,
  callback: (error: Error | null, aceptar: boolean) => void,
): void {
  if (!EXTENSIONES_PERMITIDAS.test(archivo.originalname)) {
    callback(new BadRequestException({ codigo: IMPORTACION_ERROR_CODES.EXTENSION_NO_PERMITIDA }), false);
    return;
  }
  callback(null, true);
}

/**
 * importacion-excel, PR2 (design.md D7, "Data Flow", tarea 2.6, spec `importacion-excel`).
 * `@Roles('administrador', 'director')` a nivel de clase (mismo criterio que
 * `MatriculasController`). `GET /importaciones/:id/errores.csv` se agrega en PR3 (Redis, D4).
 */
@ApiTags('importaciones')
@ApiCookieAuth()
@Controller('importaciones')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class ImportacionController {
  constructor(private readonly importacionService: ImportacionService) {}

  @Post('padron')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('archivo', {
      fileFilter: filtroArchivoPadron,
      limits: { fileSize: TAMANIO_MAXIMO_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Importa el padrón de Usuario+Matricula desde un archivo .xlsx/.csv' })
  @ApiResponse({ status: 201, description: 'Resultado de la importación', type: ResultadoImportacionDto })
  @ApiResponse({
    status: 400,
    description: 'Cabecera inválida, archivo excede 2000 filas, extensión no permitida o archivo ausente',
  })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async importarPadron(
    @UploadedFile() archivo: ArchivoMulter | undefined,
    @Req() req: RequestConUsuario,
  ): Promise<ResultadoImportacionDto> {
    if (!archivo) {
      throw new BadRequestException({ codigo: IMPORTACION_ERROR_CODES.ARCHIVO_REQUERIDO });
    }

    return this.importacionService.importar(
      { buffer: archivo.buffer, originalname: archivo.originalname, mimetype: archivo.mimetype },
      req.usuario!.userId,
    );
  }
}
