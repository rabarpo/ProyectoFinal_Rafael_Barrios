import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { UsersService } from '../users/users.service';
import { UsuarioRespuestaDto } from '../users/dto/usuario-respuesta.dto';
import { ConfiguracionService } from './configuracion.service';
import { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import { ConfiguracionRespuestaDto } from './dto/configuracion-respuesta.dto';

interface RequestConUsuario {
  usuario?: SesionUsuario;
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
}
