# Usarlo desde agentes

Servidor MCP (HTTP sin estado) en `https://previews.example.com/mcp`, autenticado con la misma clave API. Herramientas: `deploy_html`, `deploy_files`, `list_previews`, `get_preview`, `update_preview`, `rollback_preview`, `delete_preview`, `share_preview`, `revoke_share`.

Crea una clave con alcance `deploy` + `read` para el agente (no le des `admin`).

## Claude Code

```bash
claude mcp add --transport http html-preview https://previews.example.com/mcp \
  --header "Authorization: Bearer $HTML_PREVIEW_KEY"
```

## Codex

En `~/.codex/config.toml`:

```toml
[mcp_servers.html-preview]
url = "https://previews.example.com/mcp"
bearer_token_env_var = "HTML_PREVIEW_KEY"
```

## Cursor

En `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "html-preview": {
      "url": "https://previews.example.com/mcp",
      "headers": { "Authorization": "Bearer ${env:HTML_PREVIEW_KEY}" }
    }
  }
}
```

## Skill para Claude Code

```bash
mkdir -p ~/.claude/skills/html-preview
curl -o ~/.claude/skills/html-preview/SKILL.md \
  https://raw.githubusercontent.com/themikehage/html-preview/main/skill/SKILL.md
```

## CLI

```bash
npx live-pages login --url https://previews.example.com --key $HTML_PREVIEW_KEY
npx live-pages deploy ./dist --name landing --ttl 48
```

Sin MCP, el agente puede leer `/llms.txt` y usar la API HTTP directamente.
