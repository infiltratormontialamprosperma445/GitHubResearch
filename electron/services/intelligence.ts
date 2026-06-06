import { app, Notification, safeStorage } from "electron";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { AppDatabase } from "./database.js";
import { maybeRefineClassification } from "./aiClassifier.js";
import {
  ClassificationOverrideInput,
  DashboardSummary,
  JobStep,
  ManualClassificationRule,
  PRIMARY_CATEGORIES,
  RefreshResult,
  RefreshJob,
  RepoFilters,
  RepoRecord,
  RepoStatus,
  Settings,
  SourceHealth,
  TrendRun,
  TrendWindow
} from "../../src/shared/types.js";
import { classifyRepository } from "../../src/shared/classifier.js";
import { scoreRepository } from "../../src/shared/ranking.js";
import {
  GhArchiveAdapter,
  GitHubSearchAdapter,
  GitHubTrendingAdapter,
  SupplementalTrendAdapter
} from "../sources/github.js";
import { TelegramTrendAdapter, TwitterTrendAdapter } from "../sources/social.js";
import { DiscoveredRepository, SourceAdapter } from "../sources/types.js";

const SECRET_KEYS = new Set(["githubToken", "aiApiKey"]);

export class IntelligenceService {
  private readonly adapters: SourceAdapter[];

  constructor(private readonly db: AppDatabase) {
    this.adapters = [
      new GitHubTrendingAdapter(),
      new GitHubSearchAdapter(),
      new TelegramTrendAdapter(),
      new TwitterTrendAdapter(),
      new SupplementalTrendAdapter(),
      new GhArchiveAdapter()
    ];
  }

  async getDashboard(): Promise<DashboardSummary> {
    const hotRepos = this.db.listRepos({ window: "daily", limit: 8 }) ?? [];
    const fallbackHot = hotRepos.length ? hotRepos : (this.db.listRepos({ window: "weekly", limit: 8 }) ?? []);
    const allMonthly = this.db.listRepos({ window: "monthly", limit: 500 }) ?? [];
    const categoryLeaders = PRIMARY_CATEGORIES.map((category) => {
      const repos = allMonthly.filter((record) => record.classification.primaryCategory === category);
      return {
        category,
        count: repos.length,
        topRepo: repos[0]
      };
    }).filter((item) => item.count > 0);
    return {
      updatedAt: new Date().toISOString(),
      totalRepos: this.db.countRepos(),
      totalSources: this.adapters.length,
      health: this.db.sourceHealth(),
      hotRepos: fallbackHot,
      categoryLeaders,
      anomalies: allMonthly.filter((record) => record.ranking.riskPenalty > 0 || record.ranking.growthScore > 38).slice(0, 8),
      latestJob: this.db.latestRefreshJob(),
      rateLimits: this.db.rateLimits()
    };
  }

  async listRepos(filters: RepoFilters): Promise<RepoRecord[]> {
    return this.db.listRepos(filters) ?? [];
  }

  async getRepo(repoId: string): Promise<RepoRecord | undefined> {
    return this.db.getRepo(repoId);
  }

  async refresh(window?: TrendWindow): Promise<RefreshResult> {
    const startedAt = new Date().toISOString();
    const settings = this.getSettings();
    this.db.purgeExpiredCache();
    const windows: TrendWindow[] = window
      ? [window]
      : ["daily", "weekly", "monthly"];
    const job: RefreshJob = {
      id: crypto.randomUUID(),
      startedAt,
      status: "running",
      windows,
      discovered: 0,
      enriched: 0,
      classified: 0,
      scored: 0,
      warnings: [],
      steps: []
    };
    this.db.upsertRefreshJob(job);
    const warnings: string[] = [];
    let discovered = 0;
    let enriched = 0;
    let classified = 0;
    let scored = 0;

    const healthResults = await Promise.allSettled(
      this.adapters.map((adapter) =>
        adapter.health({
          githubToken: settings.githubToken,
          bigQueryProjectId: settings.bigQueryProjectId,
          proxyUrl: settings.proxyUrl,
          cacheTtlHours: settings.cacheTtlHours,
          maxReposPerWindow: settings.maxReposPerWindow,
          getCache: (key) => this.db.getCache(key),
          setCache: (entry) => this.db.setCache(entry),
          recordRateLimit: (state) => this.db.upsertRateLimit(state)
        })
      )
    );
    for (const result of healthResults) {
      if (result.status === "fulfilled") {
        this.db.upsertSourceHealth(result.value);
      }
    }

    for (const trendWindow of windows) {
      // Run all adapters concurrently per window for better I/O throughput
      const adapterTasks = this.adapters.map(async (adapter) => {
        const run: TrendRun = {
          id: crypto.randomUUID(),
          source: adapter.label,
          window: trendWindow,
          startedAt: new Date().toISOString(),
          status: "running",
          discoveredCount: 0
        };
        this.db.insertTrendRun(run);
        const discoverStep = this.startStep(job, adapter.label, trendWindow, "discover");
        try {
          const rawItems = await this.withRetry(() => adapter.discover(trendWindow, this.sourceSettings(settings)), 2);
          const items = Array.isArray(rawItems) ? rawItems : [];
          this.finishStep(job, discoverStep, "success", items.length);
          const classifyStep = this.startStep(job, adapter.label, trendWindow, "classify");
          let adapterEnriched = 0;
          let adapterClassified = 0;
          let adapterScored = 0;
          for (const item of items) {
            const counts = await this.ingest(item, trendWindow, settings);
            adapterEnriched += counts.enriched;
            adapterClassified += counts.classified;
            adapterScored += counts.scored;
          }
          this.finishStep(job, classifyStep, "success", items.length);
          const scoreStep = this.startStep(job, adapter.label, trendWindow, "score");
          this.finishStep(job, scoreStep, "success", items.length);
          this.db.insertTrendRun({
            ...run,
            status: "success",
            completedAt: new Date().toISOString(),
            discoveredCount: items.length
          });
          this.db.upsertSourceHealth({
            ...(await adapter.health({
              githubToken: settings.githubToken,
              bigQueryProjectId: settings.bigQueryProjectId,
              proxyUrl: settings.proxyUrl,
              cacheTtlHours: settings.cacheTtlHours,
              maxReposPerWindow: settings.maxReposPerWindow,
              getCache: (key) => this.db.getCache(key),
              setCache: (entry) => this.db.setCache(entry),
              recordRateLimit: (state) => this.db.upsertRateLimit(state)
            })),
            lastRunAt: new Date().toISOString()
          });
          return { discovered: items.length, enriched: adapterEnriched, classified: adapterClassified, scored: adapterScored };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.finishStep(job, discoverStep, "failed", 0, this.redactSecrets(message));
          this.db.insertTrendRun({
            ...run,
            status: "failed",
            completedAt: new Date().toISOString(),
            message: this.redactSecrets(message),
            discoveredCount: 0
          });
          this.db.upsertSourceHealth({
            id: adapter.id,
            label: adapter.label,
            configured: adapter.id === "gh-archive" || adapter.id === "telegram-trends" || adapter.id === "twitter-trends" || adapter.id !== "github-search" || Boolean(settings.githubToken),
            enabled: true,
            lastRunAt: new Date().toISOString(),
            status: "degraded",
            message: this.redactSecrets(message),
            weight: adapter.weight,
            coverage: 0
          });
          return { error: `${adapter.label} ${trendWindow}: ${message}` };
        }
      });

      const results = await Promise.allSettled(adapterTasks);
      for (const result of results) {
        if (result.status === "fulfilled" && result.value) {
          const value = result.value;
          if ("error" in value) {
            warnings.push(value.error as string);
          } else {
            discovered += value.discovered;
            enriched += value.enriched;
            classified += value.classified;
            scored += value.scored;
          }
        } else if (result.status === "rejected") {
          warnings.push(this.redactSecrets(String(result.reason)));
        }
      }
    }

    this.db.persist();
    const completedAt = new Date().toISOString();
    job.completedAt = completedAt;
    job.status = warnings.length ? (discovered > 0 ? "partial" : "failed") : "success";
    job.discovered = discovered;
    job.enriched = enriched;
    job.classified = classified;
    job.scored = scored;
    job.warnings = warnings.map((warning) => this.redactSecrets(warning));
    this.db.upsertRefreshJob(job);
    this.notifyRefresh(discovered, warnings.length, settings);
    this.db.persist();
    return { jobId: job.id, startedAt, completedAt, windows, discovered, enriched, classified, scored, warnings: job.warnings, steps: job.steps };
  }

  getSettings(): Settings {
    const raw = this.db.settings();
    return {
      githubToken: decryptSecret(raw.githubToken ?? ""),
      bigQueryProjectId: raw.bigQueryProjectId ?? "",
      aiApiKey: decryptSecret(raw.aiApiKey ?? ""),
      aiBaseUrl: raw.aiBaseUrl ?? "https://api.openai.com/v1",
      aiModel: raw.aiModel ?? "gpt-4.1-mini",
      refreshTime: raw.refreshTime ?? "08:30",
      proxyUrl: raw.proxyUrl ?? "",
      storagePath: this.db.storagePath,
      startAtLogin: raw.startAtLogin === "true",
      backgroundRefresh: raw.backgroundRefresh !== "false",
      timezone: raw.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Shanghai",
      cacheTtlHours: Number(raw.cacheTtlHours ?? 6),
      maxReposPerWindow: Number(raw.maxReposPerWindow ?? 200),
      enableNotifications: raw.enableNotifications !== "false",
      backupPath: raw.backupPath ?? ""
    };
  }

  updateSettings(input: Partial<Settings>): Settings {
    for (const [key, value] of Object.entries(input)) {
      if (key === "storagePath" || value === undefined) continue;
      const serialized = typeof value === "boolean" ? String(value) : String(value);
      this.db.updateSetting(key, SECRET_KEYS.has(key) ? encryptSecret(serialized) : serialized);
    }
    if (typeof input.startAtLogin === "boolean") {
      app.setLoginItemSettings({
        openAtLogin: input.startAtLogin,
        path: process.execPath
      });
    }
    this.db.persist();
    return this.getSettings();
  }

  async getSources(): Promise<SourceHealth[]> {
    return this.db.sourceHealth();
  }

  async getLatestJob(): Promise<RefreshJob | undefined> {
    return this.db.latestRefreshJob();
  }

  async getRateLimits() {
    return this.db.rateLimits();
  }

  async toggleCollection(repoId: string, status?: RepoStatus): Promise<RepoRecord | undefined> {
    this.db.toggleCollection(repoId, status);
    this.db.persist();
    return this.db.getRepo(repoId);
  }

  async saveNote(repoId: string, markdown: string, tags: string[], status: RepoStatus): Promise<RepoRecord | undefined> {
    this.db.saveNote(repoId, markdown, tags, status);
    this.db.persist();
    return this.db.getRepo(repoId);
  }

  async saveAlert(rule: Parameters<AppDatabase["saveAlert"]>[0]) {
    const saved = this.db.saveAlert(rule);
    this.db.persist();
    return saved;
  }

  async overrideClassification(input: ClassificationOverrideInput): Promise<RepoRecord | undefined> {
    const current = this.db.getClassification(input.repoId);
    if (!current) return undefined;
    this.db.upsertClassification({
      ...current,
      primaryCategory: input.primaryCategory,
      secondaryCategory: input.secondaryCategory,
      tags: input.tags,
      confidence: 1,
      reason: input.reason,
      overridden: true,
      evidence: ["manual override"],
      updatedAt: new Date().toISOString()
    });
    const rule: ManualClassificationRule = {
      id: crypto.randomUUID(),
      pattern: input.tags[0] ?? input.secondaryCategory,
      primaryCategory: input.primaryCategory,
      secondaryCategory: input.secondaryCategory,
      tags: input.tags,
      reason: input.reason,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (rule.pattern) this.db.saveManualRule(rule);
    for (const trendWindow of ["daily", "weekly", "monthly"] as const) {
      this.db.recomputeRepo(input.repoId, trendWindow);
    }
    this.db.persist();
    return this.db.getRepo(input.repoId);
  }

  async exportLearningMarkdown(): Promise<string> {
    return this.db.learningMarkdown();
  }

  async backupData(): Promise<string> {
    const settings = this.getSettings();
    const backupDir = settings.backupPath || join(dirname(this.db.storagePath), "backups");
    mkdirSync(backupDir, { recursive: true });
    const filename = `star-intel-${new Date().toISOString().replace(/[:.]/g, "-")}.sqlite`;
    return this.db.backupTo(join(backupDir, filename));
  }

  async testConnection(kind: "github" | "ai"): Promise<{ ok: boolean; message: string }> {
    const settings = this.getSettings();
    if (kind === "github") {
      const adapter = this.adapters.find((item) => item.id === "github-search");
      return adapter?.validateSettings(this.sourceSettings(settings)) ?? { ok: false, message: "GitHub adapter not found." };
    }
    if (!settings.aiApiKey) return { ok: false, message: "AI API key is empty." };
    const result = await fetch(`${settings.aiBaseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${settings.aiApiKey}` }
    }).catch((error) => error as Error);
    if (result instanceof Error) return { ok: false, message: result.message };
    return { ok: result.ok, message: result.ok ? "AI endpoint connection succeeded." : `AI endpoint returned ${result.status}.` };
  }

  private async ingest(
    item: DiscoveredRepository,
    trendWindow: TrendWindow,
    settings: Settings
  ): Promise<{ enriched: number; classified: number; scored: number }> {
    const repo = this.db.canonicalizeRepository(item.repo);
    const observation = { ...item.observation, repoId: repo.id };
    this.db.upsertRepository(repo);
    this.db.insertObservation(observation);
    this.db.insertSnapshot({
      id: `${repo.id}:${trendWindow}:${new Date().toISOString().slice(0, 10)}:${observation.source}`,
      repoId: repo.id,
      capturedAt: new Date().toISOString(),
      window: trendWindow,
      stars: repo.stars,
      forks: repo.forks,
      openIssues: repo.openIssues,
      growth: observation.growth ?? 0
    });

    const existing = this.db.getClassification(repo.id);
    let classification = existing?.overridden ? existing : this.applyManualRule(repo) ?? classifyRepository(repo);
    classification = await maybeRefineClassification(repo, classification, {
      aiApiKey: settings.aiApiKey,
      aiBaseUrl: settings.aiBaseUrl,
      aiModel: settings.aiModel
    });
    this.db.upsertClassification(classification);
    const observations = this.db.getObservations(repo.id).filter((sourceObservation) => sourceObservation.window === trendWindow);
    this.db.upsertRanking(scoreRepository(repo, classification, observations, trendWindow));
    this.notifyMatchingAlerts(repo, classification, settings);
    return { enriched: 1, classified: existing?.overridden ? 0 : 1, scored: 1 };
  }

  private notifyRefresh(discovered: number, warningCount: number, settings: Settings): void {
    if (!settings.enableNotifications || !Notification.isSupported()) return;
    new Notification({
      title: "Star Intel Desk updated",
      body: `${discovered} observations collected${warningCount ? `, ${warningCount} sources need attention` : ""}.`
    }).show();
  }

  private sourceSettings(settings: Settings) {
    return {
      githubToken: settings.githubToken,
      bigQueryProjectId: settings.bigQueryProjectId,
      proxyUrl: settings.proxyUrl,
      cacheTtlHours: settings.cacheTtlHours,
      maxReposPerWindow: settings.maxReposPerWindow,
      getCache: (key: string) => this.db.getCache(key),
      setCache: (entry: Parameters<AppDatabase["setCache"]>[0]) => this.db.setCache(entry),
      recordRateLimit: (state: Parameters<AppDatabase["upsertRateLimit"]>[0]) => this.db.upsertRateLimit(state)
    };
  }

  private startStep(
    job: RefreshJob,
    source: string,
    trendWindow: TrendWindow,
    step: JobStep["step"]
  ): JobStep {
    const jobStep: JobStep = {
      id: crypto.randomUUID(),
      jobId: job.id,
      source,
      window: trendWindow,
      step,
      status: "running",
      startedAt: new Date().toISOString(),
      count: 0
    };
    job.steps.push(jobStep);
    this.db.upsertJobStep(jobStep);
    return jobStep;
  }

  private finishStep(
    job: RefreshJob,
    step: JobStep,
    status: JobStep["status"],
    count: number,
    message?: string
  ): void {
    step.status = status;
    step.count = count;
    step.message = message;
    step.completedAt = new Date().toISOString();
    this.db.upsertJobStep(step);
    this.db.upsertRefreshJob(job);
  }

  private async withRetry<T>(task: () => Promise<T>, attempts: number): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= attempts; attempt += 1) {
      try {
        return await task();
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private applyManualRule(repo: RepoRecord["repo"]) {
    const haystack = `${repo.fullName} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`.toLowerCase();
    const rule = this.db.manualRules().find((candidate) => haystack.includes(candidate.pattern.toLowerCase()));
    if (!rule) return undefined;
    return {
      ...classifyRepository(repo),
      primaryCategory: rule.primaryCategory,
      secondaryCategory: rule.secondaryCategory,
      tags: rule.tags,
      confidence: 1,
      reason: rule.reason,
      evidence: [`manual rule: ${rule.pattern}`],
      overridden: true,
      updatedAt: new Date().toISOString()
    };
  }

  private notifyMatchingAlerts(
    repo: RepoRecord["repo"],
    classification: RepoRecord["classification"],
    settings: Settings
  ): void {
    if (!settings.enableNotifications || !Notification.isSupported()) return;
    const haystack = `${repo.fullName} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")} ${classification.primaryCategory} ${classification.secondaryCategory}`.toLowerCase();
    const match = this.db.enabledAlerts().find((alert) => haystack.includes(alert.query.toLowerCase()));
    if (!match) return;
    new Notification({
      title: `Alert: ${match.query}`,
      body: `${repo.fullName} matched ${match.kind} alert.`
    }).show();
  }

  private redactSecrets(value: string): string {
    let output = value;
    for (const secret of [this.getSettings().githubToken, this.getSettings().aiApiKey]) {
      if (secret) output = output.split(secret).join("[redacted]");
    }
    return output;
  }
}

function encryptSecret(value: string): string {
  if (!value) return "";
  try {
    return safeStorage.isEncryptionAvailable()
      ? `enc:${safeStorage.encryptString(value).toString("base64")}`
      : `plain:${value}`;
  } catch {
    return `plain:${value}`;
  }
}

function decryptSecret(value: string): string {
  if (!value) return "";
  try {
    if (value.startsWith("enc:") && safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), "base64"));
    }
    if (value.startsWith("plain:")) return value.slice(6);
    return value;
  } catch {
    return "";
  }
}
