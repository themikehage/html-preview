# html-preview

Servidor autohospedado y **agent-first** para desplegar previews HTML estáticas. Un agente sube una página o una carpeta y recibe una URL al instante. Después puede actualizarla, volver a una versión anterior, compartirla o dejar que caduque.

Hace una sola cosa: **`deploy` de una carpeta → URL**. No compila, no ejecuta código en el servidor y no gestiona dominios propios.

## Inicio rápido

```bash
git clone https://github.com/themikehage/html-preview && cd html-preview
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs html-preview | grep Bootstrap   # clave admin, se muestra una vez
```

Despliega con la CLI (Node ≥ 20) o con `curl`:

```bash
# Una página
curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: text/html" \
  --data-binary @index.html http://localhost:3000/v1/previews/informe-q3

# Una carpeta (solo sube lo que ha cambiado)
npx live-pages login --url http://localhost:3000 --key $KEY
npx live-pages deploy ./dist --name landing --ttl 48
```

La respuesta trae la URL pública del contenido. `npx live-pages share <nombre>` genera un enlace para previews `private`.

## Qué incluye

- **API `/v1`** con claves por alcance (`read`, `deploy`, `admin`), cuotas, límite de tasa y caducidad automática.
- **Agentes**: servidor MCP en `/mcp`, `/llms.txt`, `/openapi.json` y un `SKILL.md` para Claude Code. Ver [docs/agents.md](./docs/agents.md).
- **CLI** `live-pages` (sin dependencias): `deploy`, `watch`, `share`, `rollback`, `--json`.
- **Panel** en `/dashboard` (si defines `ADMIN_PASSWORD`): previews, despliegues, enlaces, claves y uso.
- **Aislamiento**: el contenido no confiable se sirve en otro origen, siempre con `CSP: sandbox`.

## Autohospedaje

Un contenedor, un volumen (`/data`) y dos dominios que apuntan al mismo servicio: uno para la API y el panel, y otro para el contenido. Guía con Docker Compose, Caddy, Coolify, copias de seguridad y restauración en [docs/self-hosting.md](./docs/self-hosting.md).

## Documentación

- [docs/self-hosting.md](./docs/self-hosting.md) · [docs/api.md](./docs/api.md) · [docs/agents.md](./docs/agents.md)
- [docs/design.md](./docs/design.md) — diseño del producto
- [SECURITY.md](./SECURITY.md) · [CONTRIBUTING.md](./CONTRIBUTING.md)

## Para agentes que trabajan en este repo

Lee [AGENTS.md](./AGENTS.md) antes de nada. El protocolo (rutinas `/START`, `/TRIAGE`, `/EXECUTE`, `/TEST`, `/SHIP`), las reglas y los planes están en inglés.

## Licencia

MIT
