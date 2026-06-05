import { classifyRepository } from "../shared/classifier";
import { scoreRepository } from "../shared/ranking";
import {
  AppApi,
  DashboardSummary,
  RepoRecord,
  Repository,
  Settings,
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
      rateLimits: []
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
    return "# Star Intel Desk Learning Notes\n";
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
};
