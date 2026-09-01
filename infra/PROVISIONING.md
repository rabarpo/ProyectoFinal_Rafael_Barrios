# Aprovisionamiento del VPS — SEEI

Runbook para llevar SEEI a producción desde cero, según ADR-0007 y `DEPLOY-PLAN.md`.
Cada bloque marcado con **[AUTORIZAR]** es una acción que el skill deploy-pass no ejecuta sin
tu visto bueno explícito en ese momento.

Referencia de la topología: `infra/docker/docker-compose.yml` + `infra/docker/docker-compose.prod.yml`.
Caddy es el único servicio que publica puertos (80/443). Postgres y Redis quedan solo en la red
interna del compose.

---

## 0. Decisiones previas

| Decisión | Opciones | Nota |
|---|---|---|
| Proveedor | Hetzner CPX32 (~14 €/mes, UE/EEUU) · AWS Lightsail 4 vCPU/8 GB `sa-east-1` São Paulo (~40 US$/mes) | Lightsail São Paulo si la revisión legal de datos de menores (backlog #21) exige región sudamericana o cifrado/contratos concretos. Si no hay restricción dura → Hetzner por costo. |
| Dominio | registrar `seei.<colegio>.edu.pe` (o similar) | Se necesita ANTES del primer deploy para el certificado Let's Encrypt. |
| Bucket de respaldos | Hetzner Storage Box · Backblaze B2 · S3 | Cualquiera que `rclone` soporte. |

---

## 1. Crear el VPS  **[AUTORIZAR]**

- Imagen: Ubuntu 24.04 LTS.
- Tamaño: 4 vCPU / 8 GB / 80 GB SSD (referencia ADR-0007).
- Región: la decidida en el paso 0.
- Añadir tu clave SSH pública al crear la instancia (acceso inicial como `root`).
- **Firewall del proveedor** (Hetzner Cloud Firewall / Lightsail networking):
  - Entrante: `22/tcp` **solo desde tu IP de administración**, `80/tcp` y `443/tcp` desde cualquier origen, `443/udp` (HTTP/3).
  - Todo lo demás: denegado.

Anotá la **IP pública**.

---

## 2. DNS  **[AUTORIZAR]**

- Registrar el dominio.
- Crear un registro **A**: `seei.<colegio>.edu.pe` → IP pública del VPS.
- (Opcional) registro **AAAA** si el VPS tiene IPv6.
- Verificar: `dig +short seei.<colegio>.edu.pe` devuelve la IP. Esperar la propagación antes del deploy.

---

## 3. Endurecimiento base del sistema  **[AUTORIZAR]**

Como `root` por SSH:

```bash
apt update && apt full-upgrade -y
apt install -y ca-certificates curl git jq rclone ufw fail2ban unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades      # activar actualizaciones de seguridad automáticas

# Usuario de deploy sin privilegios (lo usa el workflow de GitHub y las operaciones manuales)
adduser --disabled-password --gecos "" deploy
mkdir -p /home/deploy/.ssh && chmod 700 /home/deploy/.ssh
# Pegar la clave PÚBLICA de deploy (la privada va como secret SSH_PRIVATE_KEY en GitHub):
nano /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys && chown -R deploy:deploy /home/deploy/.ssh

# SSH: sin login de root, sin password
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

# ufw como segunda capa (además del firewall del proveedor)
ufw default deny incoming && ufw default allow outgoing
ufw allow from <TU_IP_ADMIN> to any port 22 proto tcp
ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp
ufw enable
```

---

## 4. Docker  **[AUTORIZAR]**

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
systemctl enable --now docker
```

Verificar: `sudo -u deploy docker run --rm hello-world`.

---

## 5. Clonar el repo y configurar `/opt/seei`  **[AUTORIZAR]**

```bash
mkdir -p /opt/seei && chown deploy:deploy /opt/seei
sudo -u deploy git clone <URL_DEL_REPO> /opt/seei
cd /opt/seei
sudo -u deploy git checkout <TAG_A_DESPLEGAR>

mkdir -p /opt/seei/backups && chown deploy:deploy /opt/seei/backups
```

### 5.1 Archivo de entorno  **[AUTORIZAR — genera secretos reales]**

```bash
cp infra/docker/env.prod.example /opt/seei/.env
chmod 600 /opt/seei/.env && chown root:root /opt/seei/.env

# Generar contraseñas:
openssl rand -base64 32   # POSTGRES_PASSWORD
openssl rand -base64 32   # SEEI_MIGRATOR_PASSWORD
openssl rand -base64 32   # SEEI_APP_PASSWORD
```

Editar `/opt/seei/.env` y completar:
- Las 3 contraseñas de Postgres y reflejarlas en `DATABASE_URL` / `MIGRATION_DATABASE_URL`.
- `GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAINS` (dominio institucional real).
- `SMTP_USER`, `SMTP_PASSWORD` (app password de Google Workspace).
- `APP_BASE_URL=https://seei.<colegio>.edu.pe`.

> El backend necesita también host/puerto/remitente SMTP: esos se cargan por la **UI de
> configuración institucional** (tabla `Configuracion`), no por `.env`. La contraseña SMTP nunca
> va en esa tabla.

### 5.2 Caddyfile de producción  **[AUTORIZAR]**

Editar `infra/docker/Caddyfile.prod`: reemplazar `seei.ejemplo.edu.pe` por el dominio real y
`admin@ejemplo.edu.pe` por un correo monitoreado. (Idealmente en un commit del repo, para que
quede versionado y el deploy lo tome del tag.)

### 5.3 rclone para respaldos offsite  **[AUTORIZAR]**

```bash
rclone config --config /opt/seei/rclone.conf     # crear un remote llamado "seei-backups"
chmod 600 /opt/seei/rclone.conf && chown root:root /opt/seei/rclone.conf
rclone --config /opt/seei/rclone.conf lsd seei-backups:   # probar acceso
```

Ajustar `SEEI_RCLONE_REMOTE` en `infra/scripts/backup.sh` si el bucket/prefijo difiere del default
`seei-backups:seei/postgres`.

---

## 6. Primer deploy  **[AUTORIZAR]**

```bash
cd /opt/seei
sudo -u deploy infra/scripts/deploy.sh <TAG_A_DESPLEGAR>
```

`deploy.sh` corre: chequeo de jornada (no hay procesos aún → pasa), backup previo (bucket vacío,
pero el dump local debe generarse), `build`, `up -d --wait` (el servicio `migrate` aplica las 20
migraciones), y `smoke.sh`.

Si el smoke test de TLS falla porque el certificado todavía es el interno: verificar que el
registro A resuelve y que 80/443 están abiertos, y volver a correr `docker compose ... up -d caddy`.

---

## 7. Crons de respaldo  **[AUTORIZAR]**

```bash
crontab -u root /opt/seei/infra/scripts/seei-cron
crontab -u root -l          # verificar
# Forzar un respaldo de prueba y confirmar que llega al bucket:
/opt/seei/infra/scripts/backup.sh && rclone --config /opt/seei/rclone.conf ls seei-backups:seei/postgres
```

---

## 8. Monitoreo externo de uptime  **[AUTORIZAR]**

Alta en UptimeRobot / BetterStack (plan gratuito):
- Monitor HTTP(S) sobre `https://seei.<colegio>.edu.pe/api/health` cada 1–5 min.
- Palabra clave esperada en el body: `"estado":"ok"` (así una respuesta `degradado` con HTTP 200
  también dispara alerta).
- Alertas por correo a la lista del comité.

---

## 9. Configurar el gate de deploy en GitHub  **[AUTORIZAR]**

`Settings → Environments → New environment: production`
- **Required reviewers**: las personas que pueden autorizar un release.
- Secrets del environment: `SSH_HOST`, `SSH_USER` (`deploy`), `SSH_PRIVATE_KEY`,
  `SSH_KNOWN_HOSTS` (`ssh-keyscan <host>`).

A partir de acá, un release se dispara desde `Actions → Deploy → Run workflow` con el tag, y queda
pausado hasta la aprobación de un revisor.

---

## 10. Prerequisitos antes de la PRIMERA elección real  (no bloquean este aprovisionamiento)

- [ ] Ensayo de restauración completo con `restore.sh` + procedimiento de contingencia ADR-0013 (backlog #23).
- [ ] Prueba de carga de 1.000 votantes concurrentes contra este tamaño de VPS (backlog #23) — definir k6/artillery y el escenario (ráfaga de `POST /votos` + polling del panel).
- [ ] Revisión legal: región del datacenter, cifrado en reposo, consentimiento de las familias (backlog #21).
- [ ] Entorno de staging (segundo VPS chico o proyecto compose `seei-staging`) para correr los dos ensayos anteriores sin tocar producción.
