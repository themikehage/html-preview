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

## Modo subdominio (opcional)

Por defecto (`CONTENT_MODE=path`) cada preview vive en `CONTENT_ORIGIN/<id>/` dentro de un sandbox opaco: sin `localStorage`, cookies ni IndexedDB, y las URLs absolutas (`/assets/app.js`) se reescriben solo en el HTML. Con `CONTENT_MODE=subdomain` cada preview tiene **su propio origen**, así que funcionan el almacenamiento, las URLs absolutas y las apps SPA con rutas reales.

| URL | Qué sirve |
|---|---|
| `<id>.p.example.com` | la preview (el `<id>` es el id en base32 minúsculas, 26 caracteres; la respuesta de deploy ya trae la URL) |
| `<nombre>.p.example.com` | solo previews `public` |
| `<id>--<deploy>.p.example.com` | un despliegue fijo |

Requisitos:

1. **DNS comodín**: `*.p.example.com` (y `p.example.com`) apuntando al servidor.
2. **TLS comodín** (un certificado por subdominio no escala):
   - Caddy: certificado `*.p.example.com` con el reto DNS de tu proveedor (`tls { dns <proveedor> … }`, requiere el módulo DNS), o `on_demand_tls` con un endpoint `ask` que valide el host.
   - Coolify/Traefik: configura un resolver ACME con **DNS challenge** (Cloudflare, etc.) y el dominio `*.p.example.com` en el servicio.
3. `APP_ORIGIN` no puede ser `CONTENT_ORIGIN` ni uno de sus subdominios (el servidor lo rechaza al arrancar).

En local: `CONTENT_ORIGIN=http://content.localhost:3000 CONTENT_MODE=subdomain` (los navegadores resuelven `*.localhost` a tu máquina).

Qué cambia en la seguridad: el CSP de las previews incluye `allow-same-origin`, pero cada una sigue en un origen distinto del de la API y del panel y de las demás. Las cookies de las previews no tienen `Domain`, así que son del host de cada preview; aun así, una preview puede escribir cookies del dominio padre (`.p.example.com`), que afectarían a las demás. Usa un dominio de contenido dedicado y, si es posible, inclúyelo en la [Public Suffix List](https://publicsuffix.org/). Las previews `private` reciben una cookie `HttpOnly` (`hp_cap`) tras canjear el enlace o el ticket, y el token desaparece de la URL.

**SPA.** Marca una preview con `--spa` (CLI), `spa=true` (API/MCP) o la casilla del panel: cualquier ruta sin extensión que no exista devuelve el `index` con 200. Las rutas de assets deben resolverse desde cualquier ruta (en modo ruta, usa URLs relativas con `<base>`; en modo subdominio, las absolutas funcionan).

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
