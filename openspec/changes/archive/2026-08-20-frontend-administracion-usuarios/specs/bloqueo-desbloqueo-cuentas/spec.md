# Delta for bloqueo-desbloqueo-cuentas

## ADDED Requirements

### Requirement: UI de listado de cuentas bloqueadas reservada al rol `comite`

El sistema MUST proveer una vista que consuma `GET /auth/usuarios/bloqueados` y liste únicamente
las cuentas con `estado === 'bloqueado'`, con los campos `id`, `nombres`, `dni`, `codigo` y
`bloqueado_hasta`. Esta vista MUST ser alcanzable solo por una sesión con `rol === 'comite'`,
porque el endpoint del backend está protegido con `@Roles('comite')` — ningún otro rol, incluidos
`administrador`/`director`, puede invocarlo.

(Nota de discrepancia contra el borrador original de `proposal.md`, ya corregida: el borrador
describía esta acción como un panel contextual dentro de la ficha de `Usuario` de
`administracion-usuarios-apoderados`, alcanzable por `administrador`/`director`. El backend real
(`AuthController.listarBloqueados`/`desbloquear`, `@Roles('comite')`) y
`administracion-usuarios-apoderados` ("Aislamiento de rol comite": comite rechazado en todo
`UsersModule`, incluida `GET /usuarios/:id`) hacen esa combinación imposible: el rol que puede
invocar estos endpoints, `comite`, no puede abrir la ficha de `Usuario` donde se había propuesto
anidarlas. Decisión confirmada por el usuario (2026-08-20): **pantalla propia "Cuentas
bloqueadas"**, con su propio item de menú visible sólo para `comite`, independiente de `/usuarios`
— no un panel dentro de la ficha. `sdd-design` fija la ruta y el nombre de archivo exactos.)

#### Scenario: Comité ve el listado de cuentas bloqueadas

- GIVEN una sesión con `rol = 'comite'` y al menos una cuenta con `estado = 'bloqueado'`
- WHEN accede a la vista de cuentas bloqueadas
- THEN la vista muestra esa cuenta con `id`, `nombres`, `dni`, `codigo` y `bloqueado_hasta`

#### Scenario: Un rol distinto de comité no puede alcanzar la vista

- GIVEN una sesión con `rol = 'administrador'`
- WHEN intenta acceder a la vista de cuentas bloqueadas
- THEN la UI no la ofrece como opción alcanzable (el backend rechazaría la llamada con 403 si se
  invocara igual)

### Requirement: Desbloqueo manual con confirmación explícita auditada

El sistema MUST proveer, dentro de la vista de cuentas bloqueadas, un botón de desbloqueo por cada
cuenta con `estado === 'bloqueado'`, que consume `POST /auth/usuarios/:id/desbloquear` solo tras
una confirmación explícita. El diálogo de confirmación MUST mencionar que la acción queda
registrada en auditoría, para que la UI no transmita la sensación de un botón silencioso
(ADR-0008).

#### Scenario: Desbloquear una cuenta pide confirmación con mención de auditoría

- GIVEN una sesión con `rol = 'comite'` viendo una cuenta bloqueada
- WHEN hace click en "Desbloquear"
- THEN se abre un diálogo de confirmación cuyo texto menciona explícitamente que la acción queda
  auditada
- AND solo tras confirmar se invoca `POST /auth/usuarios/:id/desbloquear`

#### Scenario: Cancelar el diálogo no desbloquea la cuenta

- GIVEN el diálogo de confirmación de desbloqueo abierto
- WHEN el usuario del comité lo cancela
- THEN no se invoca `POST /auth/usuarios/:id/desbloquear` y la cuenta sigue bloqueada en la vista

#### Scenario: Cuenta desbloqueada exitosamente desaparece del listado

- GIVEN una cuenta bloqueada y la confirmación de desbloqueo aceptada
- WHEN `POST /auth/usuarios/:id/desbloquear` responde exitosamente
- THEN la cuenta ya no aparece en el listado de cuentas bloqueadas tras refrescar la vista

### Requirement: Botón de desbloqueo visible solo cuando `estado === 'bloqueado'`

El sistema MUST mostrar el botón de desbloqueo únicamente para cuentas con
`estado === 'bloqueado'`. El sistema MUST NOT mostrar ese botón para cuentas con cualquier otro
`estado`, incluidas las que ya se recuperaron por expiración perezosa.

#### Scenario: Cuenta ya recuperada no ofrece botón de desbloqueo

- GIVEN una cuenta cuyo `estado` volvió a `'activo'` por expiración perezosa
- WHEN se renderiza el listado
- THEN esa cuenta ya no aparece en la vista de cuentas bloqueadas (el listado solo trae
  `estado = 'bloqueado'`)
