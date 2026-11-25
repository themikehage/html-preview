// SPDX-License-Identifier: MIT

/** A small subset of .gitignore: comments, `!`, `/` anchors, `dir/`, `*`, `?`, `**`, `[a-z]`. */
export interface IgnoreRule {
  negate: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

function escapeChar(char: string): string {
  return /[.+^${}()|\\]/.test(char) ? `\\${char}` : char;
}

function globToSource(glob: string): string {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i] as string;
    if (char === "*" && glob[i + 1] === "*") {
      const slash = glob[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "[" && glob.indexOf("]", i + 2) > i) {
      const end = glob.indexOf("]", i + 2);
      source += glob.slice(i, end + 1).replace(/^\[!/, "[^");
      i = end;
    } else source += escapeChar(char);
  }
  return source;
}

export function parseIgnore(text: string): IgnoreRule[] {
  const rules: IgnoreRule[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/(?<!\\)\s+$/, "");
    if (line === "" || line.startsWith("#")) continue;
    const negate = line.startsWith("!");
    if (negate) line = line.slice(1);
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes("/");
    if (line.startsWith("/")) line = line.slice(1);
    if (line === "") continue;
    const body = globToSource(line);
    rules.push({ negate, dirOnly, regex: new RegExp(anchored ? `^${body}$` : `(?:^|/)${body}$`) });
  }
  return rules;
}

/** `path` is relative to the deploy root, with `/` separators. The last matching rule wins. */
export function isIgnored(rules: IgnoreRule[], path: string, isDir: boolean): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) continue;
    if (rule.regex.test(path)) ignored = !rule.negate;
  }
  return ignored;
}
