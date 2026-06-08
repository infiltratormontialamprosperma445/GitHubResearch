// ── Refresh Worker ──────────────────────────────────────────────
// This file is the entry point for an Electron utilityProcess forked
// from main.ts via utilityProcess.fork(). It runs all database-heavy
// and network-bound intelligence work in a separate process so the
// main process stays responsive for IPC and window management.
//
// Communication happens through process.parentPort (message events).

import { AppDatabase } from "../services/database.js";
import { IntelligenceService } from "../services/intelligence.js";
import type { MainToWorkerMessage, WorkerToMainMessage } from "../../src/shared/workerProtocol.js";

// ── Globals ────────────────────────────────────────────────────

let db: AppDatabase;
let service: IntelligenceService;
let currentAbort: AbortController | null = null;
let isRefreshing = false;

// ── Bootstrap ──────────────────────────────────────────────────

async function init(): Promise<void> {
  try {
    db = await AppDatabase.open();
    service = new IntelligenceService(db);
    console.log("[worker] Database and IntelligenceService initialized.");
    post({ type: "WORKER_READY" });
    setTimeout(() => {
      try {
        const stats = db.runStartupMaintenance();
        post({ type: "WORKER_MAINTENANCE_DONE", stats });
      } catch (maintenanceError) {
        console.warn("[worker] Startup maintenance failed:", maintenanceError instanceof Error ? maintenanceError.message : String(maintenanceError));
      }
    }, 25);
  } catch (error) {
    console.error("[worker] Failed to initialize:", error instanceof Error ? error.message : String(error));
    // Send an error message so the main process knows initialization failed
    post({ type: "QUERY_ERROR", id: "__init__", error: error instanceof Error ? error.message : String(error) });
  }
}

// ── Message dispatch ───────────────────────────────────────────

function handleMessage(msg: MainToWorkerMessage): void {
  switch (msg.type) {
    case "REFRESH_START":
      handleRefreshStart(msg.payload.windows).catch((err) => {
        console.error("[worker] Refresh start error:", err);
      });
      break;
    case "REFRESH_CANCEL":
      handleRefreshCancel();
      break;
    case "QUERY":
      handleQuery(msg.id, msg.method, msg.args).catch((err) => {
        console.error("[worker] Query error:", err);
      });
      break;
    default:
      console.warn("[worker] Unknown message type:", (msg as any).type);
  }
}

// ── Refresh handling ───────────────────────────────────────────

async function handleRefreshStart(windows: string[]): Promise<void> {
  if (isRefreshing) {
    post({
      type: "REFRESH_ERROR",
      error: "Refresh already in progress, please wait."
    });
    return;
  }

  isRefreshing = true;
  currentAbort = new AbortController();
  const startTime = Date.now();

  try {
    const trendWindow = windows.length === 1
      ? (windows[0] as "daily" | "weekly" | "monthly" | "historical")
      : undefined;

    const result = await service.refresh(trendWindow, (progress) => {
      post({
        type: "REFRESH_PROGRESS",
        phase: progress.phase,
        done: progress.done,
        total: progress.total,
        label: progress.label,
        repoCount: progress.repoCount
      });
    }, currentAbort.signal);

    const durationMs = Date.now() - startTime;

    post({
      type: "REFRESH_DONE",
      stats: {
        total: result.discovered,
        newCount: result.enriched,
        durationMs,
        result
      }
    });
  } catch (error) {
    if (currentAbort?.signal.aborted) {
      post({ type: "REFRESH_CANCELLED" });
    } else {
      const message = error instanceof Error ? error.message : String(error);
      post({ type: "REFRESH_ERROR", error: message });
    }
  } finally {
    isRefreshing = false;
    currentAbort = null;
  }
}

function handleRefreshCancel(): void {
  if (currentAbort && !currentAbort.signal.aborted) {
    currentAbort.abort();
    console.log("[worker] Refresh cancellation requested.");
  }
}

// ── Query dispatch ─────────────────────────────────────────────

async function handleQuery(id: string, method: string, args: any[]): Promise<void> {
  try {
    let result: any;

    switch (method) {
      // ── Read queries ───────────────────────────────────────
      case "getDashboard":
        result = await service.getDashboard();
        break;
      case "listRepos":
        result = await service.listRepos(args[0]);
        break;
      case "getRepo":
        result = await service.getRepo(args[0]);
        break;
      case "getSettings":
        result = service.getSettings();
        break;
      case "getSources":
        result = await service.getSources();
        break;
      case "getLatestJob":
        result = await service.getLatestJob();
        break;
      case "getRateLimits":
        result = await service.getRateLimits();
        break;

      // ── Write mutations ────────────────────────────────────
      case "toggleCollection":
        result = await service.toggleCollection(args[0], args[1]);
        break;
      case "saveNote":
        result = await service.saveNote(args[0], args[1], args[2], args[3]);
        break;
      case "saveAlert":
        result = await service.saveAlert(args[0]);
        break;
      case "overrideClassification":
        result = await service.overrideClassification(args[0]);
        break;

      // ── Search & aggregation ───────────────────────────────
      case "searchRepos":
        result = await service.search(args[0], args[1], args[2]);
        break;
      case "getCategoryCounts":
        result = await service.getCategoryCounts(args[0]);
        break;

      // ── Export / backup / test ─────────────────────────────
      case "exportLearningMarkdown":
        result = await service.exportLearningMarkdown();
        break;
      case "backupData":
        result = await service.backupData();
        break;
      case "testConnection":
        result = await service.testConnection(args[0]);
        break;
      case "countRepos":
        result = db.countRepos();
        break;

      // ── Settings update (also handles login item on supported platforms) ─
      case "updateSettings": {
        result = service.updateSettings(args[0]);
        break;
      }

      default:
        throw new Error(`Unknown query method: ${method}`);
    }

    post({ type: "QUERY_RESULT", id, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ type: "QUERY_ERROR", id, error: message });
  }
}

// ── Helpers ────────────────────────────────────────────────────

function post(msg: WorkerToMainMessage): void {
  if (process.parentPort) {
    process.parentPort.postMessage(msg);
  }
}

// ── Wire up listeners and initialize ───────────────────────────

if (process.parentPort) {
  process.parentPort.on("message", (event: { data: MainToWorkerMessage }) => {
    handleMessage(event.data);
  });
}

init();
