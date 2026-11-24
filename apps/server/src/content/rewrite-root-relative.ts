// SPDX-License-Identifier: MIT

const ATTRIBUTES = ["src", "href", "action", "poster"] as const;

function rewrite(value: string | null, prefix: string): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  if (value === prefix || value.startsWith(`${prefix}/`)) return null;
  return `${prefix}${value}`;
}

export function rewriteRootRelative(response: Response, prefix: string): Response {
  return new HTMLRewriter()
    .on("[src],[href],[action],[poster]", {
      element(element) {
        for (const attribute of ATTRIBUTES) {
          const rewritten = rewrite(element.getAttribute(attribute), prefix);
          if (rewritten) element.setAttribute(attribute, rewritten);
        }
      },
    })
    .transform(response);
}
