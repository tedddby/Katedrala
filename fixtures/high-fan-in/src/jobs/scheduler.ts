import { createLogger } from "../core/logger";

const log = createLogger("jobs.scheduler");

export interface ScheduledJob {
  readonly name: string;
  readonly intervalMs: number;
  run(): Promise<void>;
}

export interface SchedulerHandle {
  stop(): void;
}

export function startScheduler(jobs: readonly ScheduledJob[]): SchedulerHandle {
  const running = new Set<string>();
  const timers = jobs.map((job) =>
    setInterval(() => {
      if (running.has(job.name)) {
        log.warn("previous run still in progress, skipping", { job: job.name });
        return;
      }
      running.add(job.name);
      const started = Date.now();
      job
        .run()
        .then(() => log.info("job finished", { job: job.name, ms: Date.now() - started }))
        .catch((error: unknown) => log.error("job failed", error, { job: job.name }))
        .finally(() => running.delete(job.name));
    }, job.intervalMs),
  );
  log.info("scheduler started", { jobs: jobs.map((job) => job.name) });

  return {
    stop() {
      for (const timer of timers) clearInterval(timer);
      log.info("scheduler stopped");
    },
  };
}
