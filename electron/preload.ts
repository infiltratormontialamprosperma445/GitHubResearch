import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";
import type {
  AlertRule,
  AppApiV2,
  CategoryCounts,
  ClassificationOverrideInput,
  RefreshProgress,
  RepoFilters,
  RepoStatus,
  SearchFilters,
  SearchResult,
  Settings,
  SortOption,
  TrendWindow
} from "../src/shared/types.js";

const api: AppApiV2 = {
  // ── Original AppApi methods ─────────────────────────────────

  getDashboard: () => ipcRenderer.invoke("dashboard:get"),

  listRepos: (filters: RepoFilters) => ipcRenderer.invoke("repos:list", filters),

  getRepo: (repoId: string) => ipcRenderer.invoke("repos:get", repoId),

  refresh: (window?: TrendWindow) => ipcRenderer.invoke("refresh:run", window),

  getSettings: () => ipcRenderer.invoke("settings:get"),

  updateSettings: (settings: Partial<Settings>) => ipcRenderer.invoke("settings:update", settings),

  getSources: () => ipcRenderer.invoke("sources:get"),

  getLatestJob: () => ipcRenderer.invoke("jobs:latest"),

  getRateLimits: () => ipcRenderer.invoke("rate-limits:get"),

  toggleCollection: (repoId: string, status?: RepoStatus) =>
    ipcRenderer.invoke("collection:toggle", repoId, status),

  saveNote: (repoId: string, markdown: string, tags: string[], status: RepoStatus) =>
    ipcRenderer.invoke("notes:save", repoId, markdown, tags, status),

  saveAlert: (rule: Omit<AlertRule, "id" | "createdAt">) =>
    ipcRenderer.invoke("alerts:save", rule),

  overrideClassification: (input: ClassificationOverrideInput) =>
    ipcRenderer.invoke("classifier:override", input),

  exportLearningMarkdown: () => ipcRenderer.invoke("learning:export"),

  backupData: () => ipcRenderer.invoke("backup:create"),

  testConnection: (kind: "github" | "ai") =>
    ipcRenderer.invoke("connection:test", kind),

  openExternal: (url: string) => ipcRenderer.invoke("external:open", url),

  windowControls: {
    platform: process.platform,
    minimize: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
    onMaximizedChange: (callback: (isMaximized: boolean) => void) => {
      const listener = (_event: IpcRendererEvent, isMaximized: boolean) => callback(Boolean(isMaximized));
      ipcRenderer.on("window:maximized-changed", listener);
      return () => ipcRenderer.removeListener("window:maximized-changed", listener);
    }
  },

  // ── v2.0: Search ───────────────────────────────────────────

  search: (query: string, filters: SearchFilters, sort: SortOption): Promise<SearchResult[]> =>
    ipcRenderer.invoke("search:run", query, filters, sort),

  // ── v2.0: Summary ──────────────────────────────────────────

  summarizeRepo: (repoId: string, force?: boolean): Promise<{ cached: boolean; summary?: string }> =>
    ipcRenderer.invoke("summary:repo", repoId, force),

  summarizeBatch: (repoIds: string[], title: string): Promise<{ summary: string }> =>
    ipcRenderer.invoke("summary:batch", repoIds, title),

  // ── v2.0: Refresh control ──────────────────────────────────

  cancelRefresh: (): Promise<void> =>
    ipcRenderer.invoke("refresh:cancel"),

  // ── v2.0: Event listeners ──────────────────────────────────

  onRefreshProgress: (callback: (data: RefreshProgress) => void): () => void => {
    const listener = (_event: IpcRendererEvent, data: RefreshProgress) => callback(data);
    ipcRenderer.on("refresh:progress", listener);
    return () => ipcRenderer.removeListener("refresh:progress", listener);
  },

  onSummaryToken: (callback: (data: { repoId: string; token: string }) => void): () => void => {
    const listener = (_event: IpcRendererEvent, data: { repoId: string; token: string }) => callback(data);
    ipcRenderer.on("summary:token", listener);
    return () => ipcRenderer.removeListener("summary:token", listener);
  },

  // ── v2.0: Category counts ──────────────────────────────────

  getCategoryCounts: (window: TrendWindow): Promise<CategoryCounts> =>
    ipcRenderer.invoke("repos:categoryCounts", window)
};

contextBridge.exposeInMainWorld("githubIntel", api);
