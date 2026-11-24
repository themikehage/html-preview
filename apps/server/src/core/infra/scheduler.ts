// SPDX-License-Identifier: MIT

export interface ScheduledTask {
  name: string;
  everyMs: number;
  run(): Promise<unknown>;
}

export interface Scheduler {
  stop(): void;
}

/**
 * Runs each task at its interval (and once right away), never overlapping a task
 * with itself. A failing run is logged and retried on the next tick.
 */
export function startScheduler(
  tasks: ScheduledTask[],
  log: (message: string, detail?: unknown) => void = console.error,
): Scheduler {
  const timers: ReturnType<typeof setInterval>[] = [];
  for (const task of tasks) {
    let running = false;
    const tick = async (): Promise<void> => {
      if (running) return;
      running = true;
      try {
        await task.run();
      } catch (error) {
        log(`scheduled task "${task.name}" failed`, error);
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(tick, task.everyMs));
    void tick();
  }
  return { stop: () => clearAll(timers) };
}

function clearAll(timers: ReturnType<typeof setInterval>[]): void {
  for (const timer of timers) clearInterval(timer);
}
