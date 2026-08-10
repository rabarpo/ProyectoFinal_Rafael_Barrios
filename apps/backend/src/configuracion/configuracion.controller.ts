import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import {
  BadRequestException,
  Body,
  Catch,
  Controller,
  Get,
  NotFoundException,
  PayloadTooLargeException,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { UsersService } from '../users/users.service';
import { UsuarioRespuestaDto } from '../users/dto/usuario-respuesta.dto';
import { CONFIGURACION_ERROR_CODES } from './configuracion.errors';
import { ConfiguracionService } from './configuracion.service';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import { ConfiguracionRespuestaDto } from './dto/configuracion-respuesta.dto';
import { LogoRespuestaDto } from './dto/logo-respuesta.dto';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

interface RespuestaConCabeceras {
  set(cabeceras: Record<string, string>): void;
}

// PR3 (design.md "Interfaces / Contracts", tarea 3.3). Mismo criterio que `ArchivoMulter` de
// `importacion.controller.ts`: shape mínimo local, nunca `Express.Multer.File`.
export interface ArchivoMulter {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
}

// Threat matrix (design.md, tareas 3.1/3.6): allowlist doble de extensión + MIME evaluada en
// `fileFilter`, antes de tocar la DB. `EXTENSION_CON_PUNTO_INTERMEDIA_REGEX` rechaza la doble
// extensión (`logo.png.svg`) — un archivo cuyo nombre contiene una extensión permitida seguida de
// otro punto es sospechoso incluso si la extensión final también es válida.
const EXTENSION_PERMITIDA_REGEX = /\.(png|jpe?g|svg)$/i;
const EXTENSION_CON_PUNTO_INTERMEDIA_REGEX = /\.(png|jpe?g|svg)\./i;
const TAMANIO_MAXIMO_LOGO_BYTES = 2 * 1024 * 1024;

const MIME_ESPERADO_POR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  svg: 'image/svg+xml',
};

export function filtroArchivoLogo(
  _req: unknown,
  archivo: Pick<ArchivoMulter, 'originalname' | 'mimetype'>,
  callback: (error: Error | null, aceptar: boolean) => void,
): void {
  if (EXTENSION_CON_PUNTO_INTERMEDIA_REGEX.test(archivo.originalname)) {
    callback(
      new BadRequestException({ codigo: CONFIGURACION_ERROR_CODES.LOGO_FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  const coincidencia = EXTENSION_PERMITIDA_REGEX.exec(archivo.originalname);
  if (!coincidencia) {
    callback(
      new BadRequestException({ codigo: CONFIGURACION_ERROR_CODES.LOGO_FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  const extension = coincidencia[1].toLowerCase();
  if (archivo.mimetype !== MIME_ESPERADO_POR_EXTENSION[extension]) {
    callback(
      new BadRequestException({ codigo: CONFIGURACION_ERROR_CODES.LOGO_FORMATO_NO_PERMITIDO }),
      false,
    );
    return;
  }

  callback(null, true);
}

/**
 * PR3 (tarea 3.2). `multer`/`@nestjs/platform-express` traduce `LIMIT_FILE_SIZE` en
 * `PayloadTooLargeException` (413) por defecto (`transformException`); la spec pide un "error 4xx
 * legible" y `tasks.md` pide explícitamente `BadRequestException` (400, no 413) — este filtro,
 * acotado a la ruta `POST /configuracion/logo`, hace esa traducción.
 */
@Catch(PayloadTooLargeException)
export class LogoTamanioExcedidoFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    const response = host
      .switchToHttp()
      .getResponse<{ status(codigo: number): { json(cuerpo: unknown): void } }>();
    response.status(400).json({ codigo: CONFIGURACION_ERROR_CODES.LOGO_TAMANIO_EXCEDIDO });
  }
}

/**
 * configuracion-general, PR2 (design.md "Interfaces / Contracts", tarea 2.11). `@Roles(
 * 'administrador', 'director')` a nivel de clase (mismo criterio que `AniosEscolaresController`/
 * `UsersController`): un único guard cubre las tres rutas de este PR. `GET /configuracion/comite`
 * delega en `UsersService.listar({ rol: 'comite' })` en vez de declarar su propio provider —
 * reutiliza el DTO de listado de usuarios ya existente (spec "Listado de integrantes del comité").
 */
@ApiTags('configuracion')
@ApiCookieAuth()
@Controller('configuracion')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class ConfiguracionController {
  constructor(
    private readonly configuracionService: ConfiguracionService,
    private readonly usersService: UsersService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Consulta la configuración institucional' })
  @ApiResponse({ status: 200, description: 'Configuración institucional', type: ConfiguracionRespuestaDto })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async obtener(): Promise<ConfiguracionRespuestaDto> {
    return this.configuracionService.obtener();
  }

  @Put()
  @ApiOperation({ summary: 'Actualiza la configuración institucional (merge parcial, auditado)' })
  @ApiResponse({ status: 200, description: 'Configuración actualizada', type: ConfiguracionRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido (color, zona horaria o dominio)' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async actualizar(
    @Body() dto: ActualizarConfiguracionDto,
    @Req() req: RequestConUsuario,
  ): Promise<ConfiguracionRespuestaDto> {
    return this.configuracionService.actualizar(dto, req.usuario!.userId);
  }

  @Get('comite')
  @ApiOperation({ summary: 'Lista los usuarios con rol comite' })
  @ApiResponse({ status: 200, description: 'Integrantes del comité', type: [UsuarioRespuestaDto] })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async listarComite(): Promise<UsuarioRespuestaDto[]> {
    return this.usersService.listar({ rol: 'comite' });
  }

  /**
   * PR3 (design.md "Interfaces / Contracts", tarea 3.5, spec "Subida de logo institucional").
   * Allowlist doble (extensión + MIME) y límite de 2 MB evaluados antes de tocar la DB (tareas
   * 3.1-3.3); `LogoTamanioExcedidoFilter` traduce el 413 por defecto de `multer` a 400 (tarea 3.2).
   */
  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @UseFilters(LogoTamanioExcedidoFilter)
  @UseInterceptors(
    FileInterceptor('logo', {
      fileFilter: filtroArchivoLogo,
      limits: { fileSize: TAMANIO_MAXIMO_LOGO_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Sube el logo institucional (PNG/JPG/SVG, máximo 2 MB)' })
  @ApiResponse({ status: 200, description: 'Logo persistido', type: LogoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Formato no permitido, archivo vacío, excede 2 MB o ausente' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async subirLogo(
    @UploadedFile() archivo: ArchivoMulter | undefined,
    @Req() req: RequestConUsuario,
  ): Promise<LogoRespuestaDto> {
    if (!archivo) {
      throw new BadRequestException({ codigo: CONFIGURACION_ERROR_CODES.LOGO_REQUERIDO });
    }

    return this.configuracionService.actualizarLogo(
      { buffer: archivo.buffer, mimetype: archivo.mimetype },
      req.usuario!.userId,
    );
  }

  /**
   * PR3 (design.md "Interfaces / Contracts"/Threat Matrix, tarea 3.5). `X-Content-Type-Options:
   * nosniff` + `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'` en TODA
   * respuesta (incluida la de un SVG con `<script>`/`onload` que haya pasado la allowlist — el
   * archivo se acepta como archivo, pero nunca se ejecuta en el origen de la app).
   */
  @Get('logo')
  @ApiProduces('image/png', 'image/jpeg', 'image/svg+xml')
  @ApiOperation({ summary: 'Descarga el logo institucional' })
  @ApiResponse({ status: 200, description: 'Binario del logo con el Content-Type persistido' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  @ApiResponse({ status: 404, description: 'No hay logo institucional persistido' })
  async obtenerLogo(@Res({ passthrough: true }) res: RespuestaConCabeceras): Promise<StreamableFile> {
    const logo = await this.configuracionService.obtenerLogo();
    if (!logo) {
      throw new NotFoundException({ codigo: CONFIGURACION_ERROR_CODES.LOGO_NO_ENCONTRADO });
    }

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
    });

    return new StreamableFile(logo.buffer, { type: logo.mime });
  }
}
