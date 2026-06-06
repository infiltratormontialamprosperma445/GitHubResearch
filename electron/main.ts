import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AppDatabase } from "./services/database.js";
import { IntelligenceService } from "./services/intelligence.js";
import {
  ClassificationOverrideInput,
  RepoFilters,
  RepoStatus,
  Settings,
  TrendWindow
} from "../src/shared/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ID = "local.star-intel.desk";

let mainWindow: BrowserWindow | undefined;
let service: IntelligenceService;
let autoRefreshDate = "";
let isRefreshing = false;

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
  const db = await AppDatabase.open();
  service = new IntelligenceService(db);
  registerIpc();
  createWindow();
  startScheduler();
}

function createWindow(): void {
  const icon = resolveWindowIcon();
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    title: "Star Intel Desk",
    backgroundColor: "#faf9f5",
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" as const } : {}),
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

  ipcMain.handle("dashboard:get", safe(() => service.getDashboard()));
  ipcMain.handle("repos:list", safe((_event: any, filters: RepoFilters) => service.listRepos(filters)));
  ipcMain.handle("repos:get", safe((_event: any, repoId: string) => service.getRepo(repoId)));

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
    try {
      const result = await service.refresh(window);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        jobId: "",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        windows: [],
        discovered: 0,
        enriched: 0,
        classified: 0,
        scored: 0,
        warnings: [message],
        steps: []
      };
    } finally {
      isRefreshing = false;
    }
  }));

  ipcMain.handle("refresh:status", safe(() => ({ isRefreshing })));
  ipcMain.handle("settings:get", safe(() => service.getSettings()));
  ipcMain.handle("settings:update", safe((_event: any, settings: Partial<Settings>) => service.updateSettings(settings)));
  ipcMain.handle("sources:get", safe(() => service.getSources()));
  ipcMain.handle("jobs:latest", safe(() => service.getLatestJob()));
  ipcMain.handle("rate-limits:get", safe(() => service.getRateLimits()));
  ipcMain.handle("collection:toggle", safe((_event: any, repoId: string, status?: RepoStatus) =>
    service.toggleCollection(repoId, status)
  ));
  ipcMain.handle("notes:save", safe((_event: any, repoId: string, markdown: string, tags: string[], status: RepoStatus) =>
    service.saveNote(repoId, markdown, tags, status)
  ));
  ipcMain.handle("alerts:save", safe((_event: any, rule: any) => service.saveAlert(rule)));
  ipcMain.handle("classifier:override", safe((_event: any, input: ClassificationOverrideInput) =>
    service.overrideClassification(input)
  ));
  ipcMain.handle("learning:export", safe(() => service.exportLearningMarkdown()));
  ipcMain.handle("backup:create", safe(() => service.backupData()));
  ipcMain.handle("connection:test", safe((_event: any, kind: "github" | "ai") => service.testConnection(kind)));
  ipcMain.handle("external:open", safe(async (_event: any, url: string) => {
    await shell.openExternal(url);
  }));
}

function startScheduler(): void {
  setInterval(async () => {
    const settings = service.getSettings();
    if (!settings.backgroundRefresh) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (currentTime === settings.refreshTime && autoRefreshDate !== today && !isRefreshing) {
      autoRefreshDate = today;
      await service.refresh().catch(() => undefined);
    }
  }, 60_000);
}

app.whenReady().then(bootstrap);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
