// SPDX-License-Identifier: MIT

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import pkg from "../package.json";
import { runCli } from "./cli";
import { defaultConfigDir } from "./config";
import type { Runtime } from "./runtime";

function openUrl(url: string): Promise<void> {
  const command =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
  return new Promise((resolve) => {
    const child = spawn(command, [url], { stdio: "ignore", detached: true });
    child.on("error", () => resolve());
    child.unref();
    child.on("spawn", () => resolve());
  });
}

const stop = new AbortController();
process.on("SIGINT", () => stop.abort());
process.on("SIGTERM", () => stop.abort());

const runtime: Runtime = {
  env: process.env,
  cwd: process.cwd(),
  configDir: defaultConfigDir(process.env, homedir()),
  fetch: (input, init) => fetch(input, init),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  out: (text) => void process.stdout.write(text),
  err: (text) => void process.stderr.write(text),
  openUrl,
  stopSignal: stop.signal,
};

process.exitCode = await runCli(process.argv.slice(2), runtime, pkg.version);
