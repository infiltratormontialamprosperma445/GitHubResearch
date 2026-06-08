import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Boxes,
  Brain,
  ChevronLeft,
  ChevronRight,
  Command,
  Copy,
  Database,
  Download,
  ExternalLink,
  GitCompare,
  Heart,
  Inbox,
  LayoutDashboard,
  Loader2,
  Minus,
  Moon,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Sun,
  Tag,
  X
} from "lucide-react";
import { api } from "./api";
import { apiV2 } from "./api";
import { APP_NAME, APP_VERSION } from "../shared/branding";
import { useI18n } from "./i18n";
import CommandPalette from "./components/CommandPalette";
import SkeletonRow from "./components/SkeletonRow";
import {
  AI_SUBCATEGORIES,
  PRIMARY_CATEGORIES,
  type AiSubcategory,
  type PrimaryCategory,
  type RefreshProgress,
  type RepoRecord,
  type RepoStatus,
  type Settings,
  TREND_WINDOWS,
  type TrendWindow
} from "../shared/types";

type ModuleId =
  | "dashboard"
  | "explorer"
  | "categories"
  | "collections"
  | "compare"
  | "learning"
  | "alerts"
  | "sources"
  | "classifier"
  | "settings";

const MODULES: Array<{ id: ModuleId; labelKey: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", labelKey: "module.dashboard", icon: LayoutDashboard },
  { id: "explorer", labelKey: "module.explorer", icon: Sparkles },
  { id: "categories", labelKey: "module.categories", icon: Boxes },
  { id: "collections", labelKey: "sidebar.collections", icon: Heart },
  { id: "sources", labelKey: "module.sources", icon: Database },
  { id: "compare", labelKey: "module.compare", icon: GitCompare },
  { id: "learning", labelKey: "module.learning", icon: BookOpen },
  { id: "alerts", labelKey: "module.alerts", icon: Bell },
  { id: "classifier", labelKey: "module.classifier", icon: Brain },
  { id: "settings", labelKey: "module.settings", icon: SettingsIcon }
];

const PAGE_SIZE = 50;
const LOGO_SRC = "./icon.png";

type AiSidebarFilter = {
  id: string;
  labelKey: string;
  hintKey: string;
  secondaryCategory?: AiSubcategory;
  search?: string;
  badge: string;
  priority?: "hot" | "new" | "infra";
};

const AI_SIDEBAR_FILTERS: AiSidebarFilter[] = [
  { id: "skills", labelKey: "aiFilter.skills", hintKey: "aiFilter.skillsHint", secondaryCategory: "Skills/Plugins", search: "skills plugins slash commands", badge: "SK", priority: "hot" },
  { id: "prompts", labelKey: "aiFilter.prompts", hintKey: "aiFilter.promptsHint", secondaryCategory: "Prompts/Workflows", search: "prompt prompts system prompt", badge: "PR", priority: "hot" },
  { id: "claude-code", labelKey: "aiFilter.claudeCode", hintKey: "aiFilter.claudeCodeHint", secondaryCategory: "Claude Code", search: "claude code claude-code", badge: "CC", priority: "hot" },
  { id: "codex", labelKey: "aiFilter.codex", hintKey: "aiFilter.codexHint", secondaryCategory: "Codex/CLI", search: "codex openai-codex", badge: "CX", priority: "hot" },
  { id: "mcp-servers", labelKey: "aiFilter.mcpServers", hintKey: "aiFilter.mcpServersHint", secondaryCategory: "MCP Servers", search: "mcp server model-context-protocol", badge: "M-S", priority: "hot" },
  { id: "mcp-clients", labelKey: "aiFilter.mcpClients", hintKey: "aiFilter.mcpClientsHint", secondaryCategory: "MCP Clients", search: "mcp client host gateway inspector", badge: "M-C", priority: "new" },
  { id: "tool-calling", labelKey: "aiFilter.toolCalling", hintKey: "aiFilter.toolCallingHint", secondaryCategory: "Tool Calling", search: "tool calling function calling tools", badge: "FN", priority: "infra" },
  { id: "browser", labelKey: "aiFilter.browserAutomation", hintKey: "aiFilter.browserAutomationHint", secondaryCategory: "Browser Automation", search: "browser automation playwright puppeteer browser-use", badge: "WEB", priority: "hot" },
  { id: "computer-use", labelKey: "aiFilter.computerUse", hintKey: "aiFilter.computerUseHint", secondaryCategory: "Computer Use", search: "computer use desktop automation ui automation", badge: "CU", priority: "new" },
  { id: "chatgpt", labelKey: "aiFilter.chatgpt", hintKey: "aiFilter.chatgptHint", secondaryCategory: "OpenAI/GPT", search: "openai chatgpt gpt cpt", badge: "GPT" },
  { id: "claude", labelKey: "aiFilter.claude", hintKey: "aiFilter.claudeHint", secondaryCategory: "Claude/Anthropic", search: "claude anthropic", badge: "CL" },
  { id: "local-models", labelKey: "aiFilter.localModels", hintKey: "aiFilter.localModelsHint", secondaryCategory: "Local Models", search: "ollama qwen deepseek local llm", badge: "LM" },
  { id: "gateways", labelKey: "aiFilter.gateways", hintKey: "aiFilter.gatewaysHint", secondaryCategory: "LLM Gateways", search: "llm gateway model router openai compatible", badge: "GW", priority: "infra" },
  { id: "agents", labelKey: "aiFilter.agents", hintKey: "aiFilter.agentsHint", secondaryCategory: "Agent Frameworks", search: "agent agents multi-agent", badge: "AG" },
  { id: "rag", labelKey: "aiFilter.rag", hintKey: "aiFilter.ragHint", secondaryCategory: "RAG/Knowledge", search: "rag retrieval vector", badge: "RAG" }
];

// ── Theme management ──────────────────────────────────────────

type Theme = "dark" | "light";
const THEME_KEY = "githubresearch-theme";

function getInitialTheme(): Theme {
  try {
    const saved = globalThis.localStorage?.getItem(THEME_KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch { /* ignore */ }
  return "dark";
}

// ── Main App Component ────────────────────────────────────────

export default function App() {
  const { t, locale, setLocale, categoryLabel, subcategoryLabel } = useI18n();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [window, setWindow] = useState<TrendWindow>("daily");
  const [category, setCategory] = useState<string>("All");
  const [secondaryCategory, setSecondaryCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [refreshProgress, setRefreshProgress] = useState<RefreshProgress | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [page, setPage] = useState(1);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const progressFrame = useRef<number | undefined>(undefined);
  const pendingProgress = useRef<RefreshProgress | null>(null);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { globalThis.localStorage?.setItem(THEME_KEY, theme); } catch { /* ignore */ }
  }, [theme]);

  useEffect(() => {
    const splash = document.getElementById("boot-splash");
    document.documentElement.setAttribute("data-boot", "ready");
    const timer = globalThis.setTimeout(() => splash?.remove(), 220);
    return () => globalThis.clearTimeout(timer);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => prev === "dark" ? "light" : "dark");
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);

  // ── Queries ────────────────────────────────────────────────

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.getDashboard()
  });

  const reposQuery = useQuery({
    queryKey: ["repos", window, category, secondaryCategory, search, page],
    queryFn: () =>
      api.listRepos({
        window,
        search,
        primaryCategory: category,
        secondaryCategory,
        limit: PAGE_SIZE * page
      }),
    placeholderData: keepPreviousData
  });

  const categoryCountsQuery = useQuery({
    queryKey: ["category-counts", window],
    queryFn: () => apiV2.getCategoryCounts(window),
    placeholderData: keepPreviousData,
    enabled: reposQuery.isFetched || dashboardQuery.isFetched
  });

  const sourcesQuery = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.getSources(),
    enabled: dashboardQuery.isFetched || activeModule === "sources" || activeModule === "settings"
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings()
  });

  const rateLimitsQuery = useQuery({
    queryKey: ["rate-limits"],
    queryFn: () => api.getRateLimits(),
    enabled: sourcesQuery.isFetched || activeModule === "sources" || activeModule === "settings"
  });

  // ── Refresh with real IPC progress ─────────────────────────

  const refreshMutation = useMutation({
    mutationFn: () => api.refresh(window === "historical" ? undefined : window),
    onMutate: () => {
      setRefreshProgress({
        phase: "fetching",
        done: 0,
        total: 100,
        label: t("refresh.phase.fetching"),
        repoCount: 0
      });
    },
    onSuccess: (result) => {
      setRefreshProgress({
        phase: "persisting",
        done: 100,
        total: 100,
        label: "Complete!",
        repoCount: result.discovered
      });
      setTimeout(() => setRefreshProgress(null), 800);
      showToast(t("toast.refreshComplete", { discovered: result.discovered, warnings: result.warnings.length }));
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["repos"] });
      void queryClient.invalidateQueries({ queryKey: ["category-counts"] });
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      void queryClient.invalidateQueries({ queryKey: ["rate-limits"] });
    },
    onError: (error) => {
      setRefreshProgress(null);
      showToast(error instanceof Error ? error.message : t("toast.refreshFailed"));
    }
  });

  // Listen for real progress events from IPC, coalescing non-terminal updates.
  useEffect(() => {
    const v2 = apiV2;
    if (!v2.onRefreshProgress) return;

    const flushProgress = () => {
      progressFrame.current = undefined;
      if (pendingProgress.current) {
        setRefreshProgress(pendingProgress.current);
        pendingProgress.current = null;
      }
    };

    const unsubscribe = v2.onRefreshProgress((data: RefreshProgress) => {
      const terminal = data.phase === "done" || data.phase === "error" || data.phase === "cancelled";
      if (terminal) {
        pendingProgress.current = null;
        if (progressFrame.current !== undefined) {
          globalThis.cancelAnimationFrame(progressFrame.current);
          progressFrame.current = undefined;
        }
        setRefreshProgress(data);
        return;
      }

      pendingProgress.current = data;
      if (progressFrame.current === undefined) {
        progressFrame.current = globalThis.requestAnimationFrame(flushProgress);
      }
    });

    return () => {
      unsubscribe();
      if (progressFrame.current !== undefined) {
        globalThis.cancelAnimationFrame(progressFrame.current);
        progressFrame.current = undefined;
      }
      pendingProgress.current = null;
    };
  }, []);

  // ── Derived state ──────────────────────────────────────────

  const records = reposQuery.data ?? [];
  const categoryCounts = categoryCountsQuery.data ?? {};
  const aiFocusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of dashboardQuery.data?.aiFocus ?? []) counts.set(item.subcategory, item.count);
    for (const record of records) {
      const key = record.classification.secondaryCategory;
      counts.set(key, Math.max(counts.get(key) ?? 0, records.filter((item) => item.classification.secondaryCategory === key).length));
    }
    return counts;
  }, [dashboardQuery.data?.aiFocus, records]);
  const totalWindowRepos = useMemo(() => {
    return Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
  }, [categoryCounts]);
  const activeFilterLabel = useMemo(() => {
    if (secondaryCategory !== "All") return `${categoryLabel("AI")} / ${subcategoryLabel(secondaryCategory)}`;
    if (category !== "All") return categoryLabel(category);
    if (search) return search;
    return "";
  }, [category, categoryLabel, search, secondaryCategory, subcategoryLabel]);
  const displayedTotalRepos = useMemo(() => {
    if (search || secondaryCategory !== "All") return records.length >= PAGE_SIZE * page ? records.length + 1 : records.length;
    if (category !== "All") return categoryCounts[category] ?? records.length;
    return totalWindowRepos || records.length;
  }, [category, categoryCounts, page, records.length, search, secondaryCategory, totalWindowRepos]);

  const selected = useMemo(
    () => records.find((record) => record.repo.id === selectedId) ?? records[0] ?? dashboardQuery.data?.hotRepos[0],
    [dashboardQuery.data?.hotRepos, records, selectedId]
  );

  useEffect(() => {
    if (records[0] && !records.some((record) => record.repo.id === selectedId)) setSelectedId(records[0].repo.id);
  }, [records, selectedId]);

  // Keep empty first-run windows user-controlled so startup never triggers network discovery automatically.
  const invalidate = () => void queryClient.invalidateQueries();

  const clearFilters = useCallback(() => {
    setCategory("All");
    setSecondaryCategory("All");
    setSearch("");
    setPage(1);
  }, []);

  const applyPrimaryFilter = useCallback((nextCategory: string) => {
    setCategory(nextCategory);
    setSecondaryCategory("All");
    setSearch("");
    setPage(1);
    setActiveModule("explorer");
  }, []);

  const applyAiSubcategory = useCallback((nextSubcategory: string, nextSearch = "") => {
    setCategory("AI");
    setSecondaryCategory(nextSubcategory);
    setSearch(nextSearch);
    setPage(1);
    setActiveModule("explorer");
  }, []);

  const applyAiFilter = useCallback((filter?: AiSidebarFilter) => {
    applyAiSubcategory(filter?.secondaryCategory ?? "All", filter?.search ?? "");
  }, [applyAiSubcategory]);

  const handleWindowChange = (nextWindow: TrendWindow) => {
    setWindow(nextWindow);
    clearFilters();
    setSelectedId("");
    setActiveModule((current) => current === "dashboard" ? "explorer" : current);
  };

  const toggleCompare = (repoId: string) => {
    setCompareIds((current) => {
      if (current.includes(repoId)) return current.filter((id) => id !== repoId);
      return [...current, repoId].slice(-5);
    });
  };

  // Handle repo selection from command palette
  const handleCommandSelect = useCallback((repoId: string) => {
    setSelectedId(repoId);
    setActiveModule("explorer");
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Command palette: Cmd/Ctrl+K or / key
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }
      // Refresh: Cmd/Ctrl+R
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        refreshMutation.mutate();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [refreshMutation]);

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="app-shell">
      {/* Custom Titlebar */}
      <TitleBar
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onRefresh={() => refreshMutation.mutate()}
        isRefreshing={refreshMutation.isPending}
      />

      <div className="workspace">
        {/* Sidebar */}
        <aside className="sidebar">
          <nav className="module-nav">
            {MODULES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={clsx("module-button", activeModule === item.id && "active")}
                  onClick={() => { setActiveModule(item.id); setPage(1); }}
                >
                  <Icon size={16} />
                  <span>{t(item.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-section">
            <div className="section-label">{t("sidebar.categories")}</div>
            <button className={clsx("category-button", category === "All" && secondaryCategory === "All" && !search && "active")} onClick={clearFilters}>
              <span>{t("common.all")}</span>
              <small>{totalWindowRepos}</small>
            </button>
            {PRIMARY_CATEGORIES.map((item) => (
              <button
                key={item}
                className={clsx("category-button", category === item && secondaryCategory === "All" && !search && "active")}
                onClick={() => applyPrimaryFilter(item)}
              >
                <span>{categoryLabel(item)}</span>
                <small>{categoryCounts[item] ?? 0}</small>
              </button>
            ))}
          </div>

          <div className="sidebar-section ai-lanes">
            <div className="section-label ai-lanes-label">
              <Brain size={12} />
              <span>{t("aiFilter.title")}</span>
            </div>
            <p className="sidebar-help">{t("aiFilter.meta")}</p>
            <button
              className={clsx("category-button ai-lane-all", category === "AI" && secondaryCategory === "All" && !search && "active")}
              onClick={() => applyAiFilter()}
            >
              <span>{t("aiFilter.all")}</span>
              <small>{categoryCounts.AI ?? 0}</small>
            </button>
            <div className="ai-lane-grid">
              {AI_SIDEBAR_FILTERS.map((filter) => {
                const count = filter.secondaryCategory ? aiFocusCounts.get(filter.secondaryCategory) ?? 0 : 0;
                const active = category === "AI" && secondaryCategory === (filter.secondaryCategory ?? "All") && search === (filter.search ?? "");
                return (
                  <button
                    key={filter.id}
                    className={clsx("ai-lane-button", filter.priority && `priority-${filter.priority}`, active && "active")}
                    onClick={() => applyAiFilter(filter)}
                    title={t(filter.hintKey)}
                  >
                    <span className="ai-lane-badge">{filter.badge}</span>
                    <span className="ai-lane-copy">
                      <strong>{t(filter.labelKey)}{filter.priority && <b className="ai-lane-priority">{t(`priority.${filter.priority}`)}</b>}</strong>
                      <em>{t(filter.hintKey)}</em>
                    </span>
                    <small>{count}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebar-footer">
            <button
              className="module-button"
              onClick={() => setCommandPaletteOpen(true)}
              title={t("search.openCommand")}
            >
              <Command size={16} />
              <span>{t("search.openCommand")}</span>
              <kbd className="kbd-hint" style={{ marginLeft: "auto" }}>/</kbd>
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="main-surface">
          <StatusBar
            updatedAt={dashboardQuery.data?.updatedAt}
            sources={sourcesQuery.data?.length ?? 0}
            storagePath={settingsQuery.data?.storagePath}
            toast={toast}
            refreshProgress={refreshProgress}
            isRefreshing={refreshMutation.isPending}
            onCancelRefresh={() => {
              apiV2.cancelRefresh();
              setRefreshProgress(null);
              showToast(t("refresh.cancelled"));
            }}
          />

          {activeModule === "dashboard" && (
            <Dashboard
              records={dashboardQuery.data?.hotRepos ?? records}
              summary={dashboardQuery.data}
              onSelect={(record) => setSelectedId(record.repo.id)}
              onOpenExternal={(url) => void api.openExternal(url)}
              onModule={setActiveModule}
            />
          )}
          {activeModule === "explorer" && (
            <TrendingExplorer
              records={records}
              totalCount={displayedTotalRepos}
              loading={reposQuery.isFetching && !reposQuery.data}
              selectedId={selected?.repo.id}
              onSelect={(record) => setSelectedId(record.repo.id)}
              onOpenExternal={(url) => void api.openExternal(url)}
              compareIds={compareIds}
              onToggleCompare={toggleCompare}
              window={window}
              onWindowChange={handleWindowChange}
              page={page}
              setPage={setPage}
              activeFilterLabel={activeFilterLabel}
              onClearFilters={clearFilters}
            />
          )}
          {activeModule === "categories" && (
            <CategoryIntelligence
              records={records}
              onSelect={(record) => setSelectedId(record.repo.id)}
              onOpenExternal={(url) => void api.openExternal(url)}
              onOpenExplorer={(nextCategory) => applyPrimaryFilter(nextCategory)}
              onOpenAiSubcategory={(nextSubcategory) => applyAiSubcategory(nextSubcategory)}
            />
          )}
          {activeModule === "collections" && (
            <CollectionsPanel
              records={records}
              onSelect={(record) => setSelectedId(record.repo.id)}
              onOpenExternal={(url) => void api.openExternal(url)}
            />
          )}
          {activeModule === "compare" && (
            <Compare records={records} compareIds={compareIds} onToggleCompare={toggleCompare} onSelect={(record) => setSelectedId(record.repo.id)} onOpenExternal={(url) => void api.openExternal(url)} />
          )}
          {activeModule === "learning" && (
            <LearningHub records={records} onSelect={(record) => setSelectedId(record.repo.id)} onOpenExternal={(url) => void api.openExternal(url)} onExport={async () => {
              const markdown = await api.exportLearningMarkdown();
              await navigator.clipboard?.writeText(markdown).catch(() => undefined);
              showToast(t("toast.learningCopied"));
            }} />
          )}
          {activeModule === "alerts" && <Alerts onSaved={() => showToast(t("toast.alertSaved"))} />}
          {activeModule === "sources" && <DataSources sources={sourcesQuery.data ?? []} rateLimits={rateLimitsQuery.data ?? []} />}
          {activeModule === "classifier" && selected && (
            <ClassifierLab record={selected} onSaved={invalidate} />
          )}
          {activeModule === "settings" && settingsQuery.data && (
            <SettingsPanel settings={settingsQuery.data} onSaved={(next) => {
              queryClient.setQueryData(["settings"], next);
              showToast(t("toast.settingsSaved"));
            }} />
          )}
        </main>

        {/* Detail Drawer */}
        <RepoDrawer
          record={selected}
          compareSelected={Boolean(selected && compareIds.includes(selected.repo.id))}
          onOpenExternal={(url) => void api.openExternal(url)}
          onToggleCollection={async (repoId) => {
            await api.toggleCollection(repoId, "backlog");
            invalidate();
          }}
          onToggleCompare={toggleCompare}
          onSaveNote={async (repoId, markdown, tags, status) => {
            await api.saveNote(repoId, markdown, tags, status);
            invalidate();
            showToast(t("toast.noteSaved"));
          }}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className="toast-container">
          <div className="toast-item">
            <Sparkles size={14} />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Command Palette */}
      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onSelect={handleCommandSelect}
      />
    </div>
  );
}

// ── TitleBar Component ────────────────────────────────────────

function BrandLogo() {
  const [failed, setFailed] = useState(false);
  return (
    <span className="titlebar-logo-wrap" aria-hidden="true">
      {!failed && <img className="titlebar-logo" src={LOGO_SRC} alt="" onError={() => setFailed(true)} />}
      <span className={clsx("titlebar-logo-fallback", !failed && "under-image")}>GR</span>
    </span>
  );
}

function TitleBar({ theme, onToggleTheme, onOpenCommandPalette, onRefresh, isRefreshing }: {
  theme: Theme;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const { t, locale, setLocale } = useI18n();
  const { windowControls } = apiV2;
  const [isMaximized, setIsMaximized] = useState(false);
  const showWindowControls = windowControls.platform !== "darwin";

  useEffect(() => {
    if (!showWindowControls) return;
    let mounted = true;
    void windowControls.isMaximized()
      .then((value) => {
        if (mounted) setIsMaximized(Boolean(value));
      })
      .catch(() => {});
    const unsubscribe = windowControls.onMaximizedChange((value) => setIsMaximized(value));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [showWindowControls, windowControls]);

  const toggleMaximize = async () => {
    const nextState = await windowControls.toggleMaximize().catch(() => isMaximized);
    setIsMaximized(Boolean(nextState));
  };

  return (
    <header className="titlebar" style={{ WebkitAppRegion: "drag" } as CSSProperties}>
      <div className="titlebar-left">
        <div className="titlebar-brand">
          <BrandLogo />
          <span className="titlebar-title">{APP_NAME}</span>
        </div>
        <span className="titlebar-subtitle">{t("app.subtitle")}</span>
      </div>
      <div className="titlebar-right">
        <div className="titlebar-actions">
          <button className="btn btn--ghost btn--xs" type="button" onClick={onOpenCommandPalette} title={t("search.openCommand")}>
            <Search size={14} />
            <kbd className="kbd-hint" style={{ fontSize: 9, height: 16, minWidth: 14, padding: "0 3px" }}>/</kbd>
          </button>
          <LanguageToggle locale={locale} onChange={setLocale} label={t("language.label")} />
          <button className="btn btn--ghost btn--xs" type="button" onClick={onToggleTheme} title={t("action.theme")}>
            {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <button
            className="btn btn--solid btn--xs"
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            title={t("action.refreshTitle")}
          >
            <RefreshCw size={13} className={clsx(isRefreshing && "spin")} />
            <span>{isRefreshing ? t("action.refreshing") : t("action.refresh")}</span>
          </button>
        </div>
        {showWindowControls && (
          <div className="titlebar-window-controls" aria-label={t("windowControl.group")}>
            <button
              className="window-control"
              type="button"
              title={t("windowControl.minimize")}
              aria-label={t("windowControl.minimize")}
              onClick={() => void windowControls.minimize()}
            >
              <Minus size={14} />
            </button>
            <button
              className="window-control"
              type="button"
              title={isMaximized ? t("windowControl.restore") : t("windowControl.maximize")}
              aria-label={isMaximized ? t("windowControl.restore") : t("windowControl.maximize")}
              onClick={() => void toggleMaximize()}
            >
              {isMaximized ? <Copy size={13} /> : <Square size={12} />}
            </button>
            <button
              className="window-control window-control--close"
              type="button"
              title={t("windowControl.close")}
              aria-label={t("windowControl.close")}
              onClick={() => void windowControls.close()}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

// ── Segmented Window ─────────────────────────────────────────

function SegmentedWindow({ value, onChange }: { value: TrendWindow; onChange: (value: TrendWindow) => void }) {
  const { windowLabel } = useI18n();
  return (
    <div className="segmented" role="tablist">
      {TREND_WINDOWS.map((item) => (
        <button key={item.id} className={clsx(value === item.id && "active")} onClick={() => onChange(item.id)}>
          {windowLabel(item.id)}
        </button>
      ))}
    </div>
  );
}

// ── Language Toggle ───────────────────────────────────────────

function LanguageToggle({ locale, onChange, label }: { locale: "en" | "zh"; onChange: (locale: "en" | "zh") => void; label: string }) {
  return (
    <div className="language-toggle" aria-label={label}>
      <button className={clsx(locale === "en" && "active")} onClick={() => onChange("en")} type="button">EN</button>
      <button className={clsx(locale === "zh" && "active")} onClick={() => onChange("zh")} type="button">中</button>
    </div>
  );
}

// ── Status Bar ────────────────────────────────────────────────

function StatusBar({ updatedAt, sources, storagePath, toast, refreshProgress, isRefreshing, onCancelRefresh }: {
  updatedAt?: string;
  sources: number;
  storagePath?: string;
  toast: string;
  refreshProgress: RefreshProgress | null;
  isRefreshing: boolean;
  onCancelRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="status-bar">
      {isRefreshing && refreshProgress ? (
        <div className="refresh-progress">
          <Loader2 size={13} className="spin" />
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(refreshProgress.done / Math.max(refreshProgress.total, 1)) * 100}%` }} />
          </div>
          <span className="progress-label">{refreshProgress.label}</span>
          <button className="btn btn--ghost btn--xs" onClick={onCancelRefresh} title={t("refresh.cancel")}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <>
          <span><Activity size={13} /> {t("status.lastUpdate", { value: updatedAt ? timeAgo(updatedAt, locale, t) : t("common.pending") })}</span>
          <span><Database size={13} /> {t("common.sources", { count: sources })}</span>
          <span className="truncate"><ShieldCheck size={13} /> {storagePath ?? t("common.localSQLite")}</span>
        </>
      )}
      {toast && <strong>{toast}</strong>}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────

function Dashboard({ records, summary, onSelect, onOpenExternal, onModule }: {
  records: RepoRecord[];
  summary?: Awaited<ReturnType<typeof api.getDashboard>>;
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
  onModule: (module: ModuleId) => void;
}) {
  const { t, locale, categoryLabel, subcategoryLabel } = useI18n();
  const top = records[0];
  const isEmpty = records.length === 0;
  const focusCountBySubcategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of summary?.aiFocus ?? []) counts.set(item.subcategory, item.count);
    return counts;
  }, [summary?.aiFocus]);
  const priorityLanes = AI_SIDEBAR_FILTERS
    .filter((filter) => filter.priority)
    .map((filter) => ({ ...filter, count: filter.secondaryCategory ? focusCountBySubcategory.get(filter.secondaryCategory) ?? 0 : 0 }))
    .sort((a, b) => b.count - a.count || (a.priority === "hot" ? -1 : 1))
    .slice(0, 6);

  if (isEmpty) {
    return (
      <section className="page-grid">
        <div className="hero-panel">
          <div>
            <p className="eyebrow">{t("dashboard.todayFocus")}</p>
            <h2>{t("dashboard.readyTitle")}</h2>
            <p>{t("dashboard.readyBody")}</p>
          </div>
          <div className="hero-score">
            <strong>0</strong>
            <span>{t("dashboard.rankingScore")}</span>
          </div>
        </div>
        <div className="empty-state">
          <Inbox size={40} />
          <h3>{t("dashboard.readyTitle")}</h3>
          <p>{t("dashboard.readyBody")}</p>
          <div className="quick-actions">
            <button className="quick-action-btn" onClick={() => onModule("sources")}>
              <Database size={14} /> {t("module.sources")}
            </button>
            <button className="quick-action-btn" onClick={() => onModule("settings")}>
              <SettingsIcon size={14} /> {t("module.settings")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="page-grid">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">{t("dashboard.todayFocus")}</p>
          <h2>{top?.repo.fullName ?? t("dashboard.readyTitle")}</h2>
          <p>{top?.repo.description ?? t("dashboard.readyBody")}</p>
          <div className="quick-actions">
            <button className="quick-action-btn" onClick={() => onModule("explorer")}>
              <Sparkles size={14} /> {t("module.explorer")}
            </button>
            <button className="quick-action-btn" onClick={() => onModule("categories")}>
              <Boxes size={14} /> {t("module.categories")}
            </button>
            <button className="quick-action-btn" onClick={() => onModule("compare")}>
              <GitCompare size={14} /> {t("module.compare")}
            </button>
          </div>
        </div>
        <div className="hero-score">
          <strong>{top ? Math.round(top.ranking.score) : 0}</strong>
          <span>{t("dashboard.rankingScore")}</span>
        </div>
      </div>

      <div className="metric-grid">
        <Metric label={t("dashboard.trackedRepos")} value={summary?.totalRepos ?? records.length} icon={Star} />
        <Metric label={t("dashboard.dataSources")} value={summary?.totalSources ?? 5} icon={Database} />
        <Metric label={t("dashboard.aiHits")} value={records.filter((item) => item.classification.primaryCategory === "AI").length} icon={Brain} />
        <Metric label={t("dashboard.anomalyWatch")} value={summary?.anomalies.length ?? 0} icon={AlertTriangle} />
      </div>

      <section className="panel wide priority-panel">
        <PanelHeader title={t("dashboard.priorityMap")} meta={t("dashboard.priorityMeta")} action={t("module.categories")} onAction={() => onModule("categories")} />
        <div className="priority-lane-grid">
          {priorityLanes.map((lane) => (
            <button key={lane.id} className={clsx("priority-lane-card", lane.priority && `priority-${lane.priority}`)} onClick={() => onModule("categories")}>
              <span className="ai-lane-badge">{lane.badge}</span>
              <strong>{t(lane.labelKey)}</strong>
              <small>{t(lane.hintKey)}</small>
              <b>{lane.count}</b>
            </button>
          ))}
        </div>
      </section>

      {summary?.topInsights?.length ? (
        <section className="panel wide">
          <PanelHeader title={t("dashboard.keyInsights")} meta={t("dashboard.keyInsightsMeta")} />
          <div className="insight-grid">
            {summary.topInsights.map((insight) => (
              <button key={insight.id} className={clsx("insight-card", insight.severity)} onClick={() => {
                if (insight.repoId) {
                  const record = records.find((item) => item.repo.id === insight.repoId) ?? summary.hotRepos.find((item) => item.repo.id === insight.repoId);
                  if (record) onSelect(record);
                }
                if (insight.actionModule) onModule(insight.actionModule as ModuleId);
              }}>
                <span>{t(`insight.${insight.kind}`)}</span>
                <strong>{insight.title}</strong>
                <small>{insight.description}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {summary?.aiFocus?.length ? (
        <section className="panel">
          <PanelHeader title={t("dashboard.aiFocus")} action={t("module.categories")} onAction={() => onModule("categories")} />
          <div className="focus-list">
            {summary.aiFocus.slice(0, 5).map((item) => (
              <button key={item.subcategory} className="focus-row" onClick={() => item.topRepo && onSelect(item.topRepo)}>
                <span>{subcategoryLabel(item.subcategory)}</span>
                <strong>{item.count}</strong>
                <small>{item.topRepo?.repo.fullName ?? item.topTags.join(", ")}</small>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {summary?.topicHighlights?.length ? (
        <section className="panel">
          <PanelHeader title={t("dashboard.topicHighlights")} />
          <div className="topic-cloud">
            {summary.topicHighlights.slice(0, 12).map((topic) => (
              <span key={topic.label} className="topic-chip" title={topic.sampleRepo}>{topic.label}<strong>{topic.count}</strong></span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel wide">
        <PanelHeader title={t("dashboard.hotRepos")} action={t("module.explorer")} onAction={() => onModule("explorer")} />
        <RepoList records={records.slice(0, 8)} onSelect={onSelect} onOpenExternal={onOpenExternal} />
      </section>

      <section className="panel">
        <PanelHeader title={t("dashboard.categoryLeaders")} />
        <div className="stack-list">
          {summary?.categoryLeaders.slice(0, 8).map((leader) => (
            <button key={leader.category} className="stack-row" onClick={() => leader.topRepo && onSelect(leader.topRepo)}>
              <span>{categoryLabel(leader.category)}</span>
              <strong>{leader.count}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <PanelHeader title={t("dashboard.sourceHealth")} action={t("module.sources")} onAction={() => onModule("sources")} />
        <div className="source-mini">
          {summary?.health.slice(0, 5).map((source) => (
            <span key={source.id} className={clsx("health-pill", source.status)}>{source.label}</span>
          ))}
        </div>
        {summary?.latestJob && (
          <div className="job-mini">
            <MetricLine label={t("dashboard.latestJob")} value={summary.latestJob.status} />
            <MetricLine label={t("dashboard.discovered")} value={formatNumber(summary.latestJob.discovered, locale)} />
            <MetricLine label={t("dashboard.steps")} value={String(summary.latestJob.steps.length)} />
          </div>
        )}
      </section>
    </section>
  );
}

// ── Trending Explorer ─────────────────────────────────────────

function TrendingExplorer({ records, totalCount, loading, selectedId, compareIds, onSelect, onOpenExternal, onToggleCompare, window, onWindowChange, page, setPage, activeFilterLabel, onClearFilters }: {
  records: RepoRecord[];
  totalCount: number;
  loading: boolean;
  selectedId?: string;
  compareIds: string[];
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
  onToggleCompare: (repoId: string) => void;
  window: TrendWindow;
  onWindowChange: (w: TrendWindow) => void;
  page: number;
  setPage: (page: number) => void;
  activeFilterLabel?: string;
  onClearFilters: () => void;
}) {
  const { t, locale, categoryLabel, subcategoryLabel } = useI18n();
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const pagedRecords = records.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section className="panel full">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, gap: 12 }}>
        <div>
          <PanelHeader title={t("explorer.title")} meta={t("common.repositories", { count: totalCount })} />
          {activeFilterLabel && (
            <button className="active-filter-pill" type="button" onClick={onClearFilters} title={t("filter.clear")}>
              <Tag size={12} />
              <span>{t("filter.active")}: {activeFilterLabel}</span>
              <X size={12} />
            </button>
          )}
        </div>
        <SegmentedWindow value={window} onChange={onWindowChange} />
      </div>
      <div className="table-wrap">
        <table className="repo-table">
          <thead>
            <tr>
              <th>{t("table.rank")}</th>
              <th>{t("table.repository")}</th>
              <th>{t("table.category")}</th>
              <th>{t("table.stars")}</th>
              <th>{t("table.growth")}</th>
              <th>{t("table.score")}</th>
              <th>{t("table.sources")}</th>
              <th>{t("table.compare")}</th>
            </tr>
          </thead>
          {loading ? (
            <SkeletonRow />
          ) : (
            <tbody>
              {!loading && pagedRecords.length === 0 && (
                <tr><td colSpan={8}>
                  <div className="empty-state">
                    <Search size={32} />
                    <h3>{t("explorer.title")}</h3>
                    <p>{t("search.placeholder")}</p>
                  </div>
                </td></tr>
              )}
              {pagedRecords.map((record, index) => (
                <tr key={record.repo.id} className={clsx(selectedId === record.repo.id && "selected")} onClick={() => onSelect(record)}>
                  <td>{(page - 1) * PAGE_SIZE + index + 1}</td>
                  <td>
                    <button className="repo-link" onClick={(event) => {
                      event.stopPropagation();
                      onOpenExternal(record.repo.url);
                    }} title={t("action.openGithub")}>
                      <strong>{record.repo.fullName}</strong>
                      <ExternalLink size={12} />
                    </button>
                    <small>{record.repo.description}</small>
                  </td>
                  <td><TagPill label={`${categoryLabel(record.classification?.primaryCategory ?? "Other")} / ${subcategoryLabel(record.classification?.secondaryCategory ?? "Unclassified")}`} /></td>
                  <td>{formatNumber(record.repo.stars, locale)}</td>
                  <td>+{formatNumber(maxGrowth(record), locale)}</td>
                  <td>{(record.ranking?.score ?? 0).toFixed(1)}</td>
                  <td>{(record.ranking?.sourceBreakdown?.length ?? 0) || new Set((record.observations ?? []).filter((item) => item.window === record.ranking?.window).map((item) => item.source)).size}</td>
                  <td>
                    <button className={clsx("mini-icon", compareIds.includes(record.repo.id) && "active")} onClick={(event) => {
                      event.stopPropagation();
                      onToggleCompare(record.repo.id);
                    }} title={t("action.addToCompare")}>
                      <GitCompare size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {/* Pagination */}
      {totalCount > PAGE_SIZE && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft size={14} /> {t("pagination.prev")}
          </button>
          <span>{t("pagination.page", { page })}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            {t("pagination.next")} <ChevronRight size={14} />
          </button>
        </div>
      )}
    </section>
  );
}


// ── Category Intelligence ─────────────────────────────────────

function CategoryIntelligence({ records, onSelect, onOpenExternal, onOpenExplorer, onOpenAiSubcategory }: {
  records: RepoRecord[];
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
  onOpenExplorer: (category: string) => void;
  onOpenAiSubcategory: (subcategory: string) => void;
}) {
  const { t, categoryLabel, subcategoryLabel } = useI18n();
  const groups = PRIMARY_CATEGORIES.map((cat) => {
    const items = records.filter((record) => record.classification.primaryCategory === cat);
    return { category: cat, items, top: items[0] };
  }).filter((group) => group.items.length);
  const aiBreakdown = AI_SUBCATEGORIES.map((subcategory) => {
    const items = records.filter((record) => record.classification.secondaryCategory === subcategory);
    return { subcategory, count: items.length, top: items[0], tags: collectTopTags(items, 3) };
  }).filter((item) => item.count);
  const topTopics = collectTopTags(records, 12);

  return (
    <section className="page-grid">
      <div className="panel wide">
        <PanelHeader title={t("categories.title")} meta={t("categories.meta")} />
        <div className="category-grid">
          {groups.map((group) => (
            <button key={group.category} className="category-card" onClick={() => onOpenExplorer(group.category)}>
              <span>{categoryLabel(group.category)}</span>
              <strong>{group.items.length}</strong>
              <small>{group.top?.repo.fullName}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="panel wide">
        <PanelHeader title={t("categories.aiSubcategories")} meta={t("categories.aiMeta")} />
        <div className="subcategory-grid">
          {aiBreakdown.map((item) => (
            <button key={item.subcategory} className="subcategory-card" onClick={() => onOpenAiSubcategory(item.subcategory)}>
              <span>{subcategoryLabel(item.subcategory)}</span>
              <strong>{item.count}</strong>
              <small>{item.top?.repo.fullName ?? item.tags.join(", ")}</small>
              <div className="tag-row compact">{item.tags.map((tag) => <TagPill key={tag} label={tag} />)}</div>
            </button>
          ))}
        </div>
      </div>
      <div className="panel">
        <PanelHeader title={t("categories.topicSignals")} />
        <div className="topic-cloud">
          {topTopics.map((tag) => <span key={tag} className="topic-chip">{tag}</span>)}
        </div>
      </div>
      <div className="panel wide">
        <PanelHeader title={t("categories.topProjects")} />
        <RepoList records={records.slice(0, 10)} onSelect={onSelect} onOpenExternal={onOpenExternal} />
      </div>
    </section>
  );
}

// ── Collections Panel ─────────────────────────────────────────

function CollectionsPanel({ records, onSelect, onOpenExternal }: {
  records: RepoRecord[];
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
}) {
  const { t } = useI18n();
  const collected = records.filter((record) => record.collection || record.note);

  return (
    <section className="panel full">
      <PanelHeader title={t("sidebar.collections")} meta={t("common.saved", { count: collected.length })} />
      {collected.length > 0 ? (
        <RepoList records={collected} onSelect={onSelect} onOpenExternal={onOpenExternal} />
      ) : (
        <div className="empty-state">
          <Heart size={36} style={{ opacity: 0.4 }} />
          <h3>{t("sidebar.collections")}</h3>
          <p>{t("drawer.notePlaceholder")}</p>
        </div>
      )}
    </section>
  );
}

// ── Compare ───────────────────────────────────────────────────

function Compare({ records, compareIds, onToggleCompare, onSelect, onOpenExternal }: {
  records: RepoRecord[];
  compareIds: string[];
  onToggleCompare: (repoId: string) => void;
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
}) {
  const { t, locale } = useI18n();
  const selected = compareIds.length
    ? records.filter((record) => compareIds.includes(record.repo.id))
    : records.slice(0, 5);
  return (
    <section className="panel full">
      <PanelHeader title={t("compare.title")} meta={t("compare.meta")} />
      <div className="compare-grid">
        {selected.map((record) => (
          <article key={record.repo.id} className="compare-column" onClick={() => onSelect(record)}>
            <button className="mini-icon corner" onClick={(event) => {
              event.stopPropagation();
              onToggleCompare(record.repo.id);
            }}><GitCompare size={14} /></button>
            <button className="repo-link" onClick={(event) => {
              event.stopPropagation();
              onOpenExternal(record.repo.url);
            }} title={t("action.openGithub")}>
              <h3>{record.repo.name}</h3>
              <ExternalLink size={12} />
            </button>
            <p>{record.repo.owner}</p>
            <MetricLine label={t("metric.stars")} value={formatNumber(record.repo.stars, locale)} />
            <MetricLine label={t("metric.forks")} value={formatNumber(record.repo.forks, locale)} />
            <MetricLine label={t("metric.growth")} value={`+${formatNumber(maxGrowth(record), locale)}`} />
            <MetricLine label={t("metric.license")} value={record.repo.license} />
            <MetricLine label={t("metric.categoryFit")} value={`${Math.round(record.classification.confidence * 100)}%`} />
            <Sparkline record={record} />
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Learning Hub ──────────────────────────────────────────────

function LearningHub({ records, onSelect, onOpenExternal, onExport }: { records: RepoRecord[]; onSelect: (record: RepoRecord) => void; onOpenExternal: (url: string) => void; onExport: () => void }) {
  const { t } = useI18n();
  const saved = records.filter((record) => record.collection || record.note);
  return (
    <section className="panel full">
      <PanelHeader title={t("learning.title")} meta={t("common.saved", { count: saved.length })} action={t("action.export")} onAction={onExport} />
      <RepoList records={(saved.length ? saved : records.slice(0, 10))} onSelect={onSelect} onOpenExternal={onOpenExternal} />
    </section>
  );
}

// ── Alerts ────────────────────────────────────────────────────

function Alerts({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<"category" | "keyword" | "repository">("category");
  const [query, setQuery] = useState("AI");
  return (
    <section className="panel full narrow-content">
      <PanelHeader title={t("alerts.title")} meta={t("alerts.meta")} />
      <label>{t("alerts.kind")}</label>
      <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
        <option value="category">{t("alerts.category")}</option>
        <option value="keyword">{t("alerts.keyword")}</option>
        <option value="repository">{t("alerts.repository")}</option>
      </select>
      <label>{t("alerts.query")}</label>
      <input value={query} onChange={(event) => setQuery(event.target.value)} />
      <button className="icon-button primary" onClick={async () => {
        await api.saveAlert({ kind, query, enabled: true });
        onSaved();
      }}>
        <Bell size={15} /> {t("action.saveAlert")}
      </button>
    </section>
  );
}

// ── Data Sources ──────────────────────────────────────────────

function DataSources({ sources, rateLimits }: {
  sources: Awaited<ReturnType<typeof api.getSources>>;
  rateLimits: Awaited<ReturnType<typeof api.getRateLimits>>;
}) {
  const { t } = useI18n();
  return (
    <section className="source-page">
      <div className="source-grid">
        {sources.map((source) => {
          const limits = rateLimits.filter((limit) => limit.source.includes(source.label) || source.label.includes(limit.source));
          return (
            <article key={source.id} className="panel source-card">
              <div className="source-card-head">
                <Database size={16} />
                <strong>{source.label}</strong>
                <span className={clsx("health-dot", source.status)} />
              </div>
              <p>{source.message}</p>
              <MetricLine label={t("source.weight")} value={source.weight.toFixed(2)} />
              <MetricLine label={t("source.coverage")} value={`${Math.round(source.coverage * 100)}%`} />
              <MetricLine label={t("source.configured")} value={source.configured ? t("common.yes") : t("common.no")} />
              {limits.map((limit) => (
                <MetricLine
                  key={`${limit.source}:${limit.resource}`}
                  label={t("source.limit", { resource: limit.resource })}
                  value={limit.remaining === undefined ? limit.status : `${limit.remaining}/${limit.limit ?? "?"}`}
                />
              ))}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// ── Classifier Lab ────────────────────────────────────────────

function ClassifierLab({ record, onSaved }: { record: RepoRecord; onSaved: () => void }) {
  const { t, categoryLabel } = useI18n();
  const [primary, setPrimary] = useState<PrimaryCategory>(record.classification.primaryCategory);
  const [secondary, setSecondary] = useState(record.classification.secondaryCategory);
  const [tags, setTags] = useState(record.classification.tags.join(", "));
  const [reason, setReason] = useState(record.classification.reason);

  useEffect(() => {
    setPrimary(record.classification.primaryCategory);
    setSecondary(record.classification.secondaryCategory);
    setTags(record.classification.tags.join(", "));
    setReason(record.classification.reason);
  }, [record]);

  return (
    <section className="panel full classifier-lab">
      <PanelHeader title={t("classifier.title")} meta={record.repo.fullName} />
      <div className="classifier-layout">
        <div>
          <h3>{t("classifier.evidence")}</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.55 }}>{record.repo.description}</p>
          <div className="tag-row">{record.repo.topics.map((topic) => <TagPill key={topic} label={topic} />)}</div>
          <ul className="evidence-list">
            {record.classification.evidence.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <form onSubmit={async (event) => {
          event.preventDefault();
          await api.overrideClassification({
            repoId: record.repo.id,
            primaryCategory: primary,
            secondaryCategory: secondary,
            tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            reason
          });
          onSaved();
        }}>
          <label>{t("classifier.primary")}</label>
          <select value={primary} onChange={(event) => setPrimary(event.target.value as PrimaryCategory)}>
            {PRIMARY_CATEGORIES.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}
          </select>
          <label>{t("classifier.secondary")}</label>
          <input value={secondary} onChange={(event) => setSecondary(event.target.value)} />
          <label>{t("classifier.tags")}</label>
          <input value={tags} onChange={(event) => setTags(event.target.value)} />
          <label>{t("classifier.reason")}</label>
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={5} />
          <button className="icon-button primary"><Save size={15} /> {t("action.saveOverride")}</button>
        </form>
      </div>
    </section>
  );
}

// ── Settings Panel ────────────────────────────────────────────

function SettingsField({ label, help, children }: { label: string; help: string; children: ReactNode }) {
  return (
    <label>
      <span>{label}</span>
      {children}
      <small className="field-help">{help}</small>
    </label>
  );
}

function SettingsPanel({ settings, onSaved }: { settings: Settings; onSaved: (settings: Settings) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(settings);
  const [connectionMessage, setConnectionMessage] = useState("");
  useEffect(() => setForm(settings), [settings]);
  const set = (key: keyof Settings, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const setNumber = (key: "cacheTtlHours" | "maxReposPerWindow", value: string) => {
    const parsed = Number(value);
    setForm((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : current[key] }));
  };
  const validate = () => {
    const errors: string[] = [];
    if (!/^\d{2}:\d{2}$/.test(form.refreshTime)) errors.push(t("settings.validation.refreshTime"));
    if (form.cacheTtlHours < 1 || form.cacheTtlHours > 72) errors.push(t("settings.validation.cacheTtl"));
    if (form.maxReposPerWindow < 20 || form.maxReposPerWindow > 500) errors.push(t("settings.validation.maxRepos"));
    for (const [key, value] of [["aiBaseUrl", form.aiBaseUrl], ["proxyUrl", form.proxyUrl]] as const) {
      if (!value) continue;
      try { new URL(value); } catch { errors.push(t(`settings.validation.${key}`)); }
    }
    return errors;
  };
  const testConnection = async (kind: "github" | "ai") => {
    try {
      const result = await api.testConnection(kind);
      const status = result?.ok ? t("connection.success") : t("connection.degraded");
      setConnectionMessage(`${status}: ${result?.message ?? t("connection.unavailable")}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setConnectionMessage(`${t("connection.unavailable")} ${message}`);
    }
  };
  const save = async () => {
    const errors = validate();
    if (errors.length) {
      setConnectionMessage(errors.join(" "));
      return;
    }
    onSaved(await api.updateSettings(form));
  };

  return (
    <section className="panel full settings-form">
      <PanelHeader title={t("settings.title")} meta={t("settings.meta")} />

      <div className="settings-section">
        <h3>{t("settings.section.sources")}</h3>
        <p>{t("settings.section.sourcesHelp")}</p>
        <div className="settings-grid">
          <SettingsField label={t("settings.githubToken")} help={t("settings.help.githubToken")}><input type="password" value={form.githubToken} onChange={(event) => set("githubToken", event.target.value)} placeholder={t("settings.githubTokenPlaceholder")} /></SettingsField>
          <SettingsField label={t("settings.bigQueryProjectId")} help={t("settings.help.bigQuery")}><input value={form.bigQueryProjectId} onChange={(event) => set("bigQueryProjectId", event.target.value)} /></SettingsField>
          <SettingsField label={t("settings.proxyUrl")} help={t("settings.help.proxy")}><input value={form.proxyUrl} onChange={(event) => set("proxyUrl", event.target.value)} /></SettingsField>
          <SettingsField label={t("settings.cacheTtlHours")} help={t("settings.help.cacheTtl")}><input type="number" min={1} max={72} value={form.cacheTtlHours} onChange={(event) => setNumber("cacheTtlHours", event.target.value)} /></SettingsField>
          <SettingsField label={t("settings.maxReposPerWindow")} help={t("settings.help.maxRepos")}><input type="number" min={20} max={500} value={form.maxReposPerWindow} onChange={(event) => setNumber("maxReposPerWindow", event.target.value)} /></SettingsField>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("settings.section.ai")}</h3>
        <p>{t("settings.section.aiHelp")}</p>
        <div className="settings-grid">
          <SettingsField label={t("settings.aiApiKey")} help={t("settings.help.aiKey")}><input type="password" value={form.aiApiKey} onChange={(event) => set("aiApiKey", event.target.value)} placeholder={t("settings.aiKeyPlaceholder")} /></SettingsField>
          <SettingsField label={t("settings.aiBaseUrl")} help={t("settings.help.aiBaseUrl")}><input value={form.aiBaseUrl} onChange={(event) => set("aiBaseUrl", event.target.value)} /></SettingsField>
          <SettingsField label={t("settings.aiModel")} help={t("settings.help.aiModel")}><input value={form.aiModel} onChange={(event) => set("aiModel", event.target.value)} /></SettingsField>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("settings.section.refresh")}</h3>
        <p>{t("settings.section.refreshHelp")}</p>
        <div className="settings-grid">
          <SettingsField label={t("settings.refreshTime")} help={t("settings.help.refreshTime")}><input type="time" value={form.refreshTime} onChange={(event) => set("refreshTime", event.target.value)} /></SettingsField>
          <SettingsField label={t("settings.timezone")} help={t("settings.help.timezone")}><input value={form.timezone} onChange={(event) => set("timezone", event.target.value)} /></SettingsField>
        </div>
        <div className="switch-row">
          <label><input type="checkbox" checked={form.backgroundRefresh} onChange={(event) => set("backgroundRefresh", event.target.checked)} /> {t("settings.backgroundRefresh")}</label>
          <label><input type="checkbox" checked={form.startAtLogin} onChange={(event) => set("startAtLogin", event.target.checked)} /> {t("settings.startAtLogin")}</label>
          <label><input type="checkbox" checked={form.enableNotifications} onChange={(event) => set("enableNotifications", event.target.checked)} /> {t("settings.notifications")}</label>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("settings.section.storage")}</h3>
        <p>{t("settings.section.storageHelp")}</p>
        <div className="settings-grid">
          <SettingsField label={t("settings.storagePath")} help={t("settings.help.storagePath")}><input value={form.storagePath} readOnly /></SettingsField>
          <SettingsField label={t("settings.backupPath")} help={t("settings.help.backupPath")}><input value={form.backupPath} onChange={(event) => set("backupPath", event.target.value)} placeholder={t("settings.backupPathPlaceholder")} /></SettingsField>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("settings.section.project")}</h3>
        <div className="settings-status-grid">
          <div className="settings-status-card"><span>{t("settings.appVersion")}</span><strong>{APP_VERSION}</strong><small>{t("settings.versionLocked")}</small></div>
          <div className="settings-status-card"><span>{t("settings.releaseOutput")}</span><strong>release/</strong><small>{t("settings.releaseOutputHelp")}</small></div>
          <div className="settings-status-card"><span>{t("settings.storagePath")}</span><strong>{form.storagePath || t("common.localSQLite")}</strong><small>{t("settings.localFirst")}</small></div>
        </div>
      </div>

      {connectionMessage && <p className="settings-message">{connectionMessage}</p>}
      <div className="settings-actions">
        <button className="icon-button" type="button" onClick={() => void testConnection("github")}>
          <ShieldCheck size={15} /> {t("action.testGithub")}
        </button>
        <button className="icon-button" type="button" onClick={() => void testConnection("ai")}>
          <Brain size={15} /> {t("action.testAi")}
        </button>
        <button className="icon-button" type="button" onClick={async () => {
          const path = await api.backupData();
          setConnectionMessage(t("toast.backupCreated", { path }));
        }}>
          <Download size={15} /> {t("action.backupData")}
        </button>
        <button className="icon-button primary" type="button" onClick={() => void save()}>
          <Save size={15} /> {t("action.saveSettings")}
        </button>
      </div>
    </section>
  );
}

// ── Repo Drawer ───────────────────────────────────────────────

function RepoDrawer({ record, compareSelected, onOpenExternal, onToggleCollection, onToggleCompare, onSaveNote }: {
  record?: RepoRecord;
  compareSelected: boolean;
  onOpenExternal: (url: string) => void;
  onToggleCollection: (repoId: string) => void;
  onToggleCompare: (repoId: string) => void;
  onSaveNote: (repoId: string, markdown: string, tags: string[], status: RepoStatus) => void;
}) {
  const { t, locale, categoryLabel, subcategoryLabel, statusLabel } = useI18n();
  const [note, setNote] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [status, setStatus] = useState<RepoStatus>("backlog");
  useEffect(() => {
    setNote(record?.note?.markdown ?? "");
    setNoteTags(record?.note?.tags.join(", ") ?? "");
    setStatus(record?.note?.status ?? record?.collection?.status ?? "backlog");
  }, [record]);

  if (!record) {
    return (
      <aside className="detail-drawer empty">
        <div className="empty-state">
          <Heart size={36} style={{ opacity: 0.4 }} />
          <h3>{t("drawer.empty")}</h3>
          <p>{t("drawer.notePlaceholder")}</p>
          <div style={{ display: "flex", gap: "4px", marginTop: "8px", alignItems: "center" }}>
            <kbd className="kbd-hint">Click</kbd>
            <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>a row to inspect</span>
          </div>
          <div style={{ display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" }}>
            <kbd className="kbd-hint">/</kbd>
            <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>to search</span>
          </div>
          <div style={{ display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" }}>
            <kbd className="kbd-hint">Ctrl+R</kbd>
            <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>to refresh</span>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="detail-drawer">
      <div className="drawer-head">
        <div>
          <p className="eyebrow">{t("drawer.title")}</p>
          <h2>{record.repo.name}</h2>
          <span>{record.repo.owner}</span>
        </div>
        <button className="mini-icon" onClick={() => onOpenExternal(record.repo.url)} title={t("action.openGithub")}><ExternalLink size={15} /></button>
      </div>
      <p className="drawer-description">{record.repo.description}</p>
      <div className="drawer-actions">
        <button className={clsx("icon-button", record.collection && "active")} onClick={() => onToggleCollection(record.repo.id)}>
          <Heart size={15} /> {t("action.save")}
        </button>
        <button className={clsx("icon-button", compareSelected && "active")} onClick={() => onToggleCompare(record.repo.id)}>
          <GitCompare size={15} /> {t("action.compare")}
        </button>
      </div>

      <div className="stat-row">
        <MetricLine label={t("metric.stars")} value={formatNumber(record.repo.stars, locale)} />
        <MetricLine label={t("metric.forks")} value={formatNumber(record.repo.forks, locale)} />
        <MetricLine label={t("metric.issues")} value={formatNumber(record.repo.openIssues, locale)} />
      </div>

      <div className="drawer-block">
        <h3>{t("drawer.trend")}</h3>
        <Sparkline record={record} />
        <div className="explain-list">
          {record.ranking.explanation.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>

      <div className="drawer-block">
        <h3>{t("drawer.classification")}</h3>
        <TagPill label={`${categoryLabel(record.classification.primaryCategory)} / ${subcategoryLabel(record.classification.secondaryCategory)}`} />
        <p style={{ marginTop: 6 }}>{record.classification.reason}</p>
        <div className="insight-lines">
          <MetricLine label={t("drawer.learningValue")} value={record.classification.learningValue} />
          <MetricLine label={t("drawer.audience")} value={record.classification.audience} />
        </div>
        <div className="tag-row">{record.classification.tags.map((tag) => <TagPill key={tag} label={tag} />)}</div>
        {record.classification.evidence.length > 0 && (
          <div className="tag-row compact">{record.classification.evidence.map((item) => <TagPill key={item} label={item} />)}</div>
        )}
        {record.classification.risks.length > 0 && (
          <ul className="risk-list">{record.classification.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
        )}
      </div>

      <div className="drawer-block">
        <h3>{t("drawer.learningNote")}</h3>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} placeholder={t("drawer.notePlaceholder")} />
        <input value={noteTags} onChange={(event) => setNoteTags(event.target.value)} placeholder={t("drawer.tagsPlaceholder")} />
        <select value={status} onChange={(event) => setStatus(event.target.value as RepoStatus)}>
          <option value="backlog">{statusLabel("backlog")}</option>
          <option value="learning">{statusLabel("learning")}</option>
          <option value="learned">{statusLabel("learned")}</option>
          <option value="archived">{statusLabel("archived")}</option>
        </select>
        <button className="icon-button primary" onClick={() => onSaveNote(record.repo.id, note, noteTags.split(",").map((tag) => tag.trim()).filter(Boolean), status)}>
          <Save size={15} /> {t("action.saveNote")}
        </button>
      </div>
    </aside>
  );
}

// ── Repo List ─────────────────────────────────────────────────

function RepoList({ records, onSelect, onOpenExternal }: { records: RepoRecord[]; onSelect: (record: RepoRecord) => void; onOpenExternal: (url: string) => void }) {
  const { t } = useI18n();
  return (
    <div className="repo-list">
      {records.map((record) => (
        <div
          key={record.repo.id}
          className="repo-row"
          role="button"
          tabIndex={0}
          onClick={() => onSelect(record)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect(record);
          }}
        >
          <div>
            <button className="repo-link" onClick={(event) => {
              event.stopPropagation();
              onOpenExternal(record.repo.url);
            }} title={t("action.openGithub")}>
              <strong>{record.repo.fullName}</strong>
              <ExternalLink size={12} />
            </button>
            <small>{record.repo.description}</small>
          </div>
          <span>{record.ranking.score.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Small Helper Components ───────────────────────────────────

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Star }) {
  const { locale } = useI18n();
  return (
    <div className="metric-card">
      <Icon size={17} />
      <strong>{formatNumber(value, locale)}</strong>
      <span>{label}</span>
    </div>
  );
}

function PanelHeader({ title, meta, action, onAction }: { title: string; meta?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {action && <button className="text-action" onClick={onAction}>{action} <ExternalLink size={13} /></button>}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return <div className="metric-line"><span>{label}</span><strong>{value}</strong></div>;
}

function TagPill({ label }: { label: string }) {
  return <span className="tag-pill"><Tag size={11} /> {label}</span>;
}

function Sparkline({ record }: { record: RepoRecord }) {
  const { t } = useI18n();
  const points = [...record.snapshots].reverse().slice(-12);
  const values = points.length ? points.map((point) => point.growth) : [0, maxGrowth(record), record.ranking.score];
  const max = Math.max(...values, 1);
  const coords = values.map((value, index) => `${(index / Math.max(1, values.length - 1)) * 100},${40 - (value / max) * 34}`).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 44" role="img" aria-label={t("aria.sparkline")}>
      <polyline points={coords} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Utility Functions ─────────────────────────────────────────

function maxGrowth(record: RepoRecord): number {
  const rankingGrowth = record.ranking.sourceBreakdown.map((item) => item.maxGrowth);
  const windowGrowth = record.observations
    .filter((item) => item.window === record.ranking.window)
    .map((item) => item.growth ?? 0);
  return Math.max(...rankingGrowth, ...windowGrowth, 0);
}

function collectTopTags(records: RepoRecord[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    const tags = [...(record.repo.topics ?? []), ...(record.classification?.tags ?? [])];
    for (const tag of tags) {
      const normalized = tag.trim();
      if (!normalized) continue;
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([tag]) => tag);
}

function formatNumber(value: number, locale: "en" | "zh" = "en"): string {
  return Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

function timeAgo(value: string, locale: "en" | "zh", t: (key: string, vars?: Record<string, string | number>) => string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return t("time.justNow");
  if (minutes < 60) return t("time.minutesAgo", { count: minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t("time.hoursAgo", { count: hours });
  return t("time.daysAgo", { count: Math.round(hours / 24) });
}
