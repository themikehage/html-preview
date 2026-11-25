// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { useApi } from "./test-support/api";
import {
  PASSWORD,
  deploy,
  form,
  makeDashboard,
  signIn,
  signedIn,
  tokenOf,
} from "./test-support/dashboard";

const make = makeDashboard();

describe("dashboard access (H7-A1)", () => {
  test("serves its stylesheet and script as public assets", async () => {
    const api = make();
    const css = await api.call("GET", "/dashboard/assets/dashboard.css", { key: null });
    expect(css.headers.get("content-type")).toContain("text/css");
    expect(await css.text()).toContain("--canvas");
    const js = await api.call("GET", "/dashboard/assets/dashboard.js", { key: null });
    expect(js.headers.get("content-type")).toContain("javascript");
  });

  test("is disabled without ADMIN_PASSWORD while the API keeps working", async () => {
    const api = useApi()();
    expect((await api.call("GET", "/dashboard", { key: null })).status).toBe(404);
    expect((await api.call("GET", "/v1/previews")).status).toBe(200);
  });

  test("anonymous visitors are sent to the login page, which carries a strict CSP", async () => {
    const api = make();
    const res = await api.call("GET", "/dashboard", { key: null });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/dashboard/login");
    const login = await api.call("GET", "/dashboard/login", { key: null });
    expect(login.status).toBe(200);
    const csp = login.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src http://127.0.0.1:3000");
    expect(login.headers.get("referrer-policy")).toBe("same-origin");
    expect(await login.text()).toContain("<!DOCTYPE html>");
    expect((await api.call("GET", "/", { key: null })).status).toBe(302);
  });

  test("wrong password → 401; the session cookie is HttpOnly, SameSite=Strict and path-scoped", async () => {
    const api = make();
    expect(await signIn(api, "nope")).toBeNull();
    const page = await api.call("GET", "/dashboard/login", { key: null });
    const ok = await api.call("POST", "/dashboard/login", {
      key: null,
      body: form({ password: PASSWORD, _csrf: tokenOf(await page.text()) }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    const cookie = ok.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/dashboard");
    expect(cookie).not.toContain("Secure");
  });

  test("login needs a valid form token and is rate limited per client", async () => {
    const api = make();
    const forged = await api.call("POST", "/dashboard/login", {
      key: null,
      body: form({ password: PASSWORD, _csrf: "forged" }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(forged.status).toBe(401);
    let last = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await api.call("POST", "/dashboard/login", {
        key: null,
        body: form({ password: "bad", _csrf: "x" }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-forwarded-for": "5.5.5.5",
        },
      });
      last = res.status;
    }
    expect(last).toBe(429);
  });

  test("the cookie is Secure when APP_ORIGIN is https", async () => {
    const api = useApi({
      ADMIN_PASSWORD: PASSWORD,
      APP_ORIGIN: "https://app.example.com",
      CONTENT_ORIGIN: "https://content.example.com",
    })();
    const page = await api.call("GET", "/dashboard/login", { key: null, host: "app.example.com" });
    const ok = await api.call("POST", "/dashboard/login", {
      key: null,
      host: "app.example.com",
      body: form({ password: PASSWORD, _csrf: tokenOf(await page.text()) }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(ok.headers.get("set-cookie")).toContain("Secure");
  });

  test("changing ADMIN_PASSWORD invalidates existing sessions", async () => {
    const secret = "k".repeat(40);
    const first = useApi({ ADMIN_PASSWORD: "one", SIGNING_SECRET: secret })();
    const session = await signIn(first, "one");
    expect(session).not.toBeNull();
    const second = useApi({ ADMIN_PASSWORD: "two", SIGNING_SECRET: secret })();
    const res = await second.call("GET", "/dashboard", {
      key: null,
      headers: { cookie: session?.cookie ?? "" },
    });
    expect(res.status).toBe(303);
  });

  test("every POST needs the CSRF token and a same-origin Origin; sign out ends the session", async () => {
    const api = make();
    const s = await signedIn(api);
    expect((await s.post("/dashboard/keys", { label: "x", scopes: "read" }, null)).status).toBe(
      403,
    );
    expect((await s.post("/dashboard/keys", { label: "x", scopes: "read" }, "wrong")).status).toBe(
      403,
    );
    const crossSite = await api.call("POST", "/dashboard/logout", {
      key: null,
      headers: {
        cookie: s.cookie,
        origin: "http://evil.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form({ _csrf: s.csrf }),
    });
    expect(crossSite.status).toBe(403);
    const out = await s.post("/dashboard/logout");
    expect(out.status).toBe(303);
    expect(out.headers.get("set-cookie")).toContain("hp_session=;");
  });
});
