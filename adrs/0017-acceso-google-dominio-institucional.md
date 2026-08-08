# ADR 0017: Acceso por Google restringido al dominio institucional

## Estado

Aceptado

## Contexto

El backlog #5 agrega un segundo mecanismo de login: verificación de un ID token de Google. A
diferencia de #4 (login/logout por contraseña), que solo eligió una librería de hashing sin
ninguna decisión de acceso, este change introduce una **política de acceso** con riesgo residual
propio — un dominio mal configurado en la lista permitida abre el sistema a cualquier cuenta de
Google, no solo a las institucionales — y obligaciones para changes futuros (#7/#9 deben
pre-cargar usuarios antes de que puedan usar este login; #10 debe migrar la variable de entorno a
`Configuracion`). Es el mismo criterio con el que #3 produjo ADR-0016 en vez de enmendar
ADR-0010: un mecanismo con alternativas y consecuencias propias merece su propio registro
versionado.

## Decisión

1. **Verificación manual del ID token con `google-auth-library`, no `passport-google-oauth20`.**
   `GoogleOauthService` recibe un `OAuth2Client` inyectado y llama `verifyIdToken({ idToken,
   audience: GOOGLE_CLIENT_ID })` directamente, sin la capa de estrategia/sesión de Passport que
   este proyecto ya descartó para credenciales locales.
2. **Restricción por el claim `hd` contra una lista de dominios permitidos.** El token solo se
   acepta si `payload.hd` está presente y coincide con alguno de los dominios en
   `GOOGLE_HOSTED_DOMAINS` (lista separada por comas, normalizada con `trim().toLowerCase()`).
   Un `hd` ausente (cuenta personal `@gmail.com`) se rechaza siempre.
3. **Sin auto-provisión de cuentas.** Un login OAuth con correo verificado que no corresponde a
   ningún `Usuario` existente se rechaza; el sistema nunca crea un `Usuario` a partir de este
   flujo.
4. **Vincular `google_id` a una cuenta con contraseña exige confirmarla.** Si el `Usuario` ya
   tiene `password_hash` y aún no tiene `google_id`, el primer login OAuth exitoso no completa la
   vinculación por sí solo — exige la contraseña actual en la misma petición.
5. **La lista de dominios vive en variable de entorno (`GOOGLE_HOSTED_DOMAINS`) hasta que el
   backlog #10 la persista en `Configuracion`.** No hay UI de administración de dominios en este
   change.

## Alternativas consideradas

- **No crear ADR** — precedente de #4, que descartó Passport para credenciales sin abrir un
  registro propio; no se eligió porque #4 solo eligió una librería y ninguna decisión de acceso,
  mientras que este change fija una política de acceso con riesgo residual propio.
- **Enmendar TECH-DESIGN.md** — más liviano que un ADR nuevo; no se eligió por el mismo motivo que
  descartó enmendar un ADR existente en el precedente de ADR-0016: un mecanismo con alternativas y
  consecuencias propias merece su propio registro versionado, no una nota dentro de un documento
  de alcance más amplio.
- **`passport-google-oauth20`** — reduce código propio de intercambio OAuth; no se eligió porque
  agrega una capa de estrategia y sesión que este proyecto no usa en ningún otro login (ADR-0004
  ya fija sesión en servidor con cookie propia) y porque la verificación manual del ID token es
  suficiente y más fácil de testear sin red (`OAuth2Client` sustituible en tests).
- **Exigir que el dominio de `email` coincida con `hd`** — señal de tenancy redundante; no se
  eligió porque rompe dominios secundarios legítimos del mismo tenant de Google Workspace, y la
  búsqueda posterior por `Usuario.correo` exacto ya es una restricción más fuerte.
- **Aceptar `hd` ausente** — simplifica el chequeo; no se eligió porque abriría el login a
  cualquier cuenta personal de Google, no solo a las del dominio institucional.

## Consecuencias

- El correo por sí solo deja de ser la única señal de identidad en el login OAuth: `hd` es la
  única señal de tenancy que Google firma, y el correo es falsificable en cuentas de consumidor si
  se usara sin esa validación.
- Ningún `Usuario` se crea desde este flujo — la carga de usuarios sigue siendo responsabilidad
  exclusiva de administración (#7/#9), coherente con la ausencia de auto-registro público del
  sistema.
- **Costo real:** `GOOGLE_HOSTED_DOMAINS` mal configurada (vacía, con typo, o con un dominio
  público) es un error de configuración con alcance amplio — abre o cierra el login OAuth para
  todo el dominio institucional a la vez. Se mitiga fallando en cerrado: `GOOGLE_CLIENT_ID` o
  `GOOGLE_HOSTED_DOMAINS` ausentes o vacíos rechazan todo login OAuth en tiempo de request, nunca
  una excepción en el arranque del proceso.
- **Costo real:** la variable de entorno no es auditable ni editable en caliente hasta que #10
  migre la lista de dominios a `Configuracion`; cambiarla hoy requiere un despliegue.
- Vincular una cuenta con contraseña exige confirmarla una sola vez; una cuenta sin contraseña
  previa (TOFU, alta administrativa reciente) se vincula en el primer uso sin fricción adicional,
  porque exigir primero una recuperación de contraseña no agrega seguridad — el correo de
  recuperación llega al mismo buzón que el ID token ya demostró controlar.
