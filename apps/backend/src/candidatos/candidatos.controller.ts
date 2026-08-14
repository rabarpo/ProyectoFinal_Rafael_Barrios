import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ArchivoTamanioExcedidoFilter, TAMANIO_MAXIMO_FOTO_BYTES, filtroFoto } from './archivos';
import type { ArchivoMulter } from './archivos';
import { CandidatosService } from './candidatos.service';
import { ActualizarCandidatoDto } from './dto/actualizar-candidato.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';
import { CandidatoRespuestaDto } from './dto/candidato-respuesta.dto';
import { CrearCandidatoDto } from './dto/crear-candidato.dto';
import { ListarCandidatosQuery } from './dto/listar-candidatos.query';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

interface RespuestaConCabeceras {
  set(cabeceras: Record<string, string>): void;
}

/**
 * candidatos-listas-opciones-consulta, PR4 (design.md D4/D5, "Contratos HTTP", tarea 11.9).
 * `@Roles('administrador', 'director', 'comite')` a nivel de clase (D5 de este change). Alta y
 * edición viajan como `multipart/form-data` (D4): todos los escalares de `Candidato` son `String`,
 * así que ningún campo del body necesita coerción manual — solo `foto` se procesa vía
 * `@UploadedFile()`. Rutas estáticas antes de `:id` (gotcha de enrutamiento de Nest, D4 de #11):
 * este controlador no declara ninguna ruta estática de nivel superior distinta de `:id/estado`,
 * que Nest resuelve sin ambigüedad frente a `:id`.
 */
@ApiTags('candidatos')
@ApiCookieAuth()
@Controller('candidatos')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class CandidatosController {
  constructor(private readonly candidatosService: CandidatosService) {}

  @Post()
  @ApiConsumes('multipart/form-data')
  @UseFilters(ArchivoTamanioExcedidoFilter)
  @UseInterceptors(
    FileInterceptor('foto', {
      fileFilter: filtroFoto,
      limits: { fileSize: TAMANIO_MAXIMO_FOTO_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Crea un Candidato acotado a un ProcesoElectoral existente (foto obligatoria)' })
  @ApiResponse({ status: 201, description: 'Candidato creado', type: CandidatoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido, foto ausente, formato no permitido o excede 2 MB' })
  @ApiResponse({ status: 409, description: 'ProcesoElectoral/Lista inexistente o incoherencia jerárquica' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async crear(
    @Body() dto: CrearCandidatoDto,
    @UploadedFile() archivo: ArchivoMulter | undefined,
    @Req() req: RequestConUsuario,
  ): Promise<CandidatoRespuestaDto> {
    return this.candidatosService.crear(
      {
        proceso_id: dto.proceso_id,
        nombres: dto.nombres,
        grado: dto.grado,
        aula: dto.aula,
        cargo: dto.cargo,
        lista_id: dto.lista_id,
      },
      archivo ? { buffer: archivo.buffer, mimetype: archivo.mimetype } : undefined,
      req.usuario!.userId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Lista Candidatos, con filtro opcional por proceso_id, lista_id y estado' })
  @ApiResponse({ status: 200, description: 'Listado de candidatos', type: [CandidatoRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro malformado' })
  async listar(@Query() query: ListarCandidatosQuery): Promise<CandidatoRespuestaDto[]> {
    return this.candidatosService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un Candidato por id' })
  @ApiResponse({ status: 200, description: 'Candidato encontrado', type: CandidatoRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Candidato no encontrado' })
  async detalle(@Param('id', ParseUUIDPipe) id: string): Promise<CandidatoRespuestaDto> {
    return this.candidatosService.detalle(id);
  }

  /**
   * candidatos-listas-opciones-consulta, PR5 (design.md D8, "Contratos HTTP", tarea 14.4). Espeja
   * literalmente `ConfiguracionController.obtenerLogo()`: `nosniff` + CSP restrictiva en toda
   * respuesta, `404 ARCHIVO_NO_ENCONTRADO` si el `Candidato` no existe o no tiene foto almacenada
   * (nunca `undefined`/`500`, threat matrix "Clasificación de archivo activo").
   */
  @Get(':id/foto')
  @ApiProduces('image/png', 'image/jpeg')
  @ApiOperation({ summary: 'Descarga la foto de un Candidato' })
  @ApiResponse({ status: 200, description: 'Binario de la foto con el Content-Type persistido' })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Candidato no encontrado o sin foto almacenada' })
  async obtenerFoto(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: RespuestaConCabeceras,
  ): Promise<StreamableFile> {
    const foto = await this.candidatosService.obtenerFoto(id);

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });

    return new StreamableFile(foto.buffer, { type: foto.mime });
  }

  @Patch(':id')
  @ApiConsumes('multipart/form-data')
  @UseFilters(ArchivoTamanioExcedidoFilter)
  @UseInterceptors(
    FileInterceptor('foto', {
      fileFilter: filtroFoto,
      limits: { fileSize: TAMANIO_MAXIMO_FOTO_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Edita los datos de un Candidato (nunca su ProcesoElectoral); foto opcional' })
  @ApiResponse({ status: 200, description: 'Candidato actualizado', type: CandidatoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido, formato no permitido o excede 2 MB' })
  @ApiResponse({ status: 404, description: 'Candidato no encontrado' })
  @ApiResponse({ status: 409, description: 'Lista inexistente o incoherencia jerárquica' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarCandidatoDto,
    @UploadedFile() archivo: ArchivoMulter | undefined,
    @Req() req: RequestConUsuario,
  ): Promise<CandidatoRespuestaDto> {
    return this.candidatosService.actualizar(
      id,
      {
        nombres: dto.nombres,
        grado: dto.grado,
        aula: dto.aula,
        cargo: dto.cargo,
        lista_id: dto.lista_id,
      },
      archivo ? { buffer: archivo.buffer, mimetype: archivo.mimetype } : undefined,
      req.usuario!.userId,
    );
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Da de baja o reactiva un Candidato, permitido en cualquier estado de Proceso' })
  @ApiResponse({ status: 200, description: 'Estado actualizado', type: CandidatoRespuestaDto })
  @ApiResponse({ status: 400, description: 'estado fuera de {activo, baja}' })
  @ApiResponse({ status: 404, description: 'Candidato no encontrado' })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoDto,
    @Req() req: RequestConUsuario,
  ): Promise<CandidatoRespuestaDto> {
    return this.candidatosService.cambiarEstado(id, dto.estado, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un Candidato sin Voto dependiente' })
  @ApiResponse({ status: 204, description: 'Candidato eliminado' })
  @ApiResponse({ status: 409, description: 'Existe Voto dependiente' })
  @ApiResponse({ status: 404, description: 'Candidato no encontrado' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestConUsuario): Promise<void> {
    await this.candidatosService.eliminar(id, req.usuario!.userId);
  }
}
