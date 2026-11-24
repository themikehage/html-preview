# html-preview

Servidor autohospedado y **agent-first** para desplegar previews HTML estáticas. Un agente sube una página o una carpeta y recibe una URL al instante. Después puede actualizarla, volver a una versión anterior, compartirla o dejar que caduque.

Hace una sola cosa: **`deploy` de una carpeta → URL**. No compila, no ejecuta código en el servidor y no gestiona dominios propios.

> Estado: en diseño. Ver [docs/design.md](./docs/design.md) y el backlog en [steps.md](./steps.md).

## Cómo se usará

```bash
# Una página
curl -T index.html -H "Authorization: Bearer $KEY" https://previews.example.com/v1/previews/informe-q3

# Una carpeta (solo sube lo que ha cambiado)
npx html-preview deploy ./dist --name landing --ttl 48h
```

Desde un agente: servidor MCP en `/mcp` (`deploy_html`, `deploy_files`, `list_previews`, `rollback_preview`, `share_preview`…), `llms.txt`, OpenAPI y un `SKILL.md` listo para Claude Code.

## Autohospedaje

Un contenedor, un volumen (`/data`) y dos dominios que apuntan al mismo servicio: uno para la API y el panel, y otro para el contenido, que va aislado con `CSP: sandbox`. Habrá imagen Docker, `docker-compose.yml` y plantilla para Coolify (hito H8).

## Para agentes que trabajan en este repo

Lee [AGENTS.md](./AGENTS.md) antes de nada. El protocolo (rutinas `/START`, `/TRIAGE`, `/EXECUTE`, `/TEST`, `/SHIP`), las reglas y los planes están en inglés.

## Licencia

MIT
