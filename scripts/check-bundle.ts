// SPDX-License-Identifier: MIT

const MAX_BYTES = 200 * 1024;
const file = Bun.file(new URL("../packages/cli/dist/index.js", import.meta.url).pathname);
const bytes = file.size;
const text = await file.text();

if (bytes > MAX_BYTES) {
  console.error(`CLI bundle is ${bytes} bytes, limit ${MAX_BYTES}`);
  process.exit(1);
}
if (!text.startsWith("#!/usr/bin/env node")) {
  console.error("CLI bundle is missing the node shebang");
  process.exit(1);
}
if (/from\s*["'](?:bun|bun:)/.test(text) || text.includes("Bun.")) {
  console.error("CLI bundle references Bun APIs; it must run on Node >= 20");
  process.exit(1);
}
console.log(`CLI bundle ok: ${bytes} bytes`);

const server = await Bun.file(new URL("../dist/index.js", import.meta.url).pathname).text();
if (!server.includes("--canvas")) {
  console.error(
    'Server bundle does not embed dashboard styles as text (import ... with { type: "text" })',
  );
  process.exit(1);
}
