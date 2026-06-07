import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron";
import type { UtilityProcess } from "electron";
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
  SortOption
} from "../src/shared/types.js";
import type { MainToWorkerMessage, WorkerToMainMessage } from "../src/shared/workerProtocol.js";
import { summarizeRepo, summarizeBatch } from "./services/summaryService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = "local.star-intel.desk";

let mainWindow: BrowserWindow | undefined;
let worker: UtilityProcess | undefined;
let autoRefreshDate = "";
let isRefreshing = false;

// Pending query map — each QUERY sent to the worker gets a unique ID,
// and we store the resolve/reject pair so we can settle the Promise
// when the corresponding QUERY_RESULT or QUERY_ERROR arrives.
const pendingQueries = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

// When a refresh is in progress, the IPC handler awaits this Promise.
let refreshPromise: Promise<any> | null = null;

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

async function bootstrap(): Promise<void> {
  startWorker();
  registerIpc();
  createWindow();
  startScheduler();
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
    title: "Star Intel Desk",
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

// ── Worker management ──────────────────────────────────────────

function startWorker(): void {
  const workerPath = join(__dirname, "worker/refreshWorker.js");
  console.log("[main] Starting worker at:", workerPath);

  worker = utilityProcess.fork(workerPath, [], {
    serviceName: "star-intel-worker",
    execArgv: []
  });

  worker.on("message", (event: { data: WorkerToMainMessage }) => {
    handleWorkerMessage(event.data);
  });

  worker.on("exit", (exitCode: number) => {
    console.warn(`[main] Worker exited with code ${exitCode}`);
    worker = undefined;

    // Reject all pending queries
    for (const [id, pending] of pendingQueries) {
      pending.reject(new Error("Worker process exited unexpectedly."));
    }
    pendingQueries.clear();

    // If a refresh was in progress, reject it
    if (isRefreshing) {
      isRefreshing = false;
    }

    // Restart the worker after a short delay
    setTimeout(() => {
      console.log("[main] Restarting worker...");
      startWorker();
    }, 3000);
  });
}

function handleWorkerMessage(msg: WorkerToMainMessage): void {
  switch (msg.type) {
    case "REFRESH_PROGRESS":
      // Forward progress events to the renderer process
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("refresh:progress", {
          phase: msg.phase,
          done: msg.done,
          total: msg.total,
          label: msg.label,
          repoCount: msg.repoCount
        });
      }
      break;

    case "REFRESH_DONE":
      isRefreshing = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("refresh:progress", {
          phase: "done",
          done: msg.stats.total,
          total: msg.stats.total,
          label: "Complete",
          repoCount: msg.stats.total
        });
      }
      break;

    case "REFRESH_ERROR":
      isRefreshing = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("refresh:progress", {
          phase: "error",
          done: 0,
          total: 0,
          label: msg.error,
          repoCount: 0
        });
      }
      break;

    case "REFRESH_CANCELLED":
      isRefreshing = false;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("refresh:progress", {
          phase: "cancelled",
          done: 0,
          total: 0,
          label: "Refresh cancelled",
          repoCount: 0
        });
      }
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
        console.error("[main] Worker initialization failed:", msg.error);
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

  // ── Read queries (forwarded to worker) ──────────────────────

  ipcMain.handle("dashboard:get", safe(() => queryWorker("getDashboard")));

  ipcMain.handle("repos:list", safe((_event: any, filters: RepoFilters) =>
    queryWorker("listRepos", filters)
  ));

  ipcMain.handle("repos:get", safe((_event: any, repoId: string) =>
    queryWorker("getRepo", repoId)
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

    return new Promise<any>((resolve) => {
      // Store reference to resolve function for handleWorkerMessage
      const onMessage = (msg: WorkerToMainMessage): void => {
        switch (msg.type) {
          case "REFRESH_DONE":
            worker?.removeListener("message", messageListener);
            resolve(msg.stats.result);
            break;
          case "REFRESH_ERROR":
            worker?.removeListener("message", messageListener);
            resolve({
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
            worker?.removeListener("message", messageListener);
            resolve({
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

      worker?.on("message", messageListener);

      // Send the refresh command
      postToWorker({ type: "REFRESH_START", payload: { windows } });
    });
  }));

  ipcMain.handle("refresh:status", safe(() => ({ isRefreshing })));

  ipcMain.handle("refresh:cancel", safe(() => {
    postToWorker({ type: "REFRESH_CANCEL" });
  }));

  // ── Settings ────────────────────────────────────────────────

  ipcMain.handle("settings:get", safe(() => queryWorker("getSettings")));

  ipcMain.handle("settings:update", safe((_event: any, settings: Partial<Settings>) => {
    // Update settings via the worker (which owns the DB)
    const result = queryWorker("updateSettings", settings);
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

  ipcMain.handle("sources:get", safe(() => queryWorker("getSources")));
  ipcMain.handle("jobs:latest", safe(() => queryWorker("getLatestJob")));
  ipcMain.handle("rate-limits:get", safe(() => queryWorker("getRateLimits")));

  // ── Write mutations (forwarded to worker) ───────────────────

  ipcMain.handle("collection:toggle", safe((_event: any, repoId: string, status?: RepoStatus) =>
    queryWorker("toggleCollection", repoId, status)
  ));

  ipcMain.handle("notes:save", safe((_event: any, repoId: string, markdown: string, tags: string[], status: RepoStatus) =>
    queryWorker("saveNote", repoId, markdown, tags, status)
  ));

  ipcMain.handle("alerts:save", safe((_event: any, rule: any) =>
    queryWorker("saveAlert", rule)
  ));

  ipcMain.handle("classifier:override", safe((_event: any, input: ClassificationOverrideInput) =>
    queryWorker("overrideClassification", input)
  ));

  ipcMain.handle("learning:export", safe(() => queryWorker("exportLearningMarkdown")));
  ipcMain.handle("backup:create", safe(() => queryWorker("backupData")));

  ipcMain.handle("connection:test", safe((_event: any, kind: "github" | "ai") =>
    queryWorker("testConnection", kind)
  ));

  // ── External URL (stays in main process) ────────────────────

  ipcMain.handle("external:open", safe(async (_event: any, url: string) => {
    await shell.openExternal(url);
  }));

  // ── v2.0: Search ────────────────────────────────────────────

  ipcMain.handle("search:run", safe((_event: any, query: string, filters: SearchFilters, sort: SortOption) =>
    queryWorker("searchRepos", query, filters, sort)
  ));

  // ── v2.0: Summary ───────────────────────────────────────────

  ipcMain.handle("summary:repo", safe(async (_event: any, repoId: string, force?: boolean) => {
    const settings = await queryWorker("getSettings") as Settings;
    const webContents = mainWindow?.webContents;

    return summarizeRepo(
      repoId,
      Boolean(force),
      queryWorker,
      settings,
      webContents
    );
  }));

  ipcMain.handle("summary:batch", safe(async (_event: any, repoIds: string[], title: string) => {
    const settings = await queryWorker("getSettings") as Settings;

    return summarizeBatch(repoIds, title, queryWorker, settings);
  }));

  ipcMain.handle("summary:cancel", safe(() => {
    // Currently a no-op placeholder. AI streaming will complete naturally
    // when the fetch response finishes. Future: use AbortController for
    // in-flight AI summary requests.
    console.log("[main] Summary cancel requested (not yet implemented).");
  }));

  // ── v2.0: Category counts ──────────────────────────────────

  ipcMain.handle("repos:categoryCounts", safe((_event: any, window: TrendWindow) =>
    queryWorker("getCategoryCounts", window)
  ));
}

// ── Scheduler ──────────────────────────────────────────────────

function startScheduler(): void {
  setInterval(async () => {
    try {
      const settings = await queryWorker("getSettings") as Settings;
      if (!settings.backgroundRefresh) return;
      const now = new Date();
      const today = now.toISOString().slice(0, 10);
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      if (currentTime === settings.refreshTime && autoRefreshDate !== today && !isRefreshing) {
        autoRefreshDate = today;
        postToWorker({
          type: "REFRESH_START",
          payload: { windows: ["daily", "weekly", "monthly"] }
        });
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
