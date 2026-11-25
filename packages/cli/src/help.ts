// SPDX-License-Identifier: MIT

export const HELP = `html-preview - deploy static HTML previews

Usage: html-preview <command> [options]

Commands:
  login --url <url> --key <key>   Verify and store credentials
  deploy <dir|file>               Deploy a folder or a single HTML file
  watch <dir>                     Re-deploy on every change
  list                            List previews (--query, --limit)
  info <name>                     Preview detail with its deployments
  open <name>                     Open a preview in the browser
  rollback <name> [--to <id>]     Point the preview at an earlier deployment
  share <name>                    Share link for a private preview (--expires <hours>,
                                  --label <text>, --list, --revoke <linkId>)
  rm <name>                       Delete a preview

Deploy options:
  --name <name>        Preview name (default: folder or file name)
  --ttl <hours>        Hours until expiry (0 = never)
  --visibility <v>     unlisted | private | public
  --entry <path>       Entry file (default: index.html)
  -m, --message <txt>  Deployment message
  --pinned             Keep the preview from expiring
  --spa / --no-spa     Serve the entry for unknown extensionless paths (single-page apps)

Global options:
  --json               Print exactly the API response (or error body) on stdout
  --url <url>          Server URL (env: HTML_PREVIEW_URL)
  --key <key>          API key (env: HTML_PREVIEW_KEY)
  -h, --help           Show this help
  -v, --version        Show the version

Files named .previewignore (.gitignore syntax) are honored. Dotfiles and node_modules
are never uploaded.

Exit codes: 0 ok, 1 usage error, 2 API error, 3 network error.
`;
