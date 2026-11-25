// SPDX-License-Identifier: MIT

import { expect } from "bun:test";
import { zipSync } from "fflate";
import { type Api, useApi } from "./api";

export const PASSWORD = "correct horse";
export const makeDashboard = () => useApi({ ADMIN_PASSWORD: PASSWORD, MAX_VISIBILITY: "public" });
export const enc = (text: string) => new TextEncoder().encode(text);

export interface Session {
  api: Api;
  cookie: string;
  csrf: string;
  get(path: string): Promise<Response>;
  post(
    path: string,
    fields?: Record<string, string | string[]>,
    csrf?: string | null,
  ): Promise<Response>;
}

export function tokenOf(html: string): string {
  return /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? "";
}

export function form(fields: Record<string, string | string[]>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of [value].flat()) params.append(key, item);
  }
  return params.toString();
}

export async function signIn(api: Api, password = PASSWORD): Promise<Session | null> {
  const page = await api.call("GET", "/dashboard/login", { key: null });
  const login = await api.call("POST", "/dashboard/login", {
    key: null,
    body: form({ password, _csrf: tokenOf(await page.text()) }),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  });
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  if (login.status !== 303 || !cookie) return null;
  const headers = { cookie };
  const home = await api.call("GET", "/dashboard", { key: null, headers });
  const csrf = tokenOf(await home.text());
  const session: Session = {
    api,
    cookie,
    csrf,
    get: (path) => api.call("GET", path, { key: null, headers }),
    post: (path, fields = {}, token = csrf) =>
      api.call("POST", path, {
        key: null,
        headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
        body: form(token === null ? fields : { ...fields, _csrf: token }),
      }),
  };
  return session;
}

export async function signedIn(api: Api): Promise<Session> {
  const session = await signIn(api);
  if (!session) throw new Error("login failed");
  return session;
}

export async function deploy(api: Api, name: string, files: Record<string, string>, query = "") {
  const res = await api.call("PUT", `/v1/previews/${name}${query}`, {
    body: zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, enc(v)]))),
    headers: { "content-type": "application/zip" },
  });
  expect(res.status).toBeLessThan(300);
  return (await res.json()) as { url: string; deploymentId: string };
}
