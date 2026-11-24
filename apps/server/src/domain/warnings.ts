// SPDX-License-Identifier: MIT

import type { DeployWarning, Deployment, WarningCode } from "@html-preview/shared";
import type { DomainDeps } from "../core/ports/deps";

export const LARGE_FILE_BYTES = 5 * 1_048_576;
const SCAN_FILE_LIMIT = 2 * 1_048_576;
const SCAN_TOTAL_LIMIT = 16 * 1_048_576;
const MAX_WARNINGS = 50;

type Kind = "html" | "js" | "css";
type Finding = { code: WarningCode; fix: string };

const LOCAL = "localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]";

const FIX = {
  root: "Build with relative asset URLs (Vite: base './'; webpack: publicPath ''), or use paths without a leading '/'",
  local:
    "Replace localhost URLs with relative paths or public https:// URLs; the preview runs elsewhere",
  mixed: "Load scripts, styles, images and media over https:// or use relative paths",
} as const;

const RULES: { kinds: Kind[]; pattern: RegExp; code: WarningCode; fix: string; pathOnly?: true }[] =
  [
    {
      kinds: ["js"],
      pattern:
        /(["'`])\/(?!\/)(?:[\w.~%-]+\/)*(?:[\w~%-]+\.[A-Za-z0-9]{1,8}|(?:assets|static|images?|img|css|js|fonts|api)\/)[^"'`\s<>]*\1/,
      code: "ROOT_RELATIVE_URL",
      fix: FIX.root,
      pathOnly: true,
    },
    {
      kinds: ["css"],
      pattern: /url\(\s*["']?\/(?!\/)|@import\s+(?:url\(\s*)?["']\/(?!\/)/i,
      code: "ROOT_RELATIVE_URL",
      fix: FIX.root,
      pathOnly: true,
    },
    {
      kinds: ["html", "js", "css"],
      pattern: new RegExp(`https?://(?:${LOCAL})(?::\\d+)?(?![\\w.-])`, "i"),
      code: "LOCALHOST_URL",
      fix: FIX.local,
    },
    {
      kinds: ["html"],
      pattern: new RegExp(
        `(?:<(?:script|img|iframe|source|video|audio|embed)\\b[^>]*?\\s(?:src|poster)|<link\\b[^>]*?\\shref)\\s*=\\s*["']?\\s*http://(?!${LOCAL})`,
        "i",
      ),
      code: "MIXED_CONTENT",
      fix: FIX.mixed,
    },
    {
      kinds: ["css"],
      pattern: new RegExp(
        `url\\(\\s*["']?http://(?!${LOCAL})|@import\\s+["']http://(?!${LOCAL})`,
        "i",
      ),
      code: "MIXED_CONTENT",
      fix: FIX.mixed,
    },
  ];

function kindOf(path: string): Kind | null {
  const ext = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "js";
  if (ext === "css") return "css";
  return null;
}

function scan(text: string, kind: Kind, pathMode: boolean): Finding[] {
  return RULES.filter(
    (rule) => rule.kinds.includes(kind) && (!rule.pathOnly || pathMode) && rule.pattern.test(text),
  ).map(({ code, fix }) => ({ code, fix }));
}

/** Non-blocking hints about things that will break once the preview is served. */
export async function analyzeDeployment(
  deps: DomainDeps,
  deployment: Deployment,
): Promise<DeployWarning[]> {
  const warnings: DeployWarning[] = [];
  const entry = deployment.files[deployment.entry];
  if (!entry?.contentType.startsWith("text/html")) {
    warnings.push({
      code: "NO_ENTRY_HTML",
      file: deployment.entry,
      fix: "Make the entry an .html file (default index.html) or pass entry=<page>.html",
    });
  }
  const cache = new Map<string, Finding[]>();
  let scanned = 0;
  for (const [path, file] of Object.entries(deployment.files).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    if (file.size > LARGE_FILE_BYTES) {
      warnings.push({
        code: "LARGE_FILE",
        file: path,
        fix: "Compress or resize it (images, video, bundles); files above 5 MB slow down previews",
      });
    }
    const kind = kindOf(path);
    if (!kind || file.size > SCAN_FILE_LIMIT || scanned + file.size > SCAN_TOTAL_LIMIT) continue;
    const cacheKey = `${kind}:${file.hash}`;
    let findings = cache.get(cacheKey);
    if (!findings) {
      const blob = await deps.blobs.open(file.hash);
      findings = blob ? scan(await blob.text(), kind, deps.contentMode === "path") : [];
      cache.set(cacheKey, findings);
      scanned += file.size;
    }
    for (const finding of findings) warnings.push({ ...finding, file: path });
  }
  return warnings.slice(0, MAX_WARNINGS);
}
