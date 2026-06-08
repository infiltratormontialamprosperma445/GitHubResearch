import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron";
import type { IpcMainInvokeEvent, UtilityProcess } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClassificationOverrideInput,
  RepoFilters,
  RepoStatus,
  Settings,
  TrendWindow,
  SearchFilters,
  SortOption,
  SourceHealth,
  RefreshProgress
} from "../src/shared/types.js";
import type { MainToWorkerMessage, WorkerToMainMessage } from "../src/shared/workerProtocol.js";
import { AppDatabase } from "./services/database.js";
import { IntelligenceService } from "./services/intelligence.js";
import { summarizeRepo, summarizeBatch } from "./services/summaryService.js";
import { APP_ID, APP_NAME } from "../src/shared/branding.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | undefined;
let worker: UtilityProcess | undefined;
let autoRefreshDate = "";
let isRefreshing = false;
let workerRestartAttempts = 0;
let fallbackServicePromise: Promise<{ db: AppDatabase; service: IntelligenceService }> | undefined;
let localRefreshAbort: AbortController | undefined;
let workerReady = false;
let workerReadyPromise: Promise<void> | undefined;
let resolveWorkerReady: (() => void) | undefined;
let rejectWorkerReady: ((error: Error) => void) | undefined;

const ENABLE_UTILITY_WORKER = process.env.GITHUB_RESEARCH_DISABLE_WORKER !== "1";
const MAX_WORKER_RESTARTS = 2;
const NON_IDEMPOTENT_WORKER_METHODS = new Set([
  "toggleCollection",
  "saveNote",
  "saveAlert",
  "overrideClassification",
  "backupData",
  "updateSettings"
]);

// Pending query map — each QUERY sent to the worker gets a unique ID,
// and we store the resolve/reject pair so we can settle the Promise
// when the corresponding QUERY_RESULT or QUERY_ERROR arrives.
const pendingQueries = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

const REFRESH_PROGRESS_THROTTLE_MS = 150;
let lastProgressSentAt = 0;
let pendingProgress: RefreshProgress | undefined;
let progressFlushTimer: NodeJS.Timeout | undefined;

// Catch internal Electron/Node.js assertion errors (e.g. IPC stream AssertionError)
// instead of crashing with a dialog
process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error?.message ?? error);
  // Log but don't crash — most of these are transient IPC stream issues
});

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason instanceof Error ? reason.message : String(reason));
});

if (process.platform === "win32") {
  app.setAppUserModelId(APP_ID);
}

function configureProcessEnvironment(): void {
  process.env.GITHUB_RESEARCH_USER_DATA = process.env.GITHUB_RESEARCH_USER_DATA ?? app.getPath("userData");
}

async function bootstrap(): Promise<void> {
  configureProcessEnvironment();
  registerIpc();
  createWindow();
  startScheduler();

  if (ENABLE_UTILITY_WORKER) {
    if (!workerReadyPromise) {
      workerReady = false;
      workerReadyPromise = new Promise<void>((resolve, reject) => {
        resolveWorkerReady = resolve;
        rejectWorkerReady = reject;
      });
    }
    const start = () => {
      if (!worker) startWorker();
    };
    // Fork the data worker immediately instead of waiting for did-finish-load.
    // The renderer now has an inline boot shell, so starting DB open in parallel
    // reduces the first dashboard/list query wait without showing a white window.
    setTimeout(start, 0);
  } else {
    console.log("[main] Utility worker disabled; using main-process data service.");
  }
}

// ── Window creation ────────────────────────────────────────────

function createWindow(): void {
  const icon = resolveWindowIcon();

  // Use frame: false on Windows/Linux for custom titlebar;
  // macOS keeps the native hiddenInset titlebar style.
  const frameless = process.platform !== "darwin";

  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: APP_NAME,
    backgroundColor: "#0d0d0d",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
    ...(frameless ? { frame: false } : {}),
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.on("maximize", () => sendMaximizedState());
  mainWindow.on("unmaximize", () => sendMaximizedState());

  if (app.isPackaged) {
    mainWindow.loadFile(join(__dirname, "../../dist/index.html"));
  } else {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
    if (process.env.DEV_TOOLS === "1") {
      mainWindow.webContents.openDevTools({ mode: "detach" });
    }
  }
}

function resolveWindowIcon(): string | undefined {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, iconFile)
    : join(__dirname, "../../build", iconFile);
  return existsSync(iconPath) ? iconPath : undefined;
}

function sendMaximizedState(win = mainWindow): void {
  if (!win || win.isDestroyed()) return;
  win.webContents.send("window:maximized-changed", win.isMaximized());
}

function workerUnavailableSource(error?: unknown): SourceHealth[] {
  return [
    {
      id: "local-worker",
      label: "Local Data Worker",
      configured: true,
      enabled: true,
      status: "degraded",
      message: error instanceof Error
        ? `Local data worker is unavailable: ${error.message}`
        : "Local data worker is starting. Try again in a moment.",
      weight: 0,
      coverage: 0
    }
  ];
}

// ── Worker management ──────────────────────────────────────────

function startWorker(): void {
  const workerPath = join(__dirname, "worker/refreshWorker.js");
  console.log("[main] Starting worker at:", workerPath);

  workerReady = false;
  if (!workerReadyPromise) {
    workerReadyPromise = new Promise<void>((resolve, reject) => {
      resolveWorkerReady = resolve;
      rejectWorkerReady = reject;
    });
  }

  worker = utilityProcess.fork(workerPath, [], {
    serviceName: "githubresearch-worker",
    execArgv: [],
    env: process.env
  });

  worker.on("message", (event: { data: WorkerToMainMessage }) => {
    handleWorkerMessage(event.data);
  });

  worker.on("exit", (exitCode: number) => {
    console.warn(`[main] Worker exited with code ${exitCode}`);
    worker = undefined;
    workerReady = false;
    rejectWorkerReady?.(new Error("Worker process exited before it became ready."));
    workerReadyPromise = undefined;
    resolveWorkerReady = undefined;
    rejectWorkerReady = undefined;

    // Reject all pending queries
    for (const [id, pending] of pendingQueries) {
      pending.reject(new Error("Worker process exited unexpectedly."));
    }
    pendingQueries.clear();

    // If a refresh was in progress, reject it
    if (isRefreshing) {
      isRefreshing = false;
    }

    // Restart a couple of times, then rely on the main-process fallback.
    workerRestartAttempts += 1;
    if (workerRestartAttempts <= MAX_WORKER_RESTARTS) {
      setTimeout(() => {
        console.log("[main] Restarting worker...");
        startWorker();
      }, 3000);
    } else {
      console.warn("[main] Worker failed repeatedly; using main-process data fallback.");
    }
  });
}

function markWorkerReady(): void {
  workerReady = true;
  resolveWorkerReady?.();
  workerReadyPromise = undefined;
  resolveWorkerReady = undefined;
  rejectWorkerReady = undefined;
}

function rejectPendingWorkerReady(error: Error): void {
  if (!workerReady) rejectWorkerReady?.(error);
  workerReady = false;
  workerReadyPromise = undefined;
  resolveWorkerReady = undefined;
  rejectWorkerReady = undefined;
}

async function waitForWorkerReady(timeoutMs = 2500): Promise<boolean> {
  if (workerReady) return true;
  if (!workerReadyPromise) return false;

  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      workerReadyPromise,
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("Worker startup timed out.")), timeoutMs);
      })
    ]);
    return Boolean(worker) && workerReady;
  } catch {
    return false;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function clearProgressTimer(): void {
  if (progressFlushTimer) {
    clearTimeout(progressFlushTimer);
    progressFlushTimer = undefined;
  }
}

function sendRefreshProgress(progress: RefreshProgress): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("refresh:progress", progress);
  lastProgressSentAt = Date.now();
}

function sendRefreshProgressImmediate(progress: RefreshProgress): void {
  pendingProgress = undefined;
  clearProgressTimer();
  sendRefreshProgress(progress);
}

function sendRefreshProgressThrottled(progress: RefreshProgress): void {
  const terminal = progress.phase === "done" || progress.phase === "error" || progress.phase === "cancelled";
  if (terminal) {
    sendRefreshProgressImmediate(progress);
    return;
  }

  const elapsed = Date.now() - lastProgressSentAt;
  if (elapsed >= REFRESH_PROGRESS_THROTTLE_MS) {
    pendingProgress = undefined;
    clearProgressTimer();
    sendRefreshProgress(progress);
    return;
  }

  pendingProgress = progress;
  if (!progressFlushTimer) {
    progressFlushTimer = setTimeout(() => {
      progressFlushTimer = undefined;
      if (pendingProgress) {
        const next = pendingProgress;
        pendingProgress = undefined;
        sendRefreshProgress(next);
      }
    }, REFRESH_PROGRESS_THROTTLE_MS - elapsed);
  }
}

function handleWorkerMessage(msg: WorkerToMainMessage): void {
  switch (msg.type) {
    case "WORKER_READY":
      markWorkerReady();
      break;

    case "WORKER_MAINTENANCE_DONE":
      console.log("[main] Worker startup maintenance completed:", msg.stats);
      break;

    case "REFRESH_PROGRESS":
      sendRefreshProgressThrottled({
        phase: msg.phase as RefreshProgress["phase"],
        done: msg.done,
        total: msg.total,
        label: msg.label,
        repoCount: msg.repoCount
      });
      break;

    case "REFRESH_DONE":
      isRefreshing = false;
      sendRefreshProgressImmediate({
        phase: "done",
        done: msg.stats.total,
        total: msg.stats.total,
        label: "Complete",
        repoCount: msg.stats.total
      });
      break;

    case "REFRESH_ERROR":
      isRefreshing = false;
      sendRefreshProgressImmediate({
        phase: "error",
        done: 0,
        total: 0,
        label: msg.error,
        repoCount: 0
      });
      break;

    case "REFRESH_CANCELLED":
      isRefreshing = false;
      sendRefreshProgressImmediate({
        phase: "cancelled",
        done: 0,
        total: 0,
        label: "Refresh cancelled",
        repoCount: 0
      });
      break;

    case "QUERY_RESULT": {
      const pending = pendingQueries.get(msg.id);
      if (pending) {
        pendingQueries.delete(msg.id);
        pending.resolve(msg.result);
      }
      break;
    }

    case "QUERY_ERROR": {
      // Special case: worker init failure
      if (msg.id === "__init__") {
        const initError = new Error(msg.error);
        console.error("[main] Worker initialization failed:", initError.message);
        rejectPendingWorkerReady(initError);
        break;
      }
      const pending = pendingQueries.get(msg.id);
      if (pending) {
        pendingQueries.delete(msg.id);
        pending.reject(new Error(msg.error));
      }
      break;
    }
  }
}

/**
 * Send a QUERY message to the worker and return a Promise that resolves
 * with the result or rejects with an error. Times out after 5 minutes.
 */
function queryWorker(method: string, ...args: any[]): Promise<any> {
  if (!worker) {
    return Promise.reject(new Error("Worker process is not available."));
  }

  const id = crypto.randomUUID();

  return new Promise<any>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingQueries.delete(id);
      reject(new Error(`Query timeout: ${method} did not respond within 5 minutes.`));
    }, 5 * 60 * 1000);

    pendingQueries.set(id, {
      resolve: (value: any) => {
        clearTimeout(timeout);
        resolve(value);
      },
      reject: (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      }
    });

    const w = worker;
    if (!w) {
      pendingQueries.delete(id);
      return reject(new Error("Worker process is not available."));
    }
    const message: MainToWorkerMessage = { type: "QUERY", id, method, args };
    w.postMessage(message);
  });
}

/**
 * Send a non-query message to the worker (e.g. REFRESH_START, REFRESH_CANCEL).
 */
function postToWorker(msg: MainToWorkerMessage): void {
  if (worker) {
    worker.postMessage(msg);
  }
}

async function getFallbackService(): Promise<{ db: AppDatabase; service: IntelligenceService }> {
  if (!fallbackServicePromise) {
    fallbackServicePromise = AppDatabase.open().then((db) => {
      setTimeout(() => {
        try {
          console.log("[main] Fallback startup maintenance completed:", db.runStartupMaintenance());
        } catch (error) {
          console.warn("[main] Fallback startup maintenance failed:", error instanceof Error ? error.message : String(error));
        }
      }, 25);
      return {
        db,
        service: new IntelligenceService(db)
      };
    });
  }
  return fallbackServicePromise;
}

async function queryLocal(method: string, ...args: any[]): Promise<any> {
  const { db, service } = await getFallbackService();

  switch (method) {
    case "getDashboard":
      return service.getDashboard();
    case "listRepos":
      return service.listRepos(args[0]);
    case "getRepo":
      return service.getRepo(args[0]);
    case "getSettings":
      return service.getSettings();
    case "getSources":
      return service.getSources();
    case "getLatestJob":
      return service.getLatestJob();
    case "getRateLimits":
      return service.getRateLimits();
    case "toggleCollection":
      return service.toggleCollection(args[0], args[1]);
    case "saveNote":
      return service.saveNote(args[0], args[1], args[2], args[3]);
    case "saveAlert":
      return service.saveAlert(args[0]);
    case "overrideClassification":
      return service.overrideClassification(args[0]);
    case "searchRepos":
      return service.search(args[0], args[1], args[2]);
    case "getCategoryCounts":
      return service.getCategoryCounts(args[0]);
    case "exportLearningMarkdown":
      return service.exportLearningMarkdown();
    case "backupData":
      return service.backupData();
    case "testConnection":
      return service.testConnection(args[0]);
    case "countRepos":
      return db.countRepos();
    case "updateSettings":
      return service.updateSettings(args[0]);
    default:
      throw new Error(`Unknown query method: ${method}`);
  }
}

async function queryData(method: string, ...args: any[]): Promise<any> {
  const ready = await waitForWorkerReady();
  if (!ready || !worker) {
    const message = "Worker is still starting; delaying main-process fallback until timeout elapsed.";
    if (NON_IDEMPOTENT_WORKER_METHODS.has(method)) throw new Error(message);
    console.warn(`[main] ${message}`);
    return queryLocal(method, ...args);
  }

  try {
    return await queryWorker(method, ...args);
  } catch (error) {
    if (NON_IDEMPOTENT_WORKER_METHODS.has(method)) throw error;
    console.warn("[main] Worker query failed; using main-process fallback:", error instanceof Error ? error.message : String(error));
    return queryLocal(method, ...args);
  }
}

async function refreshLocal(windows: string[]): Promise<any> {
  const { service } = await getFallbackService();
  const trendWindow = windows.length === 1
    ? (windows[0] as "daily" | "weekly" | "monthly" | "historical")
    : undefined;

  localRefreshAbort = new AbortController();
  try {
    return await service.refresh(trendWindow, (progress) => {
      sendRefreshProgressThrottled(progress as RefreshProgress);
    }, localRefreshAbort.signal);
  } finally {
    localRefreshAbort = undefined;
  }
}

// ── IPC registration ───────────────────────────────────────────

function registerIpc(): void {
  // Wrap handler in try/catch to prevent any unhandled errors from reaching Electron
  const safe = <T>(handler: (...args: any[]) => Promise<T> | T) =>
    async (...args: any[]): Promise<T | undefined> => {
      try {
        return await handler(...args);
      } catch (error) {
        console.error("[ipc error]", error instanceof Error ? error.message : String(error));
        return undefined;
      }
    };

  // ── Window controls ──────────────────────────────────────────

  ipcMain.handle("window:minimize", safe((event: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
  }));

  ipcMain.handle("window:maximize", safe((event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
    sendMaximizedState(win);
    return win.isMaximized();
  }));

  ipcMain.handle("window:close", safe((event: IpcMainInvokeEvent) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
  }));

  ipcMain.handle("window:isMaximized", safe((event: IpcMainInvokeEvent) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false;
  }));

  // ── Read queries (forwarded to worker) ──────────────────────

  ipcMain.handle("dashboard:get", safe(() => queryData("getDashboard")));

  ipcMain.handle("repos:list", safe((_event: any, filters: RepoFilters) =>
    queryData("listRepos", filters)
  ));

  ipcMain.handle("repos:get", safe((_event: any, repoId: string) =>
    queryData("getRepo", repoId)
  ));

  // ── Refresh (special protocol) ──────────────────────────────

  ipcMain.handle("refresh:run", safe(async (_event: any, window?: TrendWindow) => {
    if (isRefreshing) {
      return {
        jobId: "",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        windows: [],
        discovered: 0,
        enriched: 0,
        classified: 0,
        scored: 0,
        warnings: ["Refresh already in progress, please wait."],
        steps: []
      };
    }

    isRefreshing = true;

    const windows = window ? [window] : ["daily", "weekly", "monthly"];

    const ready = await waitForWorkerReady(5000);
    const activeWorker = ready ? worker : undefined;
    if (!activeWorker) {
      try {
        return await refreshLocal(windows);
      } finally {
        isRefreshing = false;
      }
    }

    return new Promise<any>((resolve) => {
      const finish = (result: any): void => {
        activeWorker.removeListener("message", messageListener);
        activeWorker.removeListener("exit", exitListener);
        isRefreshing = false;
        resolve(result);
      };

      const exitListener = () => finish({
        jobId: "",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        windows: [],
        discovered: 0,
        enriched: 0,
        classified: 0,
        scored: 0,
        warnings: ["Refresh worker exited before the refresh completed."],
        steps: []
      });

      const onMessage = (msg: WorkerToMainMessage): void => {
        switch (msg.type) {
          case "REFRESH_DONE":
            finish(msg.stats.result);
            break;
          case "REFRESH_ERROR":
            finish({
              jobId: "",
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              windows: [],
              discovered: 0,
              enriched: 0,
              classified: 0,
              scored: 0,
              warnings: [msg.error],
              steps: []
            });
            break;
          case "REFRESH_CANCELLED":
            finish({
              jobId: "",
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              windows: [],
              discovered: 0,
              enriched: 0,
              classified: 0,
              scored: 0,
              warnings: ["Refresh was cancelled."],
              steps: []
            });
            break;
        }
      };

      const messageListener = (event: { data: WorkerToMainMessage }) => {
        onMessage(event.data);
      };

      activeWorker.on("message", messageListener);
      activeWorker.once("exit", exitListener);
      activeWorker.postMessage({ type: "REFRESH_START", payload: { windows } });
    });
  }));

  ipcMain.handle("refresh:status", safe(() => ({ isRefreshing })));

  ipcMain.handle("refresh:cancel", safe(() => {
    localRefreshAbort?.abort();
    postToWorker({ type: "REFRESH_CANCEL" });
  }));

  // ── Settings ────────────────────────────────────────────────

  ipcMain.handle("settings:get", safe(() => queryData("getSettings")));

  ipcMain.handle("settings:update", safe((_event: any, settings: Partial<Settings>) => {
    // Update settings via the worker (which owns the DB)
    const result = queryData("updateSettings", settings);
    // Also handle login item from the main process where app is always available
    if (typeof settings.startAtLogin === "boolean" && process.platform !== "darwin") {
      app.setLoginItemSettings({
        openAtLogin: settings.startAtLogin,
        path: process.execPath
      });
    }
    return result;
  }));

  // ── More read queries (forwarded to worker) ─────────────────

  ipcMain.handle("sources:get", safe(async () => {
    try {
      const sources = await queryData("getSources") as SourceHealth[] | undefined;
      return sources?.length ? sources : workerUnavailableSource();
    } catch (error) {
      return workerUnavailableSource(error);
    }
  }));
  ipcMain.handle("jobs:latest", safe(() => queryData("getLatestJob")));
  ipcMain.handle("rate-limits:get", safe(() => queryData("getRateLimits")));

  // ── Write mutations (forwarded to worker) ───────────────────

  ipcMain.handle("collection:toggle", safe((_event: any, repoId: string, status?: RepoStatus) =>
    queryData("toggleCollection", repoId, status)
  ));

  ipcMain.handle("notes:save", safe((_event: any, repoId: string, markdown: string, tags: string[], status: RepoStatus) =>
    queryData("saveNote", repoId, markdown, tags, status)
  ));

  ipcMain.handle("alerts:save", safe((_event: any, rule: any) =>
    queryData("saveAlert", rule)
  ));

  ipcMain.handle("classifier:override", safe((_event: any, input: ClassificationOverrideInput) =>
    queryData("overrideClassification", input)
  ));

  ipcMain.handle("learning:export", safe(() => queryData("exportLearningMarkdown")));
  ipcMain.handle("backup:create", safe(() => queryData("backupData")));

  ipcMain.handle("connection:test", safe(async (_event: any, kind: "github" | "ai") => {
    try {
      const result = await queryData("testConnection", kind) as { ok: boolean; message: string } | undefined;
      if (result?.message) return result;
      return { ok: false, message: "Connection check is unavailable. The local data worker may still be starting." };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, message: `Connection check is unavailable: ${message}` };
    }
  }));

  // ── External URL (stays in main process) ────────────────────

  ipcMain.handle("external:open", safe(async (_event: any, url: string) => {
    await shell.openExternal(url);
  }));

  // ── v2.0: Search ────────────────────────────────────────────

  ipcMain.handle("search:run", safe((_event: any, query: string, filters: SearchFilters, sort: SortOption) =>
    queryData("searchRepos", query, filters, sort)
  ));

  // ── v2.0: Summary ───────────────────────────────────────────

  ipcMain.handle("summary:repo", safe(async (_event: any, repoId: string, force?: boolean) => {
    const settings = await queryData("getSettings") as Settings;
    const webContents = mainWindow?.webContents;

    return summarizeRepo(
      repoId,
      Boolean(force),
      queryData,
      settings,
      webContents
    );
  }));

  ipcMain.handle("summary:batch", safe(async (_event: any, repoIds: string[], title: string) => {
    const settings = await queryData("getSettings") as Settings;

    return summarizeBatch(repoIds, title, queryData, settings);
  }));

  ipcMain.handle("summary:cancel", safe(() => {
    // Currently a no-op placeholder. AI streaming will complete naturally
    // when the fetch response finishes. Future: use AbortController for
    // in-flight AI summary requests.
    console.log("[main] Summary cancel requested (not yet implemented).");
  }));

  // ── v2.0: Category counts ──────────────────────────────────

  ipcMain.handle("repos:categoryCounts", safe((_event: any, window: TrendWindow) =>
    queryData("getCategoryCounts", window)
  ));
}

// ── Scheduler ──────────────────────────────────────────────────

function startScheduler(): void {
  setInterval(async () => {
    try {
      const settings = await queryData("getSettings") as Settings;
      if (!settings.backgroundRefresh) return;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (currentTime === settings.refreshTime && autoRefreshDate !== today && !isRefreshing) {
        autoRefreshDate = today;
        if (worker && await waitForWorkerReady(5000)) {
          postToWorker({
            type: "REFRESH_START",
            payload: { windows: ["daily", "weekly", "monthly"] }
          });
        } else {
          isRefreshing = true;
          void refreshLocal(["daily", "weekly", "monthly"]).finally(() => {
            isRefreshing = false;
          });
        }
      }
    } catch (error) {
      console.error("[scheduler] Error checking settings:", error instanceof Error ? error.message : String(error));
    }
  }, 60_000);
}

// ── App lifecycle ──────────────────────────────────────────────

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
