export type TrendWindow = "daily" | "weekly" | "monthly" | "historical";

export type PrimaryCategory =
  | "AI"
  | "Developer Tools"
  | "Frontend/UI"
  | "Backend/API"
  | "Data/Analytics"
  | "Security"
  | "Infrastructure/DevOps"
  | "Systems"
  | "Mobile/Desktop"
  | "Education/Awesome Lists"
  | "Productivity"
  | "Other";

export type AiSubcategory =
  | "Agents"
  | "Coding Agents"
  | "Claude Code"
  | "Codex/CLI"
  | "Agent Frameworks"
  | "Skills/Plugins"
  | "Prompts/Workflows"
  | "MCP/Tools"
  | "OpenAI/GPT"
  | "Claude/Anthropic"
  | "RAG/Knowledge"
  | "LLM Apps"
  | "Model Serving"
  | "Evaluation"
  | "AI Security"
  | "Multimodal";

export type RepoStatus = "backlog" | "learning" | "learned" | "archived";

export interface Repository {
  id: string;
  nodeId?: string;
  fullName: string;
  owner: string;
  name: string;
  description: string;
  url: string;
  homepage?: string;
  stars: number;
  forks: number;
  openIssues: number;
  language: string;
  license: string;
  topics: string[];
  createdAt?: string;
  pushedAt?: string;
  readmeExcerpt?: string;
  lastSeenAt: string;
}

export interface Classification {
  repoId: string;
  primaryCategory: PrimaryCategory;
  secondaryCategory: string;
  tags: string[];
  confidence: number;
  reason: string;
  learningValue: string;
  audience: string;
  risks: string[];
  evidence: string[];
  overridden: boolean;
  updatedAt: string;
}

export interface RankingScore {
  repoId: string;
  window: TrendWindow;
  score: number;
  growthScore: number;
  sourceScore: number;
  activityScore: number;
  qualityScore: number;
  riskPenalty: number;
  explanation: string[];
  sourceBreakdown: SourceBreakdown[];
  dedupeConfidence: number;
  anomalyReasons: string[];
  computedAt: string;
}

export interface SourceBreakdown {
  source: string;
  weight: number;
  observations: number;
  maxGrowth: number;
  bestRank?: number;
}

export interface SourceObservation {
  id: string;
  repoId: string;
  source: string;
  window: TrendWindow;
  observedAt: string;
  rank?: number;
  stars?: number;
  growth?: number;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface RepoSnapshot {
  id: string;
  repoId: string;
  capturedAt: string;
  window: TrendWindow;
  stars: number;
  forks: number;
  openIssues: number;
  growth: number;
}

export interface TrendRun {
  id: string;
  source: string;
  window: TrendWindow;
  startedAt: string;
  completedAt?: string;
  status: "running" | "success" | "failed" | "partial";
  message?: string;
  discoveredCount: number;
}

export interface JobStep {
  id: string;
  jobId: string;
  source: string;
  window: TrendWindow;
  step: "discover" | "enrich" | "classify" | "score" | "snapshot" | "notify";
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt: string;
  completedAt?: string;
  message?: string;
  count: number;
}

export interface RefreshJob {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "success" | "failed" | "partial";
  windows: TrendWindow[];
  discovered: number;
  enriched: number;
  classified: number;
  scored: number;
  warnings: string[];
  steps: JobStep[];
}

export interface RateLimitState {
  source: string;
  resource: string;
  limit?: number;
  remaining?: number;
  resetAt?: string;
  observedAt: string;
  status: "ok" | "limited" | "unknown";
}

export interface RequestCacheEntry {
  key: string;
  url: string;
  method: string;
  body: string;
  headers: Record<string, string>;
  createdAt: string;
  expiresAt: string;
  status: number;
  etag?: string;
}

export interface DataQualitySignal {
  repoId: string;
  kind: "dedupe" | "ranking" | "classification" | "source" | "anomaly";
  severity: "info" | "warning" | "critical";
  message: string;
  createdAt: string;
}

export interface ManualClassificationRule {
  id: string;
  pattern: string;
  primaryCategory: PrimaryCategory;
  secondaryCategory: string;
  tags: string[];
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface StarEventDaily {
  repoId: string;
  date: string;
  starsAdded: number;
  source: string;
}

export interface CollectionItem {
  repoId: string;
  status: RepoStatus;
  addedAt: string;
}

export interface Note {
  repoId: string;
  markdown: string;
  tags: string[];
  status: RepoStatus;
  updatedAt: string;
}

export interface AlertRule {
  id: string;
  kind: "category" | "keyword" | "repository";
  query: string;
  enabled: boolean;
  createdAt: string;
}

export interface RepoRecord {
  repo: Repository;
  classification: Classification;
  ranking: RankingScore;
  observations: SourceObservation[];
  snapshots: RepoSnapshot[];
  collection?: CollectionItem;
  note?: Note;
}

export interface SourceHealth {
  id: string;
  label: string;
  configured: boolean;
  enabled: boolean;
  lastRunAt?: string;
  status: "healthy" | "degraded" | "disabled" | "unknown";
  message: string;
  weight: number;
  coverage: number;
}

export interface Settings {
  githubToken: string;
  bigQueryProjectId: string;
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
  refreshTime: string;
  proxyUrl: string;
  storagePath: string;
  startAtLogin: boolean;
  backgroundRefresh: boolean;
  timezone: string;
  cacheTtlHours: number;
  maxReposPerWindow: number;
  enableNotifications: boolean;
  backupPath: string;
}

export interface RepoFilters {
  window: TrendWindow;
  search?: string;
  primaryCategory?: string;
  secondaryCategory?: string;
  language?: string;
  minConfidence?: number;
  collectionOnly?: boolean;
  limit?: number;
}

export interface DashboardInsight {
  id: string;
  kind: "growth" | "topic" | "source" | "risk" | "refresh";
  title: string;
  description: string;
  severity: "info" | "success" | "warning" | "danger";
  repoId?: string;
  actionModule?: string;
}

export interface TopicHighlight {
  label: string;
  count: number;
  sampleRepo?: string;
}

export interface AiFocusArea {
  subcategory: string;
  count: number;
  topRepo?: RepoRecord;
  topTags: string[];
}

export interface RefreshDelta {
  status: RefreshJob["status"] | "pending";
  discovered: number;
  enriched: number;
  classified: number;
  scored: number;
  warnings: number;
  completedAt?: string;
}

export interface DashboardSummary {
  updatedAt: string;
  totalRepos: number;
  totalSources: number;
  health: SourceHealth[];
  hotRepos: RepoRecord[];
  categoryLeaders: Array<{
    category: string;
    count: number;
    topRepo?: RepoRecord;
  }>;
  anomalies: RepoRecord[];
  latestJob?: RefreshJob;
  rateLimits: RateLimitState[];
  topInsights: DashboardInsight[];
  topicHighlights: TopicHighlight[];
  aiFocus: AiFocusArea[];
  refreshDelta: RefreshDelta;
}

export interface RefreshResult {
  jobId: string;
  startedAt: string;
  completedAt: string;
  windows: TrendWindow[];
  discovered: number;
  enriched: number;
  classified: number;
  scored: number;
  warnings: string[];
  steps: JobStep[];
}

export interface ClassificationOverrideInput {
  repoId: string;
  primaryCategory: PrimaryCategory;
  secondaryCategory: string;
  tags: string[];
  reason: string;
}

export interface AppApi {
  getDashboard(): Promise<DashboardSummary>;
  listRepos(filters: RepoFilters): Promise<RepoRecord[]>;
  getRepo(repoId: string): Promise<RepoRecord | undefined>;
  refresh(window?: TrendWindow): Promise<RefreshResult>;
  getSettings(): Promise<Settings>;
  updateSettings(settings: Partial<Settings>): Promise<Settings>;
  getSources(): Promise<SourceHealth[]>;
  getLatestJob(): Promise<RefreshJob | undefined>;
  getRateLimits(): Promise<RateLimitState[]>;
  toggleCollection(repoId: string, status?: RepoStatus): Promise<RepoRecord | undefined>;
  saveNote(repoId: string, markdown: string, tags: string[], status: RepoStatus): Promise<RepoRecord | undefined>;
  saveAlert(rule: Omit<AlertRule, "id" | "createdAt">): Promise<AlertRule>;
  overrideClassification(input: ClassificationOverrideInput): Promise<RepoRecord | undefined>;
  exportLearningMarkdown(): Promise<string>;
  backupData(): Promise<string>;
  testConnection(kind: "github" | "ai"): Promise<{ ok: boolean; message: string }>;
  openExternal(url: string): Promise<void>;
}

export const TREND_WINDOWS: Array<{ id: TrendWindow; label: string }> = [
  { id: "daily", label: "Today" },
  { id: "weekly", label: "Week" },
  { id: "monthly", label: "Month" },
  { id: "historical", label: "History" }
];

export const PRIMARY_CATEGORIES: PrimaryCategory[] = [
  "AI",
  "Developer Tools",
  "Frontend/UI",
  "Backend/API",
  "Data/Analytics",
  "Security",
  "Infrastructure/DevOps",
  "Systems",
  "Mobile/Desktop",
  "Education/Awesome Lists",
  "Productivity",
  "Other"
];

export const AI_SUBCATEGORIES: AiSubcategory[] = [
  "Agents",
  "Coding Agents",
  "Claude Code",
  "Codex/CLI",
  "Agent Frameworks",
  "Skills/Plugins",
  "Prompts/Workflows",
  "MCP/Tools",
  "OpenAI/GPT",
  "Claude/Anthropic",
  "RAG/Knowledge",
  "LLM Apps",
  "Model Serving",
  "Evaluation",
  "AI Security",
  "Multimodal"
];

// ── v2.0: Search, Summary, Progress types ──────────────────

export interface SearchFilters {
  windowType?: TrendWindow;
  primaryCategory?: string;
  language?: string;
  minStars?: number;
  isFavorited?: boolean;
}

export type SortOption = "relevance" | "score" | "stars" | "growth" | "recent";

export interface SearchResult {
  repoId: string;
  fullName: string;
  description: string;
  language: string;
  stars: number;
  starsToday: number;
  primaryCategory: string;
  tags: string[];
  isCollected: boolean;
  relevanceScore: number;
  highlights: {
    fullName?: string;
    description?: string;
    tags?: string;
  };
}

export interface RepoSummary {
  repoId: string;
  summaryMd: string;
  summaryType: "ai" | "rule";
  model?: string;
  createdAt: string;
}

export interface RefreshProgress {
  phase: "fetching" | "classifying" | "ranking" | "persisting" | "done" | "error" | "cancelled";
  done: number;
  total: number;
  label: string;
  repoCount: number;
}

export type CategoryCounts = Record<string, number>;

export type DesktopPlatform = "win32" | "darwin" | "linux" | "browser" | string;

export interface WindowControlsApi {
  platform: DesktopPlatform;
  minimize(): Promise<void>;
  toggleMaximize(): Promise<boolean>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(callback: (isMaximized: boolean) => void): () => void;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Extend AppApi with new v2.0 methods
export interface AppApiV2 extends AppApi {
  windowControls: WindowControlsApi;
  search(query: string, filters: SearchFilters, sort: SortOption): Promise<SearchResult[]>;
  summarizeRepo(repoId: string, force?: boolean): Promise<{ cached: boolean; summary?: string }>;
  summarizeBatch(repoIds: string[], title: string): Promise<{ summary: string }>;
  cancelRefresh(): Promise<void>;
  onRefreshProgress(callback: (data: RefreshProgress) => void): () => void;
  onSummaryToken(callback: (data: { repoId: string; token: string }) => void): () => void;
  getCategoryCounts(window: TrendWindow): Promise<CategoryCounts>;
}
