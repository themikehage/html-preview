// SPDX-License-Identifier: MIT

import { parseCli } from "./args";
import type { Ctx } from "./commands/context";
import { deploy } from "./commands/deploy";
import { login } from "./commands/login";
import { info, list, open, remove, rollback } from "./commands/manage";
import { watch } from "./commands/watch";
import { EXIT, UsageError, exitCodeOf, payloadOf } from "./errors";
import { HELP } from "./help";
import type { Runtime } from "./runtime";

const COMMANDS: Record<string, (ctx: Ctx) => Promise<void>> = {
  login,
  deploy,
  watch,
  list,
  ls: list,
  info,
  open,
  rollback,
  rm: remove,
  delete: remove,
};

function report(rt: Runtime, error: unknown, json: boolean): number {
  const payload = payloadOf(error);
  if (json) rt.out(`${JSON.stringify(payload)}\n`);
  else {
    rt.err(`error: ${payload.error.message}\n`);
    if (payload.error.fix) rt.err(`fix: ${payload.error.fix}\n`);
  }
  return exitCodeOf(error);
}

/** Runs one CLI invocation and returns its exit code. Never throws. */
export async function runCli(argv: string[], rt: Runtime, version: string): Promise<number> {
  const json = argv.includes("--json");
  try {
    const args = parseCli(argv);
    if (args.version) {
      rt.out(`${version}\n`);
      return EXIT.ok;
    }
    if (args.help || !args.command || args.command === "help") {
      rt.out(HELP);
      return args.command || args.help ? EXIT.ok : EXIT.usage;
    }
    const handler = COMMANDS[args.command];
    if (!handler) {
      throw new UsageError(`Unknown command "${args.command}"`, "Run html-preview --help");
    }
    await handler({ rt, args, version });
    return EXIT.ok;
  } catch (error) {
    return report(rt, error, json);
  }
}
