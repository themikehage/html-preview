// SPDX-License-Identifier: MIT

import { raw } from "hono/html";
import type { Child } from "hono/jsx";

export type NavKey = "previews" | "keys" | "usage";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "previews", href: "/dashboard", label: "Previews" },
  { key: "keys", href: "/dashboard/keys", label: "API keys" },
  { key: "usage", href: "/dashboard/usage", label: "Usage" },
];

interface LayoutProps {
  title: string;
  children?: Child;
  /** Present once signed in: enables the nav and the sign-out form. */
  csrf?: string;
  active?: NavKey;
}

export function Layout({ title, children, csrf, active }: LayoutProps) {
  return (
    <>
      {raw("<!DOCTYPE html>")}
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="color-scheme" content="light dark" />
          <title>{title} · html-preview</title>
          <link rel="stylesheet" href="/dashboard/assets/dashboard.css" />
          <script src="/dashboard/assets/dashboard.js" defer />
        </head>
        <body>
          <header class="topbar">
            <div class="topbar-inner">
              <a class="brand" href="/dashboard">
                html-preview
              </a>
              {csrf ? (
                <>
                  <nav class="nav" aria-label="Main">
                    {NAV.map((item) => (
                      <a href={item.href} aria-current={item.key === active ? "page" : undefined}>
                        {item.label}
                      </a>
                    ))}
                  </nav>
                  <form method="post" action="/dashboard/logout" class="signout">
                    <input type="hidden" name="_csrf" value={csrf} />
                    <button type="submit" class="btn btn-quiet">
                      Sign out
                    </button>
                  </form>
                </>
              ) : null}
            </div>
          </header>
          <main class="page">{children}</main>
        </body>
      </html>
    </>
  );
}
