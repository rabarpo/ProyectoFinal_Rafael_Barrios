import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarUsuarioDto } from './dto/actualizar-usuario.dto';
import { CambiarEstadoUsuarioDto } from './dto/cambiar-estado-usuario.dto';
import { CrearUsuarioDto } from './dto/crear-usuario.dto';
import { ListarUsuariosQuery } from './dto/listar-usuarios.query';
import { UsuarioRespuestaDto } from './dto/usuario-respuesta.dto';
import { UsersService } from './users.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-usuarios-apoderados, PR2 (design.md D1/D3, tareas 7.10/8.3/9.8). `@Roles(
 * 'administrador', 'director')` a nivel de clase (D3): un único guard cubre las cinco rutas de
 * `Usuario`, satisface el aislamiento de `comite` por construcción (spec "Aislamiento de rol
 * comite") y la equivalencia `administrador` ≡ `director` (spec "Permisos idénticos entre
 * administrador y director") sin repetir el decorador en cada handler. `ParseUUIDPipe` en `:id` —
 * mismo precedente que `bloqueo-desbloqueo-cuentas` (`AuthController.desbloquear()`): un id
 * malformado nunca escapa como `500`, siempre `400`.
 *
 * Sin `DELETE /usuarios/:id` en ninguna forma (design.md "Contratos HTTP"): la baja lógica vía
 * `PATCH :id/estado` es la única operación de "eliminación" de este módulo (D1).
 */
@ApiTags('usuarios')
@ApiCookieAuth()
@Controller('usuarios')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un Usuario para cualquiera de los cinco roles' })
  @ApiResponse({ status: 201, description: 'Usuario creado', type: UsuarioRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido (dni/correo)' })
  @ApiResponse({ status: 409, description: 'DNI/código/correo duplicado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearUsuarioDto,
    @Req() req: RequestConUsuario,
  ): Promise<UsuarioRespuestaDto> {
    return this.usersService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista usuarios, con filtro opcional por rol y estado' })
  @ApiResponse({ status: 200, description: 'Listado de usuarios', type: [UsuarioRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro rol/estado desconocido' })
  async listar(@Query() query: ListarUsuariosQuery): Promise<UsuarioRespuestaDto[]> {
    return this.usersService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un Usuario por id' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado', type: UsuarioRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<UsuarioRespuestaDto> {
    return this.usersService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza datos básicos de un Usuario (nunca el estado)' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado', type: UsuarioRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido (dni/correo)' })
  @ApiResponse({ status: 409, description: 'DNI/código/correo duplicado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarUsuarioDto,
    @Req() req: RequestConUsuario,
  ): Promise<UsuarioRespuestaDto> {
    return this.usersService.actualizar(id, dto, req.usuario!.userId);
  }

  /**
   * D1: cambio de estado como operación propia sobre el ESTADO DESTINO — `CambiarEstadoUsuarioDto`
   * solo acepta `activo`/`inactivo`; `bloqueado` (y cualquier otro valor) es `400
   * ESTADO_DESTINO_NO_PERMITIDO` dentro de `UsersService.cambiarEstado()`.
   */
  @Patch(':id/estado')
  @ApiOperation({
    summary: 'Cambia el estado activo/inactivo de un Usuario (nunca hacia/desde bloqueado)',
  })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  @ApiResponse({ status: 400, description: 'Estado destino no permitido' })
  @ApiResponse({ status: 409, description: 'Transición desde bloqueado no permitida' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoUsuarioDto,
    @Req() req: RequestConUsuario,
  ): Promise<{ id: string; estado: string }> {
    return this.usersService.cambiarEstado(id, dto.estado, req.usuario!.userId);
  }
}
