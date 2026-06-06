import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  Boxes,
  Brain,
  Database,
  Download,
  ExternalLink,
  GitCompare,
  Heart,
  Inbox,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Settings as SettingsIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Tag
} from "lucide-react";
import { api } from "./api";
import { useI18n } from "./i18n";
import {
  AI_SUBCATEGORIES,
  PRIMARY_CATEGORIES,
  PrimaryCategory,
  RepoRecord,
  RepoStatus,
  Settings,
  TREND_WINDOWS,
  TrendWindow
} from "../shared/types";

type ModuleId =
  | "dashboard"
  | "explorer"
  | "categories"
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
  { id: "compare", labelKey: "module.compare", icon: GitCompare },
  { id: "learning", labelKey: "module.learning", icon: BookOpen },
  { id: "alerts", labelKey: "module.alerts", icon: Bell },
  { id: "sources", labelKey: "module.sources", icon: Database },
  { id: "classifier", labelKey: "module.classifier", icon: Brain },
  { id: "settings", labelKey: "module.settings", icon: SettingsIcon }
];

export default function App() {
  const { t, locale, setLocale, categoryLabel } = useI18n();
  const queryClient = useQueryClient();
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [window, setWindow] = useState<TrendWindow>("daily");
  const [category, setCategory] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [autoRefreshWindows, setAutoRefreshWindows] = useState<TrendWindow[]>([]);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.getDashboard()
  });

  const reposQuery = useQuery({
    queryKey: ["repos", window, category, search],
    queryFn: () =>
      api.listRepos({
        window,
        search,
        primaryCategory: category,
        limit: 260
      })
  });

  const windowReposQuery = useQuery({
    queryKey: ["repos-summary", window, search],
    queryFn: () =>
      api.listRepos({
        window,
        search,
        primaryCategory: "All",
        limit: 1000
      })
  });

  const sourcesQuery = useQuery({
    queryKey: ["sources"],
    queryFn: () => api.getSources()
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings()
  });

  const rateLimitsQuery = useQuery({
    queryKey: ["rate-limits"],
    queryFn: () => api.getRateLimits()
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.refresh(window === "historical" ? undefined : window),
    onMutate: () => {
      setRefreshProgress({ current: 0, total: 4, label: "Starting refresh..." });
      const interval = setInterval(() => {
        setRefreshProgress((prev) => {
          if (!prev || prev.current >= prev.total - 1) {
            clearInterval(interval);
            return prev;
          }
          const labels = ["Fetching sources...", "Analyzing trends...", "Classifying repos...", "Finalizing..."];
          return { ...prev, current: prev.current + 1, label: labels[prev.current] ?? "Processing..." };
        });
      }, 1200);
      return { interval };
    },
    onSuccess: (result, _variables, context) => {
      if (context?.interval) clearInterval(context.interval);
      setRefreshProgress({ current: 4, total: 4, label: "Complete!" });
      setTimeout(() => setRefreshProgress(null), 800);
      showToast(t("toast.refreshComplete", { discovered: result.discovered, warnings: result.warnings.length }));
      void queryClient.invalidateQueries();
    },
    onError: (error, _variables, context) => {
      if (context?.interval) clearInterval(context.interval);
      setRefreshProgress(null);
      showToast(error instanceof Error ? error.message : t("toast.refreshFailed"));
    }
  });

  const records = reposQuery.data ?? [];
  const windowRecords = windowReposQuery.data ?? records;
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const record of windowRecords) {
      counts.set(record.classification.primaryCategory, (counts.get(record.classification.primaryCategory) ?? 0) + 1);
    }
    return counts;
  }, [windowRecords]);
  const selected = useMemo(
    () => records.find((record) => record.repo.id === selectedId) ?? records[0] ?? dashboardQuery.data?.hotRepos[0],
    [dashboardQuery.data?.hotRepos, records, selectedId]
  );

  useEffect(() => {
    if (records[0] && !records.some((record) => record.repo.id === selectedId)) setSelectedId(records[0].repo.id);
  }, [records, selectedId]);

  useEffect(() => {
    if (!windowReposQuery.isFetched || windowReposQuery.isFetching || search || category !== "All") return;
    if ((windowReposQuery.data?.length ?? 0) > 0 || autoRefreshWindows.includes(window) || refreshMutation.isPending) return;
    setAutoRefreshWindows((current) => [...current, window]);
    refreshMutation.mutate();
  }, [autoRefreshWindows, category, refreshMutation, search, window, windowReposQuery.data?.length, windowReposQuery.isFetched, windowReposQuery.isFetching]);

  const invalidate = () => void queryClient.invalidateQueries();

  const handleWindowChange = (nextWindow: TrendWindow) => {
    setWindow(nextWindow);
    setCategory("All");
    setSelectedId("");
    setActiveModule((current) => current === "dashboard" ? "explorer" : current);
  };

  const toggleCompare = (repoId: string) => {
    setCompareIds((current) => {
      if (current.includes(repoId)) return current.filter((id) => id !== repoId);
      return [...current, repoId].slice(-5);
    });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.ctrlKey && !e.metaKey && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>(".search-box input");
        searchInput?.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        refreshMutation.mutate();
      }
    };
    globalThis.addEventListener("keydown", handleKeyDown);
    return () => globalThis.removeEventListener("keydown", handleKeyDown);
  }, [refreshMutation]);

  return (
    <div className="app-shell">
      <header className="topbar" style={{ WebkitAppRegion: "drag" } as CSSProperties}>
        <div className="brand-block">
          <div className="brand-mark">SI</div>
          <div>
            <h1>Star Intel Desk</h1>
            <p>{t("app.subtitle")}</p>
          </div>
        </div>
        <SegmentedWindow value={window} onChange={handleWindowChange} />
        <div className="search-box">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("search.placeholder")} />
          <kbd className="kbd-hint">/</kbd>
        </div>
        <div className="topbar-actions">
          <LanguageToggle locale={locale} onChange={setLocale} label={t("language.label")} />
          <button className="icon-button primary" onClick={() => refreshMutation.mutate()} disabled={refreshMutation.isPending} title={t("action.refreshTitle")}>
            <RefreshCw size={17} className={clsx(refreshMutation.isPending && "spin")} />
            <span>{refreshMutation.isPending ? t("action.refreshing") : t("action.refresh")}</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <nav className="module-nav">
            {MODULES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  className={clsx("module-button", activeModule === item.id && "active")}
                  onClick={() => setActiveModule(item.id)}
                >
                  <Icon size={17} />
                  <span>{t(item.labelKey)}</span>
                </button>
              );
            })}
          </nav>

          <div className="sidebar-section">
            <div className="section-label">{t("sidebar.categories")}</div>
            <button className={clsx("category-button", category === "All" && "active")} onClick={() => setCategory("All")}>
              <span>{t("common.all")}</span>
              <small>{windowRecords.length}</small>
            </button>
            {PRIMARY_CATEGORIES.map((item) => (
              <button
                key={item}
                className={clsx("category-button", category === item && "active")}
                onClick={() => {
                  setCategory(item);
                  setActiveModule("explorer");
                }}
              >
                <span>{categoryLabel(item)}</span>
                <small>{categoryCounts.get(item) ?? 0}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="main-surface">
          <StatusStrip
            updatedAt={dashboardQuery.data?.updatedAt}
            sources={sourcesQuery.data?.length ?? 0}
            storagePath={settingsQuery.data?.storagePath}
            toast={toast}
            refreshProgress={refreshProgress}
            isRefreshing={refreshMutation.isPending}
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
              loading={reposQuery.isLoading}
              selectedId={selected?.repo.id}
              onSelect={(record) => setSelectedId(record.repo.id)}
              onOpenExternal={(url) => void api.openExternal(url)}
              compareIds={compareIds}
              onToggleCompare={toggleCompare}
            />
          )}
          {activeModule === "categories" && (
            <CategoryIntelligence
              records={records}
              onSelect={(record) => setSelectedId(record.repo.id)}
              onOpenExternal={(url) => void api.openExternal(url)}
              onOpenExplorer={(nextCategory) => {
                setCategory(nextCategory);
                setActiveModule("explorer");
              }}
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

      {toast && (
        <div className="toast-container">
          <div className="toast-item">
            <Sparkles size={15} />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

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

function LanguageToggle({ locale, onChange, label }: { locale: "en" | "zh"; onChange: (locale: "en" | "zh") => void; label: string }) {
  return (
    <div className="language-toggle" aria-label={label}>
      <button className={clsx(locale === "en" && "active")} onClick={() => onChange("en")} type="button">EN</button>
      <button className={clsx(locale === "zh" && "active")} onClick={() => onChange("zh")} type="button">中</button>
    </div>
  );
}

function StatusStrip({ updatedAt, sources, storagePath, toast, refreshProgress, isRefreshing }: {
  updatedAt?: string;
  sources: number;
  storagePath?: string;
  toast: string;
  refreshProgress: { current: number; total: number; label: string } | null;
  isRefreshing: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="status-strip">
      {isRefreshing && refreshProgress ? (
        <div className="refresh-progress">
          <Loader2 size={14} className="spin" />
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${(refreshProgress.current / refreshProgress.total) * 100}%` }} />
          </div>
          <span className="progress-label">{refreshProgress.label}</span>
        </div>
      ) : (
        <>
          <span><Activity size={14} /> {t("status.lastUpdate", { value: updatedAt ? timeAgo(updatedAt, locale, t) : t("common.pending") })}</span>
          <span><Database size={14} /> {t("common.sources", { count: sources })}</span>
          <span className="truncate"><ShieldCheck size={14} /> {storagePath ?? t("common.localSQLite")}</span>
        </>
      )}
      {toast && <strong>{toast}</strong>}
    </div>
  );
}

function Dashboard({ records, summary, onSelect, onOpenExternal, onModule }: {
  records: RepoRecord[];
  summary?: Awaited<ReturnType<typeof api.getDashboard>>;
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
  onModule: (module: ModuleId) => void;
}) {
  const { t, locale, categoryLabel } = useI18n();
  const top = records[0];
  const isEmpty = records.length === 0;

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
              <Database size={15} /> {t("module.sources")}
            </button>
            <button className="quick-action-btn" onClick={() => onModule("settings")}>
              <SettingsIcon size={15} /> {t("module.settings")}
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
              <Sparkles size={15} /> {t("module.explorer")}
            </button>
            <button className="quick-action-btn" onClick={() => onModule("categories")}>
              <Boxes size={15} /> {t("module.categories")}
            </button>
            <button className="quick-action-btn" onClick={() => onModule("compare")}>
              <GitCompare size={15} /> {t("module.compare")}
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

function TrendingExplorer({ records, loading, selectedId, compareIds, onSelect, onOpenExternal, onToggleCompare }: {
  records: RepoRecord[];
  loading: boolean;
  selectedId?: string;
  compareIds: string[];
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
  onToggleCompare: (repoId: string) => void;
}) {
  const { t, locale, categoryLabel, subcategoryLabel } = useI18n();
  return (
    <section className="panel full">
      <PanelHeader title={t("explorer.title")} meta={t("common.repositories", { count: records.length })} />
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
          <tbody>
            {loading && (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <Loader2 size={28} className="spin" />
                  <p>{t("explorer.loading")}</p>
                </div>
              </td></tr>
            )}
            {!loading && records.length === 0 && (
              <tr><td colSpan={8}>
                <div className="empty-state">
                  <Search size={32} />
                  <h3>{t("explorer.title")}</h3>
                  <p>{t("search.placeholder")}</p>
                </div>
              </td></tr>
            )}
            {records.map((record, index) => (
              <tr key={record.repo.id} className={clsx(selectedId === record.repo.id && "selected")} onClick={() => onSelect(record)}>
                <td>{index + 1}</td>
                <td>
                  <button className="repo-link" onClick={(event) => {
                    event.stopPropagation();
                    onOpenExternal(record.repo.url);
                  }} title={t("action.openGithub")}>
                    <strong>{record.repo.fullName}</strong>
                    <ExternalLink size={13} />
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
                    <GitCompare size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CategoryIntelligence({ records, onSelect, onOpenExternal, onOpenExplorer }: {
  records: RepoRecord[];
  onSelect: (record: RepoRecord) => void;
  onOpenExternal: (url: string) => void;
  onOpenExplorer: (category: string) => void;
}) {
  const { t, categoryLabel, subcategoryLabel } = useI18n();
  const groups = PRIMARY_CATEGORIES.map((category) => {
    const items = records.filter((record) => record.classification.primaryCategory === category);
    return { category, items, top: items[0] };
  }).filter((group) => group.items.length);
  const aiBreakdown = AI_SUBCATEGORIES.map((subcategory) => ({
    subcategory,
    count: records.filter((record) => record.classification.secondaryCategory === subcategory).length
  })).filter((item) => item.count);

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
      <div className="panel">
        <PanelHeader title={t("categories.aiSubcategories")} />
        <div className="stack-list">
          {aiBreakdown.map((item) => (
            <div key={item.subcategory} className="stack-row">
              <span>{subcategoryLabel(item.subcategory)}</span>
              <strong>{item.count}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="panel wide">
        <PanelHeader title={t("categories.topProjects")} />
        <RepoList records={records.slice(0, 10)} onSelect={onSelect} onOpenExternal={onOpenExternal} />
      </div>
    </section>
  );
}

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
            }}><GitCompare size={15} /></button>
            <button className="repo-link" onClick={(event) => {
              event.stopPropagation();
              onOpenExternal(record.repo.url);
            }} title={t("action.openGithub")}>
              <h3>{record.repo.name}</h3>
              <ExternalLink size={13} />
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
        <Bell size={16} /> {t("action.saveAlert")}
      </button>
    </section>
  );
}

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
                <Database size={18} />
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
          <p>{record.repo.description}</p>
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
          <button className="icon-button primary"><Save size={16} /> {t("action.saveOverride")}</button>
        </form>
      </div>
    </section>
  );
}

function SettingsPanel({ settings, onSaved }: { settings: Settings; onSaved: (settings: Settings) => void }) {
  const { t } = useI18n();
  const [form, setForm] = useState(settings);
  const [connectionMessage, setConnectionMessage] = useState("");
  useEffect(() => setForm(settings), [settings]);
  const set = (key: keyof Settings, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="panel full settings-form">
      <PanelHeader title={t("settings.title")} meta={t("settings.meta")} />
      <div className="settings-grid">
        <label>{t("settings.githubToken")}<input type="password" value={form.githubToken} onChange={(event) => set("githubToken", event.target.value)} placeholder={t("settings.githubTokenPlaceholder")} /></label>
        <label>{t("settings.bigQueryProjectId")}<input value={form.bigQueryProjectId} onChange={(event) => set("bigQueryProjectId", event.target.value)} /></label>
        <label>{t("settings.aiApiKey")}<input type="password" value={form.aiApiKey} onChange={(event) => set("aiApiKey", event.target.value)} placeholder={t("settings.aiKeyPlaceholder")} /></label>
        <label>{t("settings.aiBaseUrl")}<input value={form.aiBaseUrl} onChange={(event) => set("aiBaseUrl", event.target.value)} /></label>
        <label>{t("settings.aiModel")}<input value={form.aiModel} onChange={(event) => set("aiModel", event.target.value)} /></label>
        <label>{t("settings.refreshTime")}<input type="time" value={form.refreshTime} onChange={(event) => set("refreshTime", event.target.value)} /></label>
        <label>{t("settings.proxyUrl")}<input value={form.proxyUrl} onChange={(event) => set("proxyUrl", event.target.value)} /></label>
        <label>{t("settings.timezone")}<input value={form.timezone} onChange={(event) => set("timezone", event.target.value)} /></label>
        <label>{t("settings.cacheTtlHours")}<input type="number" min={1} max={72} value={form.cacheTtlHours} onChange={(event) => setForm((current) => ({ ...current, cacheTtlHours: Number(event.target.value) }))} /></label>
        <label>{t("settings.maxReposPerWindow")}<input type="number" min={20} max={500} value={form.maxReposPerWindow} onChange={(event) => setForm((current) => ({ ...current, maxReposPerWindow: Number(event.target.value) }))} /></label>
        <label>{t("settings.backupPath")}<input value={form.backupPath} onChange={(event) => set("backupPath", event.target.value)} placeholder={t("settings.backupPathPlaceholder")} /></label>
        <label>{t("settings.storagePath")}<input value={form.storagePath} readOnly /></label>
      </div>
      <div className="switch-row">
        <label><input type="checkbox" checked={form.backgroundRefresh} onChange={(event) => set("backgroundRefresh", event.target.checked)} /> {t("settings.backgroundRefresh")}</label>
        <label><input type="checkbox" checked={form.startAtLogin} onChange={(event) => set("startAtLogin", event.target.checked)} /> {t("settings.startAtLogin")}</label>
        <label><input type="checkbox" checked={form.enableNotifications} onChange={(event) => set("enableNotifications", event.target.checked)} /> {t("settings.notifications")}</label>
      </div>
      {connectionMessage && <p className="settings-message">{connectionMessage}</p>}
      <div className="settings-actions">
        <button className="icon-button" type="button" onClick={async () => {
          const result = await api.testConnection("github");
          setConnectionMessage(result.message);
        }}>
          <ShieldCheck size={16} /> {t("action.testGithub")}
        </button>
        <button className="icon-button" type="button" onClick={async () => {
          const result = await api.testConnection("ai");
          setConnectionMessage(result.message);
        }}>
          <Brain size={16} /> {t("action.testAi")}
        </button>
        <button className="icon-button" type="button" onClick={async () => {
          const path = await api.backupData();
          setConnectionMessage(t("toast.backupCreated", { path }));
        }}>
          <Download size={16} /> {t("action.backupData")}
        </button>
      </div>
      <button className="icon-button primary" onClick={async () => onSaved(await api.updateSettings(form))}>
        <Save size={16} /> {t("action.saveSettings")}
      </button>
    </section>
  );
}

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
            <span style={{ color: "var(--slate-light)", fontSize: "12px" }}>a row to inspect</span>
          </div>
          <div style={{ display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" }}>
            <kbd className="kbd-hint">/</kbd>
            <span style={{ color: "var(--slate-light)", fontSize: "12px" }}>to search</span>
          </div>
          <div style={{ display: "flex", gap: "4px", marginTop: "4px", alignItems: "center" }}>
            <kbd className="kbd-hint">Ctrl+R</kbd>
            <span style={{ color: "var(--slate-light)", fontSize: "12px" }}>to refresh</span>
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
        <button className="mini-icon" onClick={() => onOpenExternal(record.repo.url)} title={t("action.openGithub")}><ExternalLink size={16} /></button>
      </div>
      <p className="drawer-description">{record.repo.description}</p>
      <div className="drawer-actions">
        <button className={clsx("icon-button", record.collection && "active")} onClick={() => onToggleCollection(record.repo.id)}>
          <Heart size={16} /> {t("action.save")}
        </button>
        <button className={clsx("icon-button", compareSelected && "active")} onClick={() => onToggleCompare(record.repo.id)}>
          <GitCompare size={16} /> {t("action.compare")}
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
        <p>{record.classification.reason}</p>
        <div className="tag-row">{record.classification.tags.map((tag) => <TagPill key={tag} label={tag} />)}</div>
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
          <Save size={16} /> {t("action.saveNote")}
        </button>
      </div>
    </aside>
  );
}

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
              <ExternalLink size={13} />
            </button>
            <small>{record.repo.description}</small>
          </div>
          <span>{record.ranking.score.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Star }) {
  const { locale } = useI18n();
  return (
    <div className="metric-card">
      <Icon size={18} />
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
      {action && <button className="text-action" onClick={onAction}>{action} <ExternalLink size={14} /></button>}
    </div>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return <div className="metric-line"><span>{label}</span><strong>{value}</strong></div>;
}

function TagPill({ label }: { label: string }) {
  return <span className="tag-pill"><Tag size={12} /> {label}</span>;
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

function maxGrowth(record: RepoRecord): number {
  const rankingGrowth = record.ranking.sourceBreakdown.map((item) => item.maxGrowth);
  const windowGrowth = record.observations
    .filter((item) => item.window === record.ranking.window)
    .map((item) => item.growth ?? 0);
  return Math.max(...rankingGrowth, ...windowGrowth, 0);
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
