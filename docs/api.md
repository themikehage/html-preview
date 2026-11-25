# API

La API HTTP vive en `/v1` y se autentica con `Authorization: Bearer hp_…`. Cada servidor publica su propia referencia, siempre al día:

- `GET /openapi.json` — OpenAPI 3.1 generado de los mismos esquemas Zod que usan la CLI y MCP.
- `GET /llms.txt` — la misma referencia en texto, pensada para agentes.
- Instantáneas versionadas: [`openapi.snapshot.json`](./openapi.snapshot.json) y [`llms.snapshot.txt`](./llms.snapshot.txt).

## Lo esencial

```bash
# Una página
curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: text/html" \
  --data-binary @index.html "https://previews.example.com/v1/previews/informe-q3?ttl=48"

# Un zip o tar.gz (se extrae en memoria; una carpeta superior se elimina)
curl -X PUT -H "Authorization: Bearer $KEY" -H "Content-Type: application/zip" \
  --data-binary @site.zip https://previews.example.com/v1/previews/landing
```

Para carpetas grandes usa el despliegue en dos pasos (manifiesto → subir solo los blobs que faltan → finalizar) o la CLI, que lo hace por ti.

## Claves y alcances

`read` (GET), `deploy` (escrituras) y `admin` (claves, uso, copias; implica los demás). Las claves se gestionan con `/v1/keys` o desde el panel.

## Errores

Todos los errores tienen la forma `{"error":{"code","message","fix"}}`. `code` es estable (`UPPER_SNAKE`, nunca se renombra) y `fix` dice qué hacer. Los límites de tasa devuelven `429` con `Retry-After`.

## Administración

`POST /v1/admin/backup` (admin) escribe un snapshot de la base de datos; ver [self-hosting](./self-hosting.md#copias-de-seguridad-y-restauración).
