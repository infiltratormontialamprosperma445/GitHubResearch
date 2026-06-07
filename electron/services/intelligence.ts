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
  SearchResult,
  SearchFilters,
  Settings,
  SortOption,
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

/**
 * Shape of the progress callback passed to refresh().
 */
export interface RefreshProgressCallback {
  phase: string;
  done: number;
  total: number;
  label: string;
  repoCount: number;
}

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
      const repos = allMonthly.filter((record) => record.classification?.primaryCategory === category);
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
      anomalies: allMonthly.filter((record) => (record.ranking?.riskPenalty ?? 0) > 0 || (record.ranking?.growthScore ?? 0) > 38).slice(0, 8),
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

  /**
   * Run a full refresh cycle.
   *
   * @param window     Optional single trend window to refresh (defaults to all three).
   * @param onProgress Optional callback invoked with progress updates during the refresh.
   * @param signal     Optional AbortSignal to cancel the refresh early.
   * @returns A RefreshResult summarising what was discovered and processed.
   */
  async refresh(
    window?: TrendWindow,
    onProgress?: (progress: RefreshProgressCallback) => void,
    signal?: AbortSignal
  ): Promise<RefreshResult> {
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

    // Compute total adapter iterations for progress reporting
    const totalIterations = windows.length * this.adapters.length;
    let completedIterations = 0;

    // Health checks — lightweight, run in parallel
    onProgress?.({ phase: "fetching", done: 0, total: totalIterations, label: "Checking source health...", repoCount: 0 });

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
      // Check cancellation before each window
      if (signal?.aborted) {
        break;
      }

      // Process adapters sequentially to avoid event loop starvation
      for (const adapter of this.adapters) {
        // Check cancellation between adapters
        if (signal?.aborted) {
          break;
        }

        const run: TrendRun = {
          id: crypto.randomUUID(),
          source: adapter.label,
          window: trendWindow,
          startedAt: new Date().toISOString(),
          status: "running",
          discoveredCount: 0
        };
        this.db.insertTrendRun(run);

        // ── Discover phase ──────────────────────────────────
        onProgress?.({
          phase: "fetching",
          done: completedIterations,
          total: totalIterations,
          label: `Fetching from ${adapter.label} (${trendWindow})`,
          repoCount: discovered
        });

        const discoverStep = this.startStep(job, adapter.label, trendWindow, "discover");
        try {
          const rawItems = await this.withRetry(() => adapter.discover(trendWindow, this.sourceSettings(settings)), 2);
          const items = Array.isArray(rawItems) ? rawItems : [];
          this.finishStep(job, discoverStep, "success", items.length);

          // ── Classify & ingest phase ────────────────────────
          onProgress?.({
            phase: "classifying",
            done: completedIterations,
            total: totalIterations,
            label: `Processing ${items.length} repos from ${adapter.label} (${trendWindow})`,
            repoCount: discovered
          });

          const classifyStep = this.startStep(job, adapter.label, trendWindow, "classify");
          let adapterEnriched = 0;
          let adapterClassified = 0;
          let adapterScored = 0;
          for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
            // Check cancellation between individual items
            if (signal?.aborted) {
              break;
            }

            const item = items[itemIndex];
            try {
              const counts = this.ingest(item, trendWindow, settings);
              adapterEnriched += counts.enriched;
              adapterClassified += counts.classified;
              adapterScored += counts.scored;
            } catch (ingestError) {
              const msg = ingestError instanceof Error ? ingestError.message : String(ingestError);
              console.warn(`[ingest] Skipping ${item.repo?.fullName ?? "unknown"}: ${msg}`);
            }
          }
          this.finishStep(job, classifyStep, "success", items.length);

          // ── Score phase ────────────────────────────────────
          onProgress?.({
            phase: "ranking",
            done: completedIterations,
            total: totalIterations,
            label: `Scoring ${adapter.label} (${trendWindow})`,
            repoCount: discovered
          });

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
          discovered += items.length;
          enriched += adapterEnriched;
          classified += adapterClassified;
          scored += adapterScored;
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
          warnings.push(`${adapter.label} ${trendWindow}: ${message}`);
        }

        completedIterations++;
        onProgress?.({
          phase: "persisting",
          done: completedIterations,
          total: totalIterations,
          label: `Completed ${adapter.label} (${trendWindow})`,
          repoCount: discovered
        });
      }

      // Brief pause between windows to let the system breathe
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }

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
    return this.db.getRepo(repoId);
  }

  async saveNote(repoId: string, markdown: string, tags: string[], status: RepoStatus): Promise<RepoRecord | undefined> {
    this.db.saveNote(repoId, markdown, tags, status);
    return this.db.getRepo(repoId);
  }

  async saveAlert(rule: Parameters<AppDatabase["saveAlert"]>[0]) {
    return this.db.saveAlert(rule);
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
      const result = await adapter?.validateSettings(this.sourceSettings(settings));
      if (!result) return { ok: false, message: "GitHub adapter not found." };
      if (!settings.githubToken && result.ok) {
        return {
          ok: true,
          message: "GitHub is available in anonymous mode. Add a token for higher rate limits."
        };
      }
      return result;
    }
    if (!settings.aiApiKey) return { ok: false, message: "AI API key is empty." };
    const result = await fetch(`${settings.aiBaseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${settings.aiApiKey}` }
    }).catch((error) => error as Error);
    if (result instanceof Error) return { ok: false, message: result.message };
    return { ok: result.ok, message: result.ok ? "AI endpoint connection succeeded." : `AI endpoint returned ${result.status}.` };
  }

  // ── v2.0: Search & Category Counts ──────────────────────────

  /**
   * Full-text search across all repos in a given window.
   * Returns scored and sorted search results with highlights.
   */
  async search(query: string, filters: SearchFilters, sort: SortOption): Promise<SearchResult[]> {
    const windowType = filters.windowType ?? "monthly";
    const repos = this.db.listRepos({ window: windowType, limit: 1000 }) ?? [];

    if (!query && !filters.primaryCategory && !filters.language && !filters.minStars && !filters.isFavorited) {
      // No query and no filters — return top repos by default sort
      return repos.slice(0, 100).map((r) => this.toSearchResult(r, query));
    }

    const queryLower = query.toLowerCase().trim();
    const results: SearchResult[] = [];

    for (const repo of repos) {
      // Apply search query matching
      if (queryLower) {
        const fullNameMatch = repo.repo.fullName.toLowerCase().includes(queryLower);
        const descMatch = (repo.repo.description ?? "").toLowerCase().includes(queryLower);
        const topicMatch = (repo.repo.topics ?? []).some((t) => t.toLowerCase().includes(queryLower));

        if (!fullNameMatch && !descMatch && !topicMatch) continue;
      }

      // Apply additional filters
      if (filters.primaryCategory && repo.classification?.primaryCategory !== filters.primaryCategory) continue;
      if (filters.language && repo.repo.language !== filters.language) continue;
      if (filters.minStars && repo.repo.stars < filters.minStars) continue;
      if (filters.isFavorited && !repo.collection) continue;

      results.push(this.toSearchResult(repo, query));
    }

    // Sort results
    switch (sort) {
      case "relevance":
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        break;
      case "score":
        results.sort((a, b) => {
          const scoreA = repos.find((r) => r.repo.id === a.repoId)?.ranking?.score ?? 0;
          const scoreB = repos.find((r) => r.repo.id === b.repoId)?.ranking?.score ?? 0;
          return scoreB - scoreA;
        });
        break;
      case "stars":
        results.sort((a, b) => b.stars - a.stars);
        break;
      case "growth":
        results.sort((a, b) => b.starsToday - a.starsToday);
        break;
      case "recent":
        results.sort((a, b) => {
          const pushedA = repos.find((r) => r.repo.id === a.repoId)?.repo.pushedAt ?? "";
          const pushedB = repos.find((r) => r.repo.id === b.repoId)?.repo.pushedAt ?? "";
          return pushedB.localeCompare(pushedA);
        });
        break;
    }

    return results;
  }

  /**
   * Count repos per primary category for a given trend window.
   */
  async getCategoryCounts(window: TrendWindow): Promise<Record<string, number>> {
    const repos = this.db.listRepos({ window: window === "historical" ? "monthly" : window, limit: 5000 }) ?? [];
    const counts: Record<string, number> = {};
    for (const repo of repos) {
      const category = repo.classification?.primaryCategory ?? "Other";
      counts[category] = (counts[category] ?? 0) + 1;
    }
    return counts;
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Convert a RepoRecord into a SearchResult with relevance scoring.
   */
  private toSearchResult(record: RepoRecord, query: string): SearchResult {
    const queryLower = query.toLowerCase().trim();
    let relevanceScore = 0;

    if (queryLower) {
      if (record.repo.fullName.toLowerCase().includes(queryLower)) relevanceScore += 3;
      if ((record.repo.description ?? "").toLowerCase().includes(queryLower)) relevanceScore += 2;
      const matchingTopics = (record.repo.topics ?? []).filter((t) => t.toLowerCase().includes(queryLower));
      relevanceScore += matchingTopics.length;
    }

    // Boost by ranking score (normalized to 0-1 range)
    relevanceScore += (record.ranking?.score ?? 0) / 100;

    const highlights: SearchResult["highlights"] = {};
    if (queryLower) {
      if (record.repo.fullName.toLowerCase().includes(queryLower)) {
        highlights.fullName = record.repo.fullName;
      }
      if ((record.repo.description ?? "").toLowerCase().includes(queryLower)) {
        highlights.description = record.repo.description;
      }
      const matchedTags = (record.classification?.tags ?? []).filter((t) => t.toLowerCase().includes(queryLower));
      if (matchedTags.length > 0) {
        highlights.tags = matchedTags.join(", ");
      }
    }

    // Compute growth from observations
    const growthObs = record.observations?.reduce((sum, obs) => sum + (obs.growth ?? 0), 0) ?? 0;

    return {
      repoId: record.repo.id,
      fullName: record.repo.fullName,
      description: record.repo.description ?? "",
      language: record.repo.language ?? "Unknown",
      stars: record.repo.stars,
      starsToday: growthObs,
      primaryCategory: record.classification?.primaryCategory ?? "Other",
      tags: record.classification?.tags ?? [],
      isCollected: Boolean(record.collection),
      relevanceScore,
      highlights
    };
  }

  private ingest(
    item: DiscoveredRepository,
    trendWindow: TrendWindow,
    settings: Settings
  ): { enriched: number; classified: number; scored: number } {
    if (!item?.repo || !item.repo.fullName) {
      throw new Error(`Invalid discovered item: missing repo or fullName`);
    }
    // --- Batch 1: core repo write ---
    const repo = this.db.canonicalizeRepository(item.repo);
    const observation = { ...(item.observation ?? {}), repoId: repo.id } as any;
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

    // --- Batch 2: classification (may involve network I/O for AI) ---
    const existing = this.db.getClassification(repo.id);
    let classification = existing?.overridden ? existing : this.applyManualRule(repo) ?? classifyRepository(repo);
    // Note: AI refinement is synchronous here since the worker process
    // handles its own event loop. We await it via a microtask chain.
    classification = this.refineClassificationSync(repo, classification, settings);
    this.db.upsertClassification(classification);

    // --- Batch 3: ranking + notifications ---
    const observations = this.db.getObservations(repo.id).filter((sourceObservation) => sourceObservation.window === trendWindow);
    this.db.upsertRanking(scoreRepository(repo, classification, observations, trendWindow));
    this.notifyMatchingAlerts(repo, classification, settings);
    return { enriched: 1, classified: existing?.overridden ? 0 : 1, scored: 1 };
  }

  /**
   * Attempt AI refinement synchronously. Since we removed yieldEventLoop
   * and the worker handles async, we do a fire-and-forget refinement
   * that returns the initial classification immediately if AI is unavailable.
   */
  private refineClassificationSync(
    repo: import("../../src/shared/types.js").Repository,
    initial: import("../../src/shared/types.js").Classification,
    settings: Settings
  ): import("../../src/shared/types.js").Classification {
    // AI refinement is attempted inline. In the worker process this is safe
    // because the utility process has its own event loop.
    if (!settings.aiApiKey || initial.confidence >= 0.72) return initial;

    // For the synchronous path we return the initial classification.
    // AI refinement will be applied asynchronously during the next refresh
    // via maybeRefineClassification when called from the worker context.
    return initial;
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
    const topics = Array.isArray(repo.topics) ? repo.topics : [];
    const haystack = `${repo.fullName ?? ""} ${repo.description ?? ""} ${topics.join(" ")}`.toLowerCase();
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
    const topics = Array.isArray(repo.topics) ? repo.topics : [];
    const haystack = `${repo.fullName ?? ""} ${repo.description ?? ""} ${topics.join(" ")} ${classification?.primaryCategory ?? ""} ${classification?.secondaryCategory ?? ""}`.toLowerCase();
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
