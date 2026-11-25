// SPDX-License-Identifier: MIT

import { ApiClient } from "../client";
import { normalizeUrl, saveCredentials } from "../config";
import { UsageError } from "../errors";
import { type Ctx, emit } from "./context";

export async function login(ctx: Ctx): Promise<void> {
  const { rt, args } = ctx;
  const rawUrl = args.url ?? args.positionals[0] ?? rt.env.HTML_PREVIEW_URL;
  const key = args.key ?? args.positionals[1] ?? rt.env.HTML_PREVIEW_KEY;
  if (!rawUrl || !key) {
    throw new UsageError(
      "login needs the server URL and an API key",
      "Usage: html-preview login --url <url> --key <key>",
    );
  }
  const url = normalizeUrl(rawUrl);
  const client = new ApiClient({
    baseUrl: url,
    key,
    fetch: rt.fetch,
    sleep: rt.sleep,
    userAgent: `html-preview-cli/${ctx.version}`,
  });
  await client.listPreviews({ limit: 1 });
  const file = await saveCredentials(rt, { url, key });
  emit(ctx, { url, saved: file }, () => [`Logged in to ${url}`, `Credentials saved to ${file}`]);
}
