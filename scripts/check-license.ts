// SPDX-License-Identifier: MIT

import { Glob } from "bun";

const HEADER = "// SPDX-License-Identifier: MIT";
const root = new URL("..", import.meta.url).pathname;
const missing: string[] = [];

for await (const file of new Glob("{apps,packages,scripts}/**/*.{ts,tsx}").scan({ cwd: root })) {
  if (file.includes("node_modules")) continue;
  const firstLine = (await Bun.file(`${root}${file}`).text()).split("\n", 1)[0];
  if (firstLine !== HEADER) missing.push(file);
}

if (missing.length > 0) {
  console.error(`Missing "${HEADER}" in:\n${missing.join("\n")}`);
  process.exit(1);
}
