# ADR 0007: Despliegue en VPS en la nube con Docker Compose

## Estado

Aceptado

## Contexto

El PRD dejaba esta decisión como riesgo abierto explícito: "no se ha definido… la
infraestructura de despliegue (nube vs. servidor local de la institución); condiciona costos,
disponibilidad y el criterio de 1,000 votantes concurrentes". Las piezas a alojar
([ADR-0001]–[ADR-0003]): frontend estático, backend NestJS, worker, PostgreSQL y Redis. La
carga es puntual — jornadas electorales concretas — y el resto del año es mínima. Los votantes
acceden desde cualquier dispositivo con Internet, incluidas sus casas (padres de familia).

## Decisión

SEEI se despliega en un **VPS en la nube** (p. ej. DigitalOcean, Hetzner o AWS Lightsail,
referencia: 4 vCPU / 8 GB) con **Docker Compose** orquestando todas las piezas:

- Contenedores: backend NestJS, worker, PostgreSQL, Redis, y **Caddy o Nginx** como reverse
  proxy con HTTPS automático, sirviendo también el frontend estático.
- **Respaldos programados** de PostgreSQL (diarios; horarios durante la jornada electoral) **y
  del volumen de archivos** — fotos de candidatos, planes de trabajo y actas PDF viven en un
  volumen Docker dedicado del VPS —, ambos copiados fuera del VPS (object storage del
  proveedor). Las actas son el archivo histórico oficial ([ADR-0009]) y deben estar en el
  respaldo igual que la base.
- El VPS puede **redimensionarse antes de cada jornada** si una prueba de carga lo aconseja, y
  reducirse el resto del año.
- Firewall del proveedor exponiendo solo 80/443; administración por SSH con llave; la base de
  datos y Redis nunca expuestos a Internet.
- SMTP saliente por Google Workspace (ya disponible según el PRD), no por servidor de correo
  propio.

## Alternativas consideradas

- **Servidor local de la institución** — sin costo mensual y con los datos de menores bajo
  custodia física del colegio; no se eligió porque la jornada dependería de la electricidad y
  del enlace a Internet del local (los padres votan desde casa), sin redundancia de datacenter,
  y exigiría a la institución administrar sistema, TLS y respaldos con personal propio.
- **PaaS gestionado** (Railway/Render/Fly + Neon/Supabase + Upstash + Vercel) — cero
  administración de servidores y despliegue desde git; no se eligió por los costos variables
  repartidos en varios proveedores y los límites de plan que habría que vigilar justo el día del
  pico, frente al costo fijo y predecible del VPS.

## Consecuencias

- Disponibilidad respaldada por el datacenter del proveedor (energía y red redundantes) — el
  criterio de 1,000 votantes concurrentes depende del dimensionamiento del VPS y del software,
  no de la infraestructura física del colegio.
- Costo fijo y bajo (~10–40 US$/mes), con topología portable: la misma composición Docker corre
  en cualquier proveedor o incluso en un servidor local si la institución cambiara de política.
- Un solo servidor que administrar, con HTTPS automático (Caddy) y respaldos programados.
- **Costo real — operación propia:** a diferencia de un PaaS, el equipo asume administración del
  VPS: parches de seguridad del sistema operativo, monitoreo, rotación de respaldos y
  restauración probada. Sin esa disciplina, el punto único de fallo es el VPS mismo.
- **Costo real — datos de menores en un tercero:** fotos, DNI y correos residen en el proveedor
  cloud; el cumplimiento de la Ley de Protección de Datos Personales (riesgo ya señalado en el
  PRD) debe cubrirse por contrato/configuración (cifrado en reposo, región del datacenter) y
  declararse a las familias.
- Requiere una **prueba de carga** previa a la primera jornada real que valide el criterio de
  1,000 concurrentes con el tamaño de VPS elegido.
- Una caída a mitad de jornada se resuelve por **procedimiento operativo, no por redundancia**:
  la semántica de la restauración durante la votación (revotos, extensión de cierre, acta de
  incidencias) está definida en el [ADR-0013], y el ensayo de restauración debe cubrirla.
