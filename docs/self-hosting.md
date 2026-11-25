# Autohospedaje

html-preview es **un contenedor, un volumen y dos dominios** que apuntan al mismo servicio.

| Variable | Qué es |
|---|---|
| `APP_ORIGIN` | Origen de la API, MCP, panel y docs (`https://previews.example.com`). |
| `CONTENT_ORIGIN` | Origen del contenido no confiable (`https://p.example.com`). **Debe ser otro host**: en producción el servidor se niega a arrancar si coinciden. |
| `ADMIN_PASSWORD` | Activa el panel en `/dashboard`. Sin ella, el panel no existe (la API sigue funcionando). |
| `SIGNING_SECRET` | Clave HMAC (≥ 32 caracteres). Si no la defines se genera en `/data/signing-secret`. |

La lista completa de variables está en [`about.md`](../about.md#environment-variables).

## Docker Compose

```bash
git clone https://github.com/themikehage/html-preview && cd html-preview
cp deploy/.env.example deploy/.env   # o exporta las variables
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml logs html-preview | grep Bootstrap
```

La **clave de administrador** se imprime **una sola vez** en el primer arranque (`Bootstrap admin API key`). Guárdala: solo se almacena su hash.

Sin variables, el compose levanta una prueba local en `http://localhost:3000` (API) y `http://127.0.0.1:3000` (contenido). Para producción define `APP_ORIGIN` y `CONTENT_ORIGIN` y activa el proxy con TLS:

```bash
APP_HOST=previews.example.com CONTENT_HOST=p.example.com \
APP_ORIGIN=https://previews.example.com CONTENT_ORIGIN=https://p.example.com \
ADMIN_PASSWORD=... docker compose -f deploy/docker-compose.yml --profile proxy up -d
```

El perfil `proxy` arranca Caddy ([`deploy/Caddyfile.example`](../deploy/Caddyfile.example)), que obtiene los certificados de los dos hosts y reenvía ambos al mismo servicio. Si usas otro proxy, **pasa la cabecera `Host` sin cambiarla**: el servidor decide por ella qué origen atiende.

Detrás de un proxy, los intentos fallidos de canje de enlaces se limitan por `X-Forwarded-For` / `CF-Connecting-IP`; si tu proxy no los envía, todos comparten un único cubo.

## Coolify

1. Crea un recurso **Docker Compose** con [`deploy/coolify.yml`](../deploy/coolify.yml) (imagen `ghcr.io/themikehage/html-preview`).
2. En el campo **Domains** del servicio pon los dos dominios separados por coma, ambos al puerto 3000.
3. Define `CONTENT_ORIGIN` con el dominio de contenido. Coolify genera `ADMIN_PASSWORD` y `SIGNING_SECRET`.
4. Despliega y comprueba `https://<APP_ORIGIN>/healthz`.

## Copias de seguridad y restauración

`DATA_DIR` (`/data`) contiene `html-preview.sqlite` y `blobs/`.

**Copia:**

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_KEY" https://previews.example.com/v1/admin/backup
# {"name":"html-preview-20261125T130115854Z.sqlite","bytes":69632,"createdAt":"..."}
```

El snapshot (`VACUUM INTO`) es consistente y queda en `/data/backups/`. Después copia también `/data/blobs/` (los blobs son inmutables, así que copiarlos **después** del snapshot siempre da un conjunto completo). Las copias no se rotan solas: bórralas tú.

**Restauración:**

```bash
docker compose -f deploy/docker-compose.yml stop html-preview
# dentro del volumen: sustituye la base de datos y borra los ficheros WAL
cp backups/html-preview-<fecha>.sqlite html-preview.sqlite
rm -f html-preview.sqlite-wal html-preview.sqlite-shm
# restaura blobs/ si hace falta
docker compose -f deploy/docker-compose.yml start html-preview
```

Las claves API y los enlaces compartidos viven en la base de datos, así que vuelven con ella. Si cambias `SIGNING_SECRET`, los enlaces de capacidad y las sesiones del panel dejan de valer.

## Actualizar

`docker compose pull && docker compose up -d`. Las migraciones del esquema son automáticas y solo añaden (`PRAGMA user_version`); haz una copia antes de actualizar.
