import { app, BrowserWindow, ipcMain, shell } from "electron";
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
    titleBarStyle: "hiddenInset",
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
  ipcMain.handle("dashboard:get", () => service.getDashboard());
  ipcMain.handle("repos:list", (_event, filters: RepoFilters) => service.listRepos(filters));
  ipcMain.handle("repos:get", (_event, repoId: string) => service.getRepo(repoId));
  ipcMain.handle("refresh:run", (_event, window?: TrendWindow) => service.refresh(window));
  ipcMain.handle("settings:get", () => service.getSettings());
  ipcMain.handle("settings:update", (_event, settings: Partial<Settings>) => service.updateSettings(settings));
  ipcMain.handle("sources:get", () => service.getSources());
  ipcMain.handle("jobs:latest", () => service.getLatestJob());
  ipcMain.handle("rate-limits:get", () => service.getRateLimits());
  ipcMain.handle("collection:toggle", (_event, repoId: string, status?: RepoStatus) =>
    service.toggleCollection(repoId, status)
  );
  ipcMain.handle("notes:save", (_event, repoId: string, markdown: string, tags: string[], status: RepoStatus) =>
    service.saveNote(repoId, markdown, tags, status)
  );
  ipcMain.handle("alerts:save", (_event, rule) => service.saveAlert(rule));
  ipcMain.handle("classifier:override", (_event, input: ClassificationOverrideInput) =>
    service.overrideClassification(input)
  );
  ipcMain.handle("learning:export", () => service.exportLearningMarkdown());
  ipcMain.handle("backup:create", () => service.backupData());
  ipcMain.handle("connection:test", (_event, kind: "github" | "ai") => service.testConnection(kind));
  ipcMain.handle("external:open", async (_event, url: string) => {
    await shell.openExternal(url);
  });
}

function startScheduler(): void {
  setInterval(async () => {
    const settings = service.getSettings();
    if (!settings.backgroundRefresh) return;
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (currentTime === settings.refreshTime && autoRefreshDate !== today) {
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
