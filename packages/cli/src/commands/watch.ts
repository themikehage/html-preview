// SPDX-License-Identifier: MIT

import { watch as fsWatch } from "node:fs";
import { resolve } from "node:path";
import { deployOnce } from "../deploy";
import { ApiError, NetworkError, payloadOf } from "../errors";
import { deployLines, printJson } from "../output";
import { type Ctx, makeClient, requireArg } from "./context";
import { deployOptions } from "./deploy";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * Deploys once, then again after every burst of changes. Cycles never overlap: a change
 * during a deploy schedules exactly one more cycle. API and network failures are reported
 * and the watcher keeps going; usage errors (bad path, bad name) stop it.
 */
export async function watch(ctx: Ctx): Promise<void> {
  const { rt, args } = ctx;
  const target = requireArg(ctx, 0, "folder to watch", "watch <dir>");
  const client = await makeClient(ctx);
  const options = deployOptions(ctx, target);
  const debounceMs = args.debounce ?? DEFAULT_DEBOUNCE_MS;

  const cycle = async (): Promise<void> => {
    try {
      const result = await deployOnce(client, rt.cwd, options);
      if (args.json) printJson(rt, result);
      else for (const line of deployLines(result)) rt.out(`${line}\n`);
    } catch (error) {
      if (!(error instanceof ApiError || error instanceof NetworkError)) throw error;
      if (args.json) printJson(rt, payloadOf(error));
      else rt.err(`${error.message}\n`);
    }
  };

  await cycle();
  if (!args.json) rt.err(`Watching ${target} (Ctrl-C to stop)\n`);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let dirty = false;
  let failure: unknown;
  let wake: () => void = () => {};

  const run = async (): Promise<void> => {
    if (running) {
      dirty = true;
      return;
    }
    running = true;
    try {
      do {
        dirty = false;
        await cycle();
      } while (dirty);
    } catch (error) {
      failure = error;
      wake();
    } finally {
      running = false;
    }
  };

  const watcher = fsWatch(resolve(rt.cwd, target), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), debounceMs);
  });
  await new Promise<void>((done) => {
    wake = done;
    if (rt.stopSignal.aborted) done();
    rt.stopSignal.addEventListener("abort", () => done(), { once: true });
  });
  clearTimeout(timer);
  watcher.close();
  if (failure) throw failure;
}
