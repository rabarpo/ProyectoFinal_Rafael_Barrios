# Especificación: minimal-login

## Purpose

Define la pantalla de login mínima del frontend (código institucional/contraseña + "Continuar con Google") y el
guard de ruta básico que la protege, consumiendo exclusivamente los endpoints ya existentes de
`#4`/`#5`/`#6` (`/auth/login`, `/auth/google`, `/auth/whoami`, `/auth/logout`). Capacidad nueva,
sin UI propia de backend. Fuera de alcance: recuperación de contraseña, bloqueo/desbloqueo de
cuentas y cualquier UI de administración de usuarios — esos endpoints ya existen pero no tienen UI
en este change.

## Requirements

### Requirement: Formulario de login con código institucional y contraseña
El sistema MUST proveer un formulario con campos `codigo` (código institucional único de
`Usuario.codigo`) y contraseña que, al enviarse, invoca `POST /auth/login`. El sistema MUST NOT
aceptar correo electrónico como identificador de login — el backend solo resuelve por `codigo`
(`apps/backend/src/auth/dto/login.dto.ts`); aceptar correo queda diferido a un change posterior.
El sistema MUST redirigir al asistente de procesos electorales tras una respuesta 200.

#### Scenario: Login exitoso redirige al asistente
- GIVEN un usuario con credenciales válidas en el formulario de login
- WHEN se envía el formulario
- THEN se invoca `POST /auth/login` y, ante respuesta 200, el usuario es redirigido al asistente
  de procesos electorales

#### Scenario: Campos vacíos no disparan la petición
- GIVEN el formulario de login sin código institucional o sin contraseña completados
- WHEN el usuario intenta enviarlo
- THEN el sistema MUST NOT invocar `POST /auth/login` y muestra una validación de campo requerido

### Requirement: Botón "Continuar con Google"
El sistema MUST proveer un botón "Continuar con Google" que, al completarse el flujo OAuth del
proveedor, invoca `POST /auth/google` con el token obtenido. El sistema MUST redirigir al
asistente de procesos electorales tras una respuesta 200.

#### Scenario: Login con Google exitoso redirige al asistente
- GIVEN un usuario que completa el flujo OAuth de Google con una cuenta institucional permitida
- WHEN el frontend invoca `POST /auth/google` con el ID token resultante
- THEN ante respuesta 200 el usuario es redirigido al asistente de procesos electorales

#### Scenario: Vinculación requerida (409) no autentica ni redirige
- GIVEN un usuario que completa el flujo OAuth de Google sobre una cuenta que ya tiene contraseña
  y aún no está vinculada
- WHEN el frontend invoca `POST /auth/google` y recibe 409 (`VINCULACION_REQUERIDA`)
- THEN el sistema MUST NOT redirigir al asistente y MUST mostrar una vía para reenviar la
  solicitud confirmando la contraseña actual

### Requirement: Manejo uniforme de credenciales inválidas o cuenta bloqueada
El sistema MUST tratar toda respuesta 401 de `POST /auth/login` o `POST /auth/google` (que el
backend emite de forma indistinguible tanto para credenciales incorrectas como para bloqueo
vigente, ver `auth.service.ts`) mostrando el mismo mensaje de error genérico expuesto por el
backend, sin intentar diferenciar la causa ni exponer información adicional sobre el estado de la
cuenta.

#### Scenario: 401 en login por contraseña muestra error genérico
- GIVEN credenciales incorrectas o una cuenta bloqueada
- WHEN se envía el formulario de login y `POST /auth/login` responde 401
- THEN el formulario permanece visible y muestra el mensaje de error devuelto por el backend, sin
  revelar si la causa fue contraseña incorrecta o bloqueo

#### Scenario: 401 en login con Google muestra error genérico
- GIVEN un token de Google válido pero rechazado por el backend (dominio no permitido, cuenta
  bloqueada, etc.)
- WHEN `POST /auth/google` responde 401
- THEN la pantalla de login muestra el mismo mensaje de error genérico sin diferenciar la causa

### Requirement: Guard de ruta según sesión activa
El sistema MUST verificar la sesión activa vía `GET /auth/whoami` antes de renderizar el asistente
de procesos electorales. Si `GET /auth/whoami` responde 401, el sistema MUST redirigir a la
pantalla de login. Si responde 200, el sistema MUST permitir el acceso al asistente.

#### Scenario: Sin sesión activa redirige a login
- GIVEN un visitante sin cookie de sesión válida
- WHEN intenta acceder a la ruta del asistente de procesos electorales
- THEN `GET /auth/whoami` responde 401 y el sistema redirige a la pantalla de login

#### Scenario: Con sesión activa permite acceso al asistente
- GIVEN un visitante con cookie de sesión válida
- WHEN intenta acceder a la ruta del asistente de procesos electorales
- THEN `GET /auth/whoami` responde 200 y el sistema permite el acceso sin redirigir

### Requirement: Logout accesible desde la UI
El sistema MUST exponer al menos un punto de la interfaz (visible mientras hay sesión activa) que
invoque `POST /auth/logout` y, tras la respuesta, redirija a la pantalla de login.

#### Scenario: Logout limpia sesión y redirige a login
- GIVEN un usuario con sesión activa dentro del asistente
- WHEN activa la opción de logout
- THEN se invoca `POST /auth/logout` y, tras la respuesta, el usuario es redirigido a la pantalla
  de login

### Requirement: Fuera de alcance — recuperación, bloqueo y administración de usuarios
El sistema MUST NOT incluir en esta capacidad ninguna UI de recuperación de contraseña
(`/auth/recovery`, `/auth/recovery/confirm`), ni de bloqueo/desbloqueo de cuentas
(`/auth/usuarios/bloqueados`, `/auth/usuarios/:id/desbloquear`), ni ninguna pantalla de
administración de usuarios. Estos endpoints ya existen en el backend (`#5`/`#6`) pero su UI queda
diferida a un change posterior.

#### Scenario: Ausencia de UI de recuperación y bloqueo
- GIVEN la pantalla de login mínima entregada por este change
- WHEN se audita la superficie de UI incluida
- THEN no existe ningún formulario, enlace o pantalla que invoque `/auth/recovery`,
  `/auth/recovery/confirm`, `/auth/usuarios/bloqueados` o `/auth/usuarios/:id/desbloquear`
