import { APP_NAME } from "../shared/branding";
import { classifyRepository } from "../shared/classifier";
import { scoreRepository } from "../shared/ranking";
import {
  AppApi,
  AppApiV2,
  CategoryCounts,
  DashboardSummary,
  RefreshProgress,
  RepoRecord,
  Repository,
  SearchFilters,
  SearchResult,
  Settings,
  SortOption,
  SourceObservation,
  TrendWindow
} from "../shared/types";

const now = new Date().toISOString();

const fallbackRepos: Repository[] = [
  {
    id: "github:modelcontextprotocol/servers",
    fullName: "modelcontextprotocol/servers",
    owner: "modelcontextprotocol",
    name: "servers",
    description: "Reference MCP servers for connecting AI assistants to tools and data.",
    url: "https://github.com/modelcontextprotocol/servers",
    stars: 62000,
    forks: 7200,
    openIssues: 480,
    language: "TypeScript",
    license: "MIT",
    topics: ["mcp", "tools", "agents", "typescript"],
    pushedAt: now,
    readmeExcerpt: "Model Context Protocol servers expose filesystems, repositories, databases, and tools to AI clients.",
    lastSeenAt: now
  },
  {
    id: "github:langchain-ai/langchain",
    fullName: "langchain-ai/langchain",
    owner: "langchain-ai",
    name: "langchain",
    description: "Build context-aware reasoning applications and agent workflows.",
    url: "https://github.com/langchain-ai/langchain",
    stars: 118000,
    forks: 18000,
    openIssues: 2100,
    language: "Python",
    license: "MIT",
    topics: ["llm", "agents", "rag", "python"],
    pushedAt: now,
    readmeExcerpt: "Framework for developing applications powered by language models, agents, tools, and retrieval.",
    lastSeenAt: now
  },
  {
    id: "github:ollama/ollama",
    fullName: "ollama/ollama",
    owner: "ollama",
    name: "ollama",
    description: "Run large language models locally.",
    url: "https://github.com/ollama/ollama",
    stars: 145000,
    forks: 12000,
    openIssues: 1600,
    language: "Go",
    license: "MIT",
    topics: ["llm", "local-ai", "model-serving", "inference"],
    pushedAt: now,
    readmeExcerpt: "Get up and running with large language models locally.",
    lastSeenAt: now
  }
];

const fallbackRecords: RepoRecord[] = fallbackRepos.map((repo, index) => {
  const classification = classifyRepository(repo);
  const observation: SourceObservation = {
    id: `${repo.id}:fallback`,
    repoId: repo.id,
    source: "Preview Dataset",
    window: "daily",
    observedAt: now,
    rank: index + 1,
    stars: repo.stars,
    growth: [2900, 1800, 2200][index],
    url: repo.url
  };
  return {
    repo,
    classification,
    observations: [observation],
    snapshots: ["daily", "weekly", "monthly"].map((window, day) => ({
      id: `${repo.id}:${window}`,
      repoId: repo.id,
      capturedAt: new Date(Date.now() - day * 86_400_000).toISOString(),
      window: window as TrendWindow,
      stars: repo.stars - day * 200,
      forks: repo.forks,
      openIssues: repo.openIssues,
      growth: Math.round((observation.growth ?? 0) / (day + 1))
    })),
    ranking: scoreRepository(repo, classification, [observation], "daily")
  } satisfies RepoRecord;
});

const fallbackSettings: Settings = {
  githubToken: "",
  bigQueryProjectId: "",
  aiApiKey: "",
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "gpt-4.1-mini",
  refreshTime: "08:30",
  proxyUrl: "",
  storagePath: "Preview browser memory",
  startAtLogin: false,
  backgroundRefresh: true,
  timezone: "Asia/Shanghai",
  cacheTtlHours: 6,
  maxReposPerWindow: 200,
  enableNotifications: true,
  backupPath: ""
};

export const api: AppApi = window.githubIntel ?? {
  async getDashboard(): Promise<DashboardSummary> {
    return {
      updatedAt: now,
      totalRepos: fallbackRecords.length,
      totalSources: 5,
      health: await this.getSources(),
      hotRepos: fallbackRecords,
      categoryLeaders: [
        { category: "AI", count: 3, topRepo: fallbackRecords[0] }
      ],
      anomalies: [fallbackRecords[0]],
      latestJob: undefined,
      rateLimits: [],
      topInsights: [
        {
          id: "preview-ai-focus",
          kind: "topic",
          title: "MCP and agent tooling are ready to explore",
          description: "Preview data highlights MCP servers, LangChain, and local model serving.",
          severity: "info",
          repoId: fallbackRecords[0]?.repo.id,
          actionModule: "explorer"
        }
      ],
      topicHighlights: [
        { label: "mcp", count: 1, sampleRepo: fallbackRecords[0]?.repo.fullName },
        { label: "llm", count: 2, sampleRepo: fallbackRecords[1]?.repo.fullName }
      ],
      aiFocus: [
        {
          subcategory: "MCP/Tools",
          count: 1,
          topRepo: fallbackRecords[0],
          topTags: ["mcp", "tools", "agents"]
        }
      ],
      refreshDelta: {
        status: "pending",
        discovered: 0,
        enriched: 0,
        classified: 0,
        scored: 0,
        warnings: 0
      }
    };
  },
  async listRepos(filters) {
    return fallbackRecords
      .filter((record) => !filters.search || record.repo.fullName.toLowerCase().includes(filters.search.toLowerCase()))
      .filter((record) => !filters.primaryCategory || filters.primaryCategory === "All" || record.classification.primaryCategory === filters.primaryCategory);
  },
  async getRepo(repoId) {
    return fallbackRecords.find((record) => record.repo.id === repoId);
  },
  async refresh() {
    return {
      startedAt: now,
      completedAt: new Date().toISOString(),
      jobId: crypto.randomUUID(),
      windows: ["daily", "weekly", "monthly"],
      discovered: fallbackRecords.length,
      enriched: fallbackRecords.length,
      classified: fallbackRecords.length,
      scored: fallbackRecords.length,
      warnings: ["Browser preview mode: run inside Electron for live GitHub refresh."],
      steps: []
    };
  },
  async getSettings() {
    return fallbackSettings;
  },
  async updateSettings(settings) {
    Object.assign(fallbackSettings, settings);
    return fallbackSettings;
  },
  async getSources() {
    return [
      { id: "github-trending", label: "GitHub Trending", configured: true, enabled: true, status: "healthy", message: "Ready", weight: 1, coverage: 0.8 },
      { id: "github-search", label: "GitHub Search API", configured: false, enabled: true, status: "degraded", message: "Add token for higher limits", weight: 0.9, coverage: 0.42 },
      { id: "telegram-trends", label: "Telegram AI Channels", configured: true, enabled: true, status: "healthy", message: "Monitors AI channels for GitHub signals", weight: 0.7, coverage: 0.35 },
      { id: "twitter-trends", label: "X (Twitter) AI Signals", configured: true, enabled: true, status: "healthy", message: "AI discussions and supplemental feeds", weight: 0.65, coverage: 0.3 },
      { id: "gh-archive", label: "GH Archive WatchEvents", configured: true, enabled: true, status: "healthy", message: "Recent WatchEvent sampling ready", weight: 0.85, coverage: 0.32 }
    ];
  },
  async getLatestJob() {
    return undefined;
  },
  async getRateLimits() {
    return [];
  },
  async toggleCollection(repoId) {
    const record = fallbackRecords.find((item) => item.repo.id === repoId);
    if (record) record.collection = record.collection ? undefined : { repoId, status: "backlog", addedAt: now };
    return record;
  },
  async saveNote(repoId, markdown, tags, status) {
    const record = fallbackRecords.find((item) => item.repo.id === repoId);
    if (record) record.note = { repoId, markdown, tags, status, updatedAt: new Date().toISOString() };
    return record;
  },
  async saveAlert(rule) {
    return { ...rule, id: crypto.randomUUID(), createdAt: now };
  },
  async overrideClassification(input) {
    const record = fallbackRecords.find((item) => item.repo.id === input.repoId);
    if (record) {
      record.classification = {
        ...record.classification,
        primaryCategory: input.primaryCategory,
        secondaryCategory: input.secondaryCategory,
        tags: input.tags,
        reason: input.reason,
        confidence: 1,
        overridden: true
      };
    }
    return record;
  },
  async exportLearningMarkdown() {
    return `# ${APP_NAME} Learning Notes\n`;
  },
  async backupData() {
    return "Preview browser memory";
  },
  async testConnection(kind) {
    return {
      ok: kind === "github",
      message: kind === "github" ? "Preview GitHub connection is available." : "Run inside Electron to test AI settings."
    };
  },
  async openExternal(url) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
} as AppApi;

// v2 extended API with fallback implementations
export const apiV2: AppApiV2 = (window.githubIntel as AppApiV2 | undefined) ?? {
  ...api,
  windowControls: {
    platform: "browser",
    minimize: async () => {},
    toggleMaximize: async () => false,
    close: async () => {},
    isMaximized: async () => false,
    onMaximizedChange: () => () => {}
  },
  async search(_query: string, _filters: SearchFilters, _sort: SortOption): Promise<SearchResult[]> {
    // Fallback: filter fallbackRecords by query text
    const q = _query.toLowerCase();
    return fallbackRecords
      .filter((record) => {
        if (!q) return true;
        return (
          record.repo.fullName.toLowerCase().includes(q) ||
          record.repo.description.toLowerCase().includes(q) ||
          record.repo.topics.some((topic) => topic.toLowerCase().includes(q))
        );
      })
      .map((record, index) => ({
        repoId: record.repo.id,
        fullName: record.repo.fullName,
        description: record.repo.description,
        language: record.repo.language,
        stars: record.repo.stars,
        starsToday: record.observations[0]?.growth ?? 0,
        primaryCategory: record.classification.primaryCategory,
        tags: record.classification.tags,
        isCollected: Boolean(record.collection),
        relevanceScore: 1 - index * 0.1,
        highlights: {}
      }));
  },
  async summarizeRepo(repoId: string, _force?: boolean): Promise<{ cached: boolean; summary?: string }> {
    const record = fallbackRecords.find((item) => item.repo.id === repoId);
    if (!record) return { cached: false, summary: undefined };
    const summary = `## ${record.repo.fullName}\n\n${record.repo.description}\n\n- **Stars**: ${record.repo.stars.toLocaleString()}\n- **Language**: ${record.repo.language}\n- **Category**: ${record.classification.primaryCategory}\n- **Score**: ${record.ranking.score.toFixed(1)}`;
    return { cached: false, summary };
  },
  async summarizeBatch(repoIds: string[], title: string): Promise<{ summary: string }> {
    const lines = [`# ${title}\n`];
    for (const id of repoIds) {
      const record = fallbackRecords.find((item) => item.repo.id === id);
      if (record) {
        lines.push(`- **${record.repo.fullName}**: ${record.repo.description} (${record.repo.stars.toLocaleString()} stars)`);
      }
    }
    return { summary: lines.join("\n") };
  },
  async cancelRefresh(): Promise<void> {
    // no-op in fallback
  },
  onRefreshProgress(_callback: (data: RefreshProgress) => void): () => void {
    // no-op in fallback
    return () => {};
  },
  onSummaryToken(_callback: (data: { repoId: string; token: string }) => void): () => void {
    // no-op in fallback
    return () => {};
  },
  async getCategoryCounts(_window: TrendWindow): Promise<CategoryCounts> {
    const counts: CategoryCounts = {};
    for (const record of fallbackRecords) {
      const cat = record.classification.primaryCategory;
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return counts;
  }
};
