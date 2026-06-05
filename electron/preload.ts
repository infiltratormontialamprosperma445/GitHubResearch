import { contextBridge, ipcRenderer } from "electron";
import type {
  AlertRule,
  AppApi,
  ClassificationOverrideInput,
  RepoFilters,
  RepoStatus,
  Settings,
  TrendWindow
} from "../src/shared/types.js";

const api: AppApi = {
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  listRepos: (filters: RepoFilters) => ipcRenderer.invoke("repos:list", filters),
  getRepo: (repoId: string) => ipcRenderer.invoke("repos:get", repoId),
  refresh: (window?: TrendWindow) => ipcRenderer.invoke("refresh:run", window),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  updateSettings: (settings: Partial<Settings>) => ipcRenderer.invoke("settings:update", settings),
  getSources: () => ipcRenderer.invoke("sources:get"),
  getLatestJob: () => ipcRenderer.invoke("jobs:latest"),
  getRateLimits: () => ipcRenderer.invoke("rate-limits:get"),
  toggleCollection: (repoId: string, status?: RepoStatus) => ipcRenderer.invoke("collection:toggle", repoId, status),
  saveNote: (repoId: string, markdown: string, tags: string[], status: RepoStatus) =>
    ipcRenderer.invoke("notes:save", repoId, markdown, tags, status),
  saveAlert: (rule: Omit<AlertRule, "id" | "createdAt">) => ipcRenderer.invoke("alerts:save", rule),
  overrideClassification: (input: ClassificationOverrideInput) => ipcRenderer.invoke("classifier:override", input),
  exportLearningMarkdown: () => ipcRenderer.invoke("learning:export"),
  backupData: () => ipcRenderer.invoke("backup:create"),
  testConnection: (kind: "github" | "ai") => ipcRenderer.invoke("connection:test", kind),
  openExternal: (url: string) => ipcRenderer.invoke("external:open", url)
};

contextBridge.exposeInMainWorld("githubIntel", api);
