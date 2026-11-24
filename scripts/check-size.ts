// SPDX-License-Identifier: MIT

import { Glob } from "bun";

const MAX_LINES = 300;
const root = new URL("..", import.meta.url).pathname;
const offenders: string[] = [];

for await (const file of new Glob("{apps,packages,scripts}/**/*.{ts,tsx}").scan({ cwd: root })) {
  if (file.includes("node_modules")) continue;
  const lines = (await Bun.file(`${root}${file}`).text()).split("\n").length;
  if (lines > MAX_LINES) offenders.push(`${file}: ${lines} lines`);
}

if (offenders.length > 0) {
  console.error(`Files over ${MAX_LINES} lines:\n${offenders.join("\n")}`);
  process.exit(1);
}
