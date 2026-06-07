// ── Worker Protocol ────────────────────────────────────────────
// Message types for main process ↔ worker (utilityProcess) communication.
// The main process forks a utilityProcess that runs refreshWorker.ts.
// All heavy DB work and network-bound refresh tasks execute in the worker,
// keeping the main process responsive for IPC and window management.

/**
 * Messages sent FROM the main process TO the worker.
 */
export type MainToWorkerMessage =
  | { type: "REFRESH_START"; payload: { windows: string[] } }
  | { type: "REFRESH_CANCEL" }
  | { type: "QUERY"; id: string; method: string; args: any[] };

/**
 * Messages sent FROM the worker TO the main process.
 */
export type WorkerToMainMessage =
  | { type: "REFRESH_PROGRESS"; phase: string; done: number; total: number; label: string; repoCount: number }
  | { type: "REFRESH_DONE"; stats: { total: number; newCount: number; durationMs: number; result: any } }
  | { type: "REFRESH_ERROR"; error: string }
  | { type: "REFRESH_CANCELLED" }
  | { type: "QUERY_RESULT"; id: string; result: any }
  | { type: "QUERY_ERROR"; id: string; error: string };

/**
 * Shape of the progress callback forwarded through IntelligenceService.refresh().
 */
export interface RefreshProgressPayload {
  phase: string;
  done: number;
  total: number;
  label: string;
  repoCount: number;
}
