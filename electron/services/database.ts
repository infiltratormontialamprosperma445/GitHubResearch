import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
  AlertRule,
  CategoryCounts,
  Classification,
  CollectionItem,
  JobStep,
  ManualClassificationRule,
  Note,
  RankingScore,
  RateLimitState,
  RepoFilters,
  RepoRecord,
  RepoSummary,
  Repository,
  RequestCacheEntry,
  RefreshJob,
  RepoSnapshot,
  SearchFilters,
  SearchResult,
  SortOption,
  SourceHealth,
  SourceObservation,
  TrendWindow,
  TrendRun
} from "../../src/shared/types.js";
import { classifyRepository } from "../../src/shared/classifier.js";
import { scoreRepository } from "../../src/shared/ranking.js";

type Row = Record<string, string | number | null>;

class QueryCache {
  private cache = new Map<string, { value: unknown; expiresAt: number }>();
  private defaultTtl: number;

  constructor(ttlMs = 5000) {
    this.defaultTtl = ttlMs;
  }

  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtl) });
  }

  invalidate(pattern?: string): void {
    if (!pattern) { this.cache.clear(); return; }
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }

  get size(): number { return this.cache.size; }
}

export class AppDatabase {
  private queryCache = new QueryCache(3000);

  private constructor(
    private readonly db: Database.Database,
    private readonly dbPath: string
  ) {}

  static async open(): Promise<AppDatabase> {
    const userData = process.env.STAR_INTEL_USER_DATA ?? join(process.cwd(), ".star-intel-data");
    mkdirSync(userData, { recursive: true });
    const dbPath = join(userData, "starIntel.db");
    const oldDbPath = join(userData, "star-intel.sqlite");

    if (existsSync(oldDbPath) && !existsSync(dbPath)) {
      console.warn(
        "Old sql.js database found at",
        oldDbPath,
        "— automatic migration requires sql.js. Starting with a fresh database."
      );
    }

    const db = new Database(dbPath);
    const database = new AppDatabase(db, dbPath);
    database.migrate();
    database.seedIfEmpty();
    database.ensureBaselineCatalog();
    return database;
  }

  get storagePath(): string {
    return this.dbPath;
  }

  /** No-op. better-sqlite3 writes directly to disk. Kept for API compatibility. */
  persist(): void {
    this.queryCache.invalidate();
  }

  backupTo(targetPath: string): string {
    this.db.backup(targetPath);
    return targetPath;
  }

  migrate(): void {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("cache_size = -16384");
    this.db.pragma("temp_store = MEMORY");
    this.db.pragma("mmap_size = 268435456");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("wal_autocheckpoint = 1000");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repositories (
        id TEXT PRIMARY KEY, node_id TEXT, full_name TEXT UNIQUE NOT NULL,
        owner TEXT NOT NULL, name TEXT NOT NULL, description TEXT, url TEXT NOT NULL,
        homepage TEXT, stars INTEGER NOT NULL DEFAULT 0, forks INTEGER NOT NULL DEFAULT 0,
        open_issues INTEGER NOT NULL DEFAULT 0, language TEXT, license TEXT,
        topics TEXT NOT NULL DEFAULT '[]', created_at TEXT, pushed_at TEXT,
        readme_excerpt TEXT, last_seen_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repo_snapshots (
        id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, captured_at TEXT NOT NULL,
        trend_window TEXT NOT NULL, stars INTEGER NOT NULL, forks INTEGER NOT NULL,
        open_issues INTEGER NOT NULL, growth INTEGER NOT NULL,
        FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS trend_runs (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, trend_window TEXT NOT NULL,
        started_at TEXT NOT NULL, completed_at TEXT, status TEXT NOT NULL,
        message TEXT, discovered_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS source_observations (
        id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, source TEXT NOT NULL,
        trend_window TEXT NOT NULL, observed_at TEXT NOT NULL, rank INTEGER,
        stars INTEGER, growth INTEGER, url TEXT, metadata TEXT NOT NULL DEFAULT '{}',
        FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS star_events_daily (
        id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, event_date TEXT NOT NULL,
        stars_added INTEGER NOT NULL, source TEXT NOT NULL,
        UNIQUE(repo_id, event_date, source),
        FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS classifications (
        repo_id TEXT PRIMARY KEY, primary_category TEXT NOT NULL,
        secondary_category TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]',
        confidence REAL NOT NULL, reason TEXT NOT NULL, learning_value TEXT NOT NULL,
        audience TEXT NOT NULL, risks TEXT NOT NULL DEFAULT '[]',
        evidence TEXT NOT NULL DEFAULT '[]', overridden INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS ranking_scores (
        id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, trend_window TEXT NOT NULL,
        score REAL NOT NULL, growth_score REAL NOT NULL, source_score REAL NOT NULL,
        activity_score REAL NOT NULL, quality_score REAL NOT NULL,
        risk_penalty REAL NOT NULL, explanation TEXT NOT NULL DEFAULT '[]',
        source_breakdown TEXT NOT NULL DEFAULT '[]',
        dedupe_confidence REAL NOT NULL DEFAULT 0.7,
        anomaly_reasons TEXT NOT NULL DEFAULT '[]', computed_at TEXT NOT NULL,
        UNIQUE(repo_id, trend_window),
        FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS collections (
        repo_id TEXT PRIMARY KEY, status TEXT NOT NULL, added_at TEXT NOT NULL,
        FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS notes (
        repo_id TEXT PRIMARY KEY, markdown TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL,
        updated_at TEXT NOT NULL, FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, query TEXT NOT NULL,
        enabled INTEGER NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_health (
        id TEXT PRIMARY KEY, label TEXT NOT NULL, configured INTEGER NOT NULL,
        enabled INTEGER NOT NULL, last_run_at TEXT, status TEXT NOT NULL,
        message TEXT NOT NULL, weight REAL NOT NULL, coverage REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS refresh_jobs (
        id TEXT PRIMARY KEY, started_at TEXT NOT NULL, completed_at TEXT,
        status TEXT NOT NULL, windows TEXT NOT NULL DEFAULT '[]',
        discovered INTEGER NOT NULL DEFAULT 0, enriched INTEGER NOT NULL DEFAULT 0,
        classified INTEGER NOT NULL DEFAULT 0, scored INTEGER NOT NULL DEFAULT 0,
        warnings TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS job_steps (
        id TEXT PRIMARY KEY, job_id TEXT NOT NULL, source TEXT NOT NULL,
        trend_window TEXT NOT NULL, step TEXT NOT NULL, status TEXT NOT NULL,
        started_at TEXT NOT NULL, completed_at TEXT, message TEXT,
        count INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(job_id) REFERENCES refresh_jobs(id)
      );
      CREATE TABLE IF NOT EXISTS rate_limits (
        source TEXT NOT NULL, resource TEXT NOT NULL, limit_count INTEGER,
        remaining INTEGER, reset_at TEXT, observed_at TEXT NOT NULL,
        status TEXT NOT NULL, PRIMARY KEY(source, resource)
      );
      CREATE TABLE IF NOT EXISTS request_cache (
        cache_key TEXT PRIMARY KEY, url TEXT NOT NULL, method TEXT NOT NULL,
        body TEXT NOT NULL, headers TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL, expires_at TEXT NOT NULL, status INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS manual_classification_rules (
        id TEXT PRIMARY KEY, pattern TEXT UNIQUE NOT NULL,
        primary_category TEXT NOT NULL, secondary_category TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]', reason TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS data_quality_signals (
        id TEXT PRIMARY KEY, repo_id TEXT NOT NULL, kind TEXT NOT NULL,
        severity TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS repository_aliases (
        alias_full_name TEXT PRIMARY KEY, repo_id TEXT NOT NULL,
        observed_at TEXT NOT NULL, FOREIGN KEY(repo_id) REFERENCES repositories(id)
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS repo_search USING fts5(
        repo_id UNINDEXED, full_name, description, topics, language,
        readme_excerpt, tags, notes_content,
        tokenize='unicode61 remove_diacritics 2'
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS repo_summaries (
        repo_id TEXT PRIMARY KEY, summary_md TEXT NOT NULL,
        summary_type TEXT NOT NULL CHECK(summary_type IN ('ai','rule')),
        model TEXT, prompt_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY(repo_id) REFERENCES repositories(id) ON DELETE CASCADE
      );
    `);

    this.addColumnIfMissing("ranking_scores", "source_breakdown", "TEXT NOT NULL DEFAULT '[]'");
    this.addColumnIfMissing("ranking_scores", "dedupe_confidence", "REAL NOT NULL DEFAULT 0.7");
    this.addColumnIfMissing("ranking_scores", "anomaly_reasons", "TEXT NOT NULL DEFAULT '[]'");

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_observations_repo_id ON source_observations(repo_id);
      CREATE INDEX IF NOT EXISTS idx_observations_repo_window ON source_observations(repo_id, trend_window);
      CREATE INDEX IF NOT EXISTS idx_snapshots_repo_id ON repo_snapshots(repo_id);
      CREATE INDEX IF NOT EXISTS idx_ranking_repo_window ON ranking_scores(repo_id, trend_window);
      CREATE INDEX IF NOT EXISTS idx_classifications_primary ON classifications(primary_category);
      CREATE INDEX IF NOT EXISTS idx_repositories_full_name ON repositories(full_name);
      CREATE INDEX IF NOT EXISTS idx_repositories_stars ON repositories(stars DESC);
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON request_cache(expires_at);
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_observations_source_window ON source_observations(source, trend_window);
      CREATE INDEX IF NOT EXISTS idx_snapshots_repo_window ON repo_snapshots(repo_id, trend_window);
      CREATE INDEX IF NOT EXISTS idx_repositories_language ON repositories(language);
      CREATE INDEX IF NOT EXISTS idx_repositories_pushed ON repositories(pushed_at DESC);
      CREATE INDEX IF NOT EXISTS idx_classifications_confidence ON classifications(confidence DESC);
      CREATE INDEX IF NOT EXISTS idx_refresh_jobs_status ON refresh_jobs(status, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_job_steps_job ON job_steps(job_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_source_health_enabled ON source_health(enabled, weight DESC);
    `);

    this.ensureSocialSourceHealth();
    this.ensureDefaultSettings();
    this.ensureDefaultSourceHealth();
  }

  private addColumnIfMissing(table: string, column: string, definition: string): void {
    const columns = this.rows<Row>(`PRAGMA table_info(${table})`);
    if (columns.some((row) => row.name === column)) return;
    this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  // ========================================================================
  //  FULL-TEXT SEARCH
  // ========================================================================

  searchRepos(query: string, filters: SearchFilters = {}, sort: SortOption = "relevance"): SearchResult[] {
    if (!query || query.trim().length === 0) return [];
    const where: string[] = [];
    const params: (string | number)[] = [];
    where.push("rs.repo_id MATCH ?");
    params.push(query);
    if (filters.windowType) {
      const w = filters.windowType === "historical" ? "monthly" : filters.windowType;
      where.push("rk.trend_window = ?");
      params.push(w);
    }
    if (filters.primaryCategory && filters.primaryCategory !== "All") {
      where.push("c.primary_category = ?");
      params.push(filters.primaryCategory);
    }
    if (filters.language && filters.language !== "All") {
      where.push("r.language = ?");
      params.push(filters.language);
    }
    if (typeof filters.minStars === "number" && filters.minStars > 0) {
      where.push("r.stars >= ?");
      params.push(filters.minStars);
    }
    if (filters.isFavorited) {
      where.push("col.repo_id IS NOT NULL");
    }
    let orderBy: string;
    switch (sort) {
      case "score": orderBy = "rk.score DESC"; break;
      case "stars": orderBy = "r.stars DESC"; break;
      case "growth": orderBy = "rk.growth_score DESC"; break;
      case "recent": orderBy = "r.pushed_at DESC"; break;
      default: orderBy = "bm25(rs) ASC"; break;
    }
    const sql = `
      SELECT rs.repo_id, r.full_name, r.description, r.language, r.stars,
        COALESCE(snap.growth, 0) AS stars_today, c.primary_category, c.tags,
        CASE WHEN col.repo_id IS NOT NULL THEN 1 ELSE 0 END AS is_collected,
        ABS(bm25(rs)) AS relevance_score,
        snippet(rs, 1, '<mark>', '</mark>', '...', 20) AS hl_full_name,
        snippet(rs, 2, '<mark>', '</mark>', '...', 40) AS hl_description,
        snippet(rs, 6, '<mark>', '</mark>', '...', 20) AS hl_tags
      FROM repo_search rs
      JOIN repositories r ON r.id = rs.repo_id
      LEFT JOIN classifications c ON c.repo_id = rs.repo_id
      LEFT JOIN ranking_scores rk ON rk.repo_id = rs.repo_id
      LEFT JOIN collections col ON col.repo_id = rs.repo_id
      LEFT JOIN (SELECT repo_id, MAX(growth) AS growth FROM repo_snapshots GROUP BY repo_id) snap
        ON snap.repo_id = rs.repo_id
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy}
      LIMIT 200`;
    const resultRows = this.rows<Row>(sql, params);
    return resultRows.map((row): SearchResult => ({
      repoId: String(row.repo_id),
      fullName: String(row.full_name),
      description: String(row.description ?? ""),
      language: String(row.language ?? "Unknown"),
      stars: Number(row.stars ?? 0),
      starsToday: Number(row.stars_today ?? 0),
      primaryCategory: String(row.primary_category ?? "Other"),
      tags: safeJsonArray(row.tags),
      isCollected: Boolean(row.is_collected),
      relevanceScore: Number(row.relevance_score ?? 0),
      highlights: {
        fullName: asOptional(row.hl_full_name),
        description: asOptional(row.hl_description),
        tags: asOptional(row.hl_tags),
      },
    }));
  }

  getCategoryCounts(windowType: TrendWindow): CategoryCounts {
    const w = windowType === "historical" ? "monthly" : windowType;
    const resultRows = this.rows<{ primary_category: string; count: number }>(
      `SELECT c.primary_category, COUNT(*) as count
       FROM classifications c JOIN ranking_scores rs ON rs.repo_id = c.repo_id
       WHERE rs.trend_window = ? GROUP BY c.primary_category`, [w]);
    const counts: CategoryCounts = {};
    for (const row of resultRows) {
      counts[String(row.primary_category)] = Number(row.count);
    }
    return counts;
  }

  getSummaryCache(repoId: string): RepoSummary | undefined {
    const row = this.row<Row>("SELECT * FROM repo_summaries WHERE repo_id = ? LIMIT 1", [repoId]);
    if (!row) return undefined;
    return {
      repoId: String(row.repo_id),
      summaryMd: String(row.summary_md),
      summaryType: String(row.summary_type) as "ai" | "rule",
      model: asOptional(row.model),
      createdAt: String(row.created_at),
    };
  }

  saveSummary(repoId: string, summaryMd: string, summaryType: "ai" | "rule", model?: string, promptHash?: string): void {
    this.db.prepare(
      `INSERT INTO repo_summaries (repo_id, summary_md, summary_type, model, prompt_hash, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(repo_id) DO UPDATE SET summary_md=excluded.summary_md,
       summary_type=excluded.summary_type, model=excluded.model,
       prompt_hash=excluded.prompt_hash, created_at=excluded.created_at`
    ).run(repoId, summaryMd, summaryType, model ?? null, promptHash ?? null);
    this.queryCache.invalidate();
  }

  // ========================================================================
  //  FTS INGEST / SYNC
  // ========================================================================

  ingestFts(): void {
    const rebuild = this.db.transaction(() => {
      this.db.exec("DELETE FROM repo_search");
      this.db.exec(`
        INSERT INTO repo_search (repo_id, full_name, description, topics, language, readme_excerpt, tags, notes_content)
        SELECT r.id, r.full_name, COALESCE(r.description,''), COALESCE(r.topics,'[]'),
          COALESCE(r.language,''), COALESCE(r.readme_excerpt,''), COALESCE(c.tags,'[]'), COALESCE(n.markdown,'')
        FROM repositories r
        LEFT JOIN classifications c ON c.repo_id = r.id
        LEFT JOIN notes n ON n.repo_id = r.id`);
    });
    rebuild();
  }

  private syncFtsForRepo(repoId: string): void {
    this.db.prepare("DELETE FROM repo_search WHERE repo_id = ?").run(repoId);
    this.db.prepare(
      `INSERT INTO repo_search (repo_id, full_name, description, topics, language, readme_excerpt, tags, notes_content)
       SELECT r.id, r.full_name, COALESCE(r.description,''), COALESCE(r.topics,'[]'),
         COALESCE(r.language,''), COALESCE(r.readme_excerpt,''), COALESCE(c.tags,'[]'), COALESCE(n.markdown,'')
       FROM repositories r
       LEFT JOIN classifications c ON c.repo_id = r.id
       LEFT JOIN notes n ON n.repo_id = r.id WHERE r.id = ?`
    ).run(repoId);
  }

  private syncFtsForRepoBatch(repoIds: string[]): void {
    if (!repoIds.length) return;
    const sync = this.db.transaction(() => {
      const delStmt = this.db.prepare("DELETE FROM repo_search WHERE repo_id = ?");
      const insStmt = this.db.prepare(
        `INSERT INTO repo_search (repo_id, full_name, description, topics, language, readme_excerpt, tags, notes_content)
         SELECT r.id, r.full_name, COALESCE(r.description,''), COALESCE(r.topics,'[]'),
           COALESCE(r.language,''), COALESCE(r.readme_excerpt,''), COALESCE(c.tags,'[]'), COALESCE(n.markdown,'')
         FROM repositories r
         LEFT JOIN classifications c ON c.repo_id = r.id
         LEFT JOIN notes n ON n.repo_id = r.id WHERE r.id = ?`);
      for (const id of repoIds) { delStmt.run(id); insStmt.run(id); }
    });
    sync();
  }

  ingestRepos(repos: Array<Repository & { growth: number; source: string; rank: number; window: TrendWindow }>): void {
    const now = new Date().toISOString();
    const doIngest = this.db.transaction(() => {
      for (const item of repos) {
        this.upsertRepository(item);
        const existingClass = this.getClassification(item.id);
        const classification = existingClass ?? classifyRepository(item);
        if (!existingClass) this.upsertClassification(classification);
        const observation: SourceObservation = {
          id: `${item.id}:${item.window}:ingest`, repoId: item.id, source: item.source,
          window: item.window, observedAt: now, rank: item.rank, stars: item.stars,
          growth: item.growth, url: item.url, metadata: { ingested: true },
        };
        this.insertObservation(observation);
        this.insertSnapshot({
          id: `${item.id}:${item.window}:${now.slice(0, 10)}`, repoId: item.id,
          capturedAt: now, window: item.window, stars: item.stars, forks: item.forks,
          openIssues: item.openIssues, growth: item.growth,
        });
        const observations = this.getObservations(item.id).filter((o) => o.window === item.window);
        this.upsertRanking(scoreRepository(item, classification, observations, item.window));
      }
    });
    doIngest();
    this.syncFtsForRepoBatch(repos.map((r) => r.id));
    this.queryCache.invalidate();
  }

  // ========================================================================
  //  WRITE OPERATIONS
  // ========================================================================

  canonicalizeRepository(repo: Repository): Repository {
    const existing = this.row<Row>(
      `SELECT r.* FROM repositories r LEFT JOIN repository_aliases a ON a.repo_id = r.id
       WHERE r.id = ? OR r.full_name = ? OR r.node_id = ? OR a.alias_full_name = ? LIMIT 1`,
      [repo.id, repo.fullName, repo.nodeId ?? "", repo.fullName]);
    if (!existing) return repo;
    const existingRepo = repoFromRow(existing);
    if (existingRepo.fullName !== repo.fullName) {
      this.db.prepare(
        "INSERT OR REPLACE INTO repository_aliases (alias_full_name, repo_id, observed_at) VALUES (?, ?, ?)"
      ).run(repo.fullName, existingRepo.id, new Date().toISOString());
      this.queryCache.invalidate();
    }
    return { ...repo, id: existingRepo.id };
  }

  upsertRepository(repo: Repository): void {
    this.db.prepare(
      `INSERT INTO repositories (id, node_id, full_name, owner, name, description, url, homepage, stars, forks,
        open_issues, language, license, topics, created_at, pushed_at, readme_excerpt, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(full_name) DO UPDATE SET node_id=excluded.node_id, description=excluded.description,
        url=excluded.url, homepage=excluded.homepage, stars=excluded.stars, forks=excluded.forks,
        open_issues=excluded.open_issues, language=excluded.language, license=excluded.license,
        topics=excluded.topics, created_at=excluded.created_at, pushed_at=excluded.pushed_at,
        readme_excerpt=COALESCE(excluded.readme_excerpt, repositories.readme_excerpt),
        last_seen_at=excluded.last_seen_at`
    ).run(repo.id, repo.nodeId ?? null, repo.fullName, repo.owner, repo.name, repo.description,
      repo.url, repo.homepage ?? null, repo.stars, repo.forks, repo.openIssues, repo.language,
      repo.license, JSON.stringify(Array.isArray(repo.topics) ? repo.topics : []),
      repo.createdAt ?? null, repo.pushedAt ?? null, repo.readmeExcerpt ?? null, repo.lastSeenAt);
    this.queryCache.invalidate();
  }

  upsertClassification(classification: Classification): void {
    this.db.prepare(
      `INSERT INTO classifications (repo_id, primary_category, secondary_category, tags, confidence, reason,
        learning_value, audience, risks, evidence, overridden, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id) DO UPDATE SET primary_category=excluded.primary_category,
        secondary_category=excluded.secondary_category, tags=excluded.tags, confidence=excluded.confidence,
        reason=excluded.reason, learning_value=excluded.learning_value, audience=excluded.audience,
        risks=excluded.risks, evidence=excluded.evidence, overridden=excluded.overridden,
        updated_at=excluded.updated_at`
    ).run(classification.repoId, classification.primaryCategory, classification.secondaryCategory,
      JSON.stringify(classification.tags), classification.confidence, classification.reason,
      classification.learningValue, classification.audience, JSON.stringify(classification.risks),
      JSON.stringify(classification.evidence), classification.overridden ? 1 : 0, classification.updatedAt);
    this.queryCache.invalidate();
  }

  insertObservation(observation: SourceObservation): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO source_observations (id, repo_id, source, trend_window, observed_at,
        rank, stars, growth, url, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(observation.id, observation.repoId, observation.source, observation.window, observation.observedAt,
      observation.rank ?? null, observation.stars ?? null, observation.growth ?? null,
      observation.url ?? null, JSON.stringify(observation.metadata ?? {}));
    this.queryCache.invalidate();
  }

  insertSnapshot(snapshot: RepoSnapshot): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO repo_snapshots (id, repo_id, captured_at, trend_window, stars, forks, open_issues, growth)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(snapshot.id, snapshot.repoId, snapshot.capturedAt, snapshot.window, snapshot.stars,
      snapshot.forks, snapshot.openIssues, snapshot.growth);
    this.queryCache.invalidate();
  }

  upsertRanking(ranking: RankingScore): void {
    this.db.prepare(
      `INSERT INTO ranking_scores (id, repo_id, trend_window, score, growth_score, source_score, activity_score,
        quality_score, risk_penalty, explanation, source_breakdown, dedupe_confidence, anomaly_reasons, computed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(repo_id, trend_window) DO UPDATE SET score=excluded.score, growth_score=excluded.growth_score,
        source_score=excluded.source_score, activity_score=excluded.activity_score,
        quality_score=excluded.quality_score, risk_penalty=excluded.risk_penalty,
        explanation=excluded.explanation, source_breakdown=excluded.source_breakdown,
        dedupe_confidence=excluded.dedupe_confidence, anomaly_reasons=excluded.anomaly_reasons,
        computed_at=excluded.computed_at`
    ).run(`${ranking.repoId}:${ranking.window}`, ranking.repoId, ranking.window, ranking.score,
      ranking.growthScore, ranking.sourceScore, ranking.activityScore, ranking.qualityScore,
      ranking.riskPenalty, JSON.stringify(ranking.explanation), JSON.stringify(ranking.sourceBreakdown),
      ranking.dedupeConfidence, JSON.stringify(ranking.anomalyReasons), ranking.computedAt);
    this.queryCache.invalidate();
  }

  insertTrendRun(run: TrendRun): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO trend_runs (id, source, trend_window, started_at, completed_at,
        status, message, discovered_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(run.id, run.source, run.window, run.startedAt, run.completedAt ?? null,
      run.status, run.message ?? null, run.discoveredCount);
    this.queryCache.invalidate();
  }

  upsertRefreshJob(job: RefreshJob): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO refresh_jobs (id, started_at, completed_at, status, windows,
        discovered, enriched, classified, scored, warnings) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(job.id, job.startedAt, job.completedAt ?? null, job.status, JSON.stringify(job.windows),
      job.discovered, job.enriched, job.classified, job.scored, JSON.stringify(job.warnings));
    for (const step of job.steps) this.upsertJobStep(step);
    this.queryCache.invalidate();
  }

  upsertJobStep(step: JobStep): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO job_steps (id, job_id, source, trend_window, step, status,
        started_at, completed_at, message, count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(step.id, step.jobId, step.source, step.window, step.step, step.status,
      step.startedAt, step.completedAt ?? null, step.message ?? null, step.count);
    this.queryCache.invalidate();
  }

  latestRefreshJob(): RefreshJob | undefined {
    const row = this.row<Row>("SELECT * FROM refresh_jobs ORDER BY started_at DESC LIMIT 1");
    return row ? this.refreshJobFromRow(row) : undefined;
  }

  upsertRateLimit(state: RateLimitState): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO rate_limits (source, resource, limit_count, remaining, reset_at, observed_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(state.source, state.resource, state.limit ?? null, state.remaining ?? null,
      state.resetAt ?? null, state.observedAt, state.status);
    this.queryCache.invalidate();
  }

  rateLimits(): RateLimitState[] {
    return this.rows<Row>("SELECT * FROM rate_limits ORDER BY observed_at DESC").map(rateLimitFromRow);
  }

  getCache(key: string): RequestCacheEntry | undefined {
    const row = this.row<Row>("SELECT * FROM request_cache WHERE cache_key = ? LIMIT 1", [key]);
    if (!row) return undefined;
    const entry = cacheEntryFromRow(row);
    if (new Date(entry.expiresAt).getTime() < Date.now()) {
      this.db.prepare("DELETE FROM request_cache WHERE cache_key = ?").run(key);
      return undefined;
    }
    return entry;
  }

  setCache(entry: RequestCacheEntry): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO request_cache (cache_key, url, method, body, headers, created_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(entry.key, entry.url, entry.method, entry.body, JSON.stringify(entry.headers),
      entry.createdAt, entry.expiresAt, entry.status);
    this.queryCache.invalidate();
  }

  purgeExpiredCache(): void {
    this.db.prepare("DELETE FROM request_cache WHERE expires_at < ?").run(new Date().toISOString());
    this.queryCache.invalidate();
  }

  manualRules(): ManualClassificationRule[] {
    return this.rows<Row>("SELECT * FROM manual_classification_rules ORDER BY updated_at DESC").map(manualRuleFromRow);
  }

  saveManualRule(rule: ManualClassificationRule): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO manual_classification_rules (id, pattern, primary_category,
        secondary_category, tags, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(rule.id, rule.pattern, rule.primaryCategory, rule.secondaryCategory,
      JSON.stringify(rule.tags), rule.reason, rule.createdAt, rule.updatedAt);
    this.queryCache.invalidate();
  }

  upsertSourceHealth(health: SourceHealth): void {
    this.db.prepare(
      `INSERT INTO source_health (id, label, configured, enabled, last_run_at, status, message, weight, coverage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label, configured=excluded.configured,
         enabled=excluded.enabled, last_run_at=COALESCE(excluded.last_run_at, source_health.last_run_at),
         status=excluded.status, message=excluded.message, weight=excluded.weight, coverage=excluded.coverage`
    ).run(health.id, health.label, health.configured ? 1 : 0, health.enabled ? 1 : 0,
      health.lastRunAt ?? null, health.status, health.message, health.weight, health.coverage);
    this.queryCache.invalidate();
  }

  // ========================================================================
  //  READ OPERATIONS
  // ========================================================================

  listRepos(filters: RepoFilters): RepoRecord[] {
    const cacheKey = `listRepos:${JSON.stringify(filters)}`;
    const cached = this.queryCache.get<RepoRecord[]>(cacheKey);
    if (cached) return cached;
    const where: string[] = ["r.id = c.repo_id", "r.id = rs.repo_id", "rs.trend_window = ?"];
    const params: Array<string | number> = [filters.window === "historical" ? "monthly" : filters.window];
    if (filters.search) {
      where.push("(r.full_name LIKE ? OR r.description LIKE ? OR r.topics LIKE ?)");
      const needle = `%${filters.search}%`;
      params.push(needle, needle, needle);
    }
    if (filters.primaryCategory && filters.primaryCategory !== "All") {
      where.push("c.primary_category = ?"); params.push(filters.primaryCategory);
    }
    if (filters.secondaryCategory && filters.secondaryCategory !== "All") {
      where.push("c.secondary_category = ?"); params.push(filters.secondaryCategory);
    }
    if (filters.language && filters.language !== "All") {
      where.push("r.language = ?"); params.push(filters.language);
    }
    if (typeof filters.minConfidence === "number") {
      where.push("c.confidence >= ?"); params.push(filters.minConfidence);
    }
    if (filters.collectionOnly) where.push("col.repo_id IS NOT NULL");
    const resultRows = this.rows<Row>(
      `SELECT r.*, c.repo_id, c.primary_category, c.secondary_category, c.tags, c.confidence, c.reason,
        c.learning_value, c.audience, c.risks, c.evidence, c.overridden, c.updated_at,
        rs.trend_window, rs.score, rs.growth_score, rs.source_score, rs.activity_score,
        rs.quality_score, rs.risk_penalty, rs.explanation, rs.source_breakdown,
        rs.dedupe_confidence, rs.anomaly_reasons, rs.computed_at,
        col.status AS collection_status, col.added_at AS collection_added_at,
        n.markdown AS note_markdown, n.tags AS note_tags, n.status AS note_status, n.updated_at AS note_updated_at
       FROM repositories r JOIN classifications c JOIN ranking_scores rs
       LEFT JOIN collections col ON col.repo_id = r.id LEFT JOIN notes n ON n.repo_id = r.id
       WHERE ${where.join(" AND ")} ORDER BY rs.score DESC, r.stars DESC LIMIT ?`,
      [...params, filters.limit ?? 200]);
    const repoIds = resultRows.map((row) => String(row.id));
    const observationMap = this.batchLoadObservations(repoIds);
    const snapshotMap = this.batchLoadSnapshots(repoIds);
    const results = resultRows.map((row) => this.recordFromJoinedRow(row, observationMap, snapshotMap));
    this.queryCache.set(cacheKey, results);
    return results;
  }

  getRepo(repoId: string): RepoRecord | undefined {
    const resultRows = this.rows<Row>(
      `SELECT r.*, c.repo_id, c.primary_category, c.secondary_category, c.tags, c.confidence, c.reason,
        c.learning_value, c.audience, c.risks, c.evidence, c.overridden, c.updated_at,
        rs.trend_window, rs.score, rs.growth_score, rs.source_score, rs.activity_score,
        rs.quality_score, rs.risk_penalty, rs.explanation, rs.source_breakdown,
        rs.dedupe_confidence, rs.anomaly_reasons, rs.computed_at,
        col.status AS collection_status, col.added_at AS collection_added_at,
        n.markdown AS note_markdown, n.tags AS note_tags, n.status AS note_status, n.updated_at AS note_updated_at
       FROM repositories r JOIN classifications c ON c.repo_id = r.id
       JOIN ranking_scores rs ON rs.repo_id = r.id
       LEFT JOIN collections col ON col.repo_id = r.id LEFT JOIN notes n ON n.repo_id = r.id
       WHERE r.id = ? ORDER BY rs.score DESC LIMIT 1`, [repoId]);
    return resultRows[0] ? this.recordFromJoinedRow(resultRows[0]) : undefined;
  }

  getRepository(repoId: string): Repository | undefined {
    const r = this.row<Row>("SELECT * FROM repositories WHERE id = ? LIMIT 1", [repoId]);
    return r ? repoFromRow(r) : undefined;
  }

  getClassification(repoId: string): Classification | undefined {
    const r = this.row<Row>("SELECT * FROM classifications WHERE repo_id = ? LIMIT 1", [repoId]);
    return r ? classificationFromRow(r) : undefined;
  }

  getObservations(repoId: string): SourceObservation[] {
    return this.rows<Row>(
      "SELECT * FROM source_observations WHERE repo_id = ? ORDER BY observed_at DESC LIMIT 40", [repoId]
    ).map(observationFromRow);
  }

  getSnapshots(repoId: string): RepoSnapshot[] {
    return this.rows<Row>(
      "SELECT * FROM repo_snapshots WHERE repo_id = ? ORDER BY captured_at DESC LIMIT 120", [repoId]
    ).map(snapshotFromRow);
  }

  private batchLoadObservations(repoIds: string[]): Map<string, SourceObservation[]> {
    if (!repoIds.length) return new Map();
    const placeholders = repoIds.map(() => "?").join(",");
    const allRows = this.rows<Row>(
      `SELECT * FROM source_observations WHERE repo_id IN (${placeholders}) ORDER BY observed_at DESC`, repoIds);
    const map = new Map<string, SourceObservation[]>();
    for (const row of allRows) {
      const repoId = String(row.repo_id);
      const list = map.get(repoId) ?? [];
      if (list.length < 40) list.push(observationFromRow(row));
      map.set(repoId, list);
    }
    return map;
  }

  private batchLoadSnapshots(repoIds: string[]): Map<string, RepoSnapshot[]> {
    if (!repoIds.length) return new Map();
    const placeholders = repoIds.map(() => "?").join(",");
    const allRows = this.rows<Row>(
      `SELECT * FROM repo_snapshots WHERE repo_id IN (${placeholders}) ORDER BY captured_at DESC`, repoIds);
    const map = new Map<string, RepoSnapshot[]>();
    for (const row of allRows) {
      const repoId = String(row.repo_id);
      const list = map.get(repoId) ?? [];
      if (list.length < 120) list.push(snapshotFromRow(row));
      map.set(repoId, list);
    }
    return map;
  }

  sourceHealth(): SourceHealth[] {
    return this.rows<Row>("SELECT * FROM source_health ORDER BY weight DESC").map(sourceHealthFromRow);
  }

  settings(): Record<string, string> {
    const pairs = this.rows<Row>("SELECT key, value FROM settings");
    return Object.fromEntries(pairs.map((row) => [String(row.key), String(row.value)]));
  }

  updateSetting(key: string, value: string): void {
    this.db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
    this.queryCache.invalidate();
  }

  toggleCollection(repoId: string, status = "backlog"): void {
    const existing = this.row<Row>("SELECT repo_id FROM collections WHERE repo_id = ?", [repoId]);
    if (existing) {
      this.db.prepare("DELETE FROM collections WHERE repo_id = ?").run(repoId);
      this.queryCache.invalidate();
      return;
    }
    this.db.prepare("INSERT INTO collections (repo_id, status, added_at) VALUES (?, ?, ?)").run(
      repoId, status, new Date().toISOString());
    this.queryCache.invalidate();
  }

  saveNote(repoId: string, markdown: string, tags: string[], status: string): void {
    this.db.prepare(
      `INSERT INTO notes (repo_id, markdown, tags, status, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(repo_id) DO UPDATE SET markdown=excluded.markdown, tags=excluded.tags,
       status=excluded.status, updated_at=excluded.updated_at`
    ).run(repoId, markdown, JSON.stringify(tags), status, new Date().toISOString());
    this.db.prepare(
      "INSERT OR IGNORE INTO collections (repo_id, status, added_at) VALUES (?, ?, ?)"
    ).run(repoId, status, new Date().toISOString());
    this.syncFtsForRepo(repoId);
    this.queryCache.invalidate();
  }

  saveAlert(rule: Omit<AlertRule, "id" | "createdAt">): AlertRule {
    const alert: AlertRule = { ...rule, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.db.prepare(
      "INSERT INTO alerts (id, kind, query, enabled, created_at) VALUES (?, ?, ?, ?, ?)"
    ).run(alert.id, alert.kind, alert.query, alert.enabled ? 1 : 0, alert.createdAt);
    this.queryCache.invalidate();
    return alert;
  }

  enabledAlerts(): AlertRule[] {
    return this.rows<Row>("SELECT * FROM alerts WHERE enabled = 1 ORDER BY created_at DESC").map((row) => ({
      id: String(row.id), kind: String(row.kind) as AlertRule["kind"],
      query: String(row.query), enabled: Boolean(row.enabled), createdAt: String(row.created_at)
    }));
  }

  learningMarkdown(): string {
    const resultRows = this.rows<Row>(
      `SELECT r.full_name, r.url, c.primary_category, c.secondary_category, n.status, n.tags, n.markdown
       FROM notes n JOIN repositories r ON r.id = n.repo_id
       JOIN classifications c ON c.repo_id = r.id ORDER BY n.updated_at DESC`);
    if (!resultRows.length) return "# Star Intel Desk Learning Notes\n\nNo notes yet.\n";
    return ["# Star Intel Desk Learning Notes", "",
      ...resultRows.flatMap((row) => [`## ${row.full_name}`, "", `- URL: ${row.url}`,
        `- Category: ${row.primary_category} / ${row.secondary_category}`,
        `- Status: ${row.status}`, `- Tags: ${safeJsonArray(row.tags).join(", ") || "none"}`,
        "", String(row.markdown || "").trim() || "_No note body._", ""])
    ].join("\n");
  }

  recomputeRepo(repoId: string, trendWindow: string): void {
    const repo = this.getRepository(repoId);
    if (!repo) return;
    const classification = this.getClassification(repoId) ?? classifyRepository(repo);
    const observations = this.getObservations(repoId).filter((item) => item.window === trendWindow);
    this.upsertRanking(scoreRepository(repo, classification, observations, trendWindow as never));
  }

  countRepos(): number {
    const r = this.row<{ count: number }>("SELECT COUNT(*) AS count FROM repositories");
    return Number(r?.count ?? 0);
  }

  // ========================================================================
  //  PRIVATE HELPERS
  // ========================================================================

  private recordFromJoinedRow(row: Row, observationMap?: Map<string, SourceObservation[]>,
    snapshotMap?: Map<string, RepoSnapshot[]>): RepoRecord {
    const repo = repoFromRow(row);
    const record: RepoRecord = {
      repo, classification: classificationFromRow(row), ranking: rankingFromRow(row),
      observations: observationMap?.get(repo.id) ?? this.getObservations(repo.id),
      snapshots: snapshotMap?.get(repo.id) ?? this.getSnapshots(repo.id)
    };
    if (row.collection_status) {
      record.collection = { repoId: repo.id, status: row.collection_status as CollectionItem["status"],
        addedAt: String(row.collection_added_at) };
    }
    if (row.note_markdown !== null && row.note_markdown !== undefined) {
      record.note = { repoId: repo.id, markdown: String(row.note_markdown),
        tags: safeJsonArray(row.note_tags), status: String(row.note_status) as Note["status"],
        updatedAt: String(row.note_updated_at) };
    }
    return record;
  }

  private refreshJobFromRow(row: Row): RefreshJob {
    const jobId = String(row.id);
    const steps = this.rows<Row>(
      "SELECT * FROM job_steps WHERE job_id = ? ORDER BY started_at ASC", [jobId]
    ).map(jobStepFromRow);
    return { id: jobId, startedAt: String(row.started_at), completedAt: asOptional(row.completed_at),
      status: String(row.status) as RefreshJob["status"], windows: safeJsonArray(row.windows),
      discovered: Number(row.discovered ?? 0), enriched: Number(row.enriched ?? 0),
      classified: Number(row.classified ?? 0), scored: Number(row.scored ?? 0),
      warnings: safeJsonArray(row.warnings), steps };
  }

  private rows<T extends Row>(sql: string, params: Array<string | number | null> = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  private row<T extends Row>(sql: string, params: Array<string | number | null> = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  // ========================================================================
  //  DEFAULT SEED DATA
  // ========================================================================

  private ensureDefaultSettings(): void {
    const defaults: Record<string, string> = {
      githubToken: "", bigQueryProjectId: "", aiApiKey: "", aiBaseUrl: "https://api.openai.com/v1",
      aiModel: "gpt-4.1-mini", refreshTime: "08:30", proxyUrl: "", startAtLogin: "false",
      backgroundRefresh: "true",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      cacheTtlHours: "6", maxReposPerWindow: "200", enableNotifications: "true", backupPath: ""
    };
    const stmt = this.db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    const insertDefaults = this.db.transaction(() => {
      for (const [key, value] of Object.entries(defaults)) stmt.run(key, value);
    });
    insertDefaults();
  }

  private ensureDefaultSourceHealth(): void {
    const defaults: SourceHealth[] = [
      { id: "github-trending", label: "GitHub Trending", configured: true, enabled: true, status: "unknown",
        message: "Ready to fetch daily, weekly, and monthly trending pages.", weight: 1, coverage: 0.8 },
      { id: "github-search", label: "GitHub Search API", configured: false, enabled: true, status: "degraded",
        message: "Works best after adding a GitHub token.", weight: 0.9, coverage: 0.65 },
      { id: "github-stargazers", label: "GitHub Stargazers API", configured: false, enabled: true, status: "disabled",
        message: "Configured automatically when GitHub token is present.", weight: 0.7, coverage: 0.35 },
      { id: "gh-archive", label: "GH Archive WatchEvents", configured: true, enabled: true, status: "unknown",
        message: "Direct WatchEvent sampling is ready; BigQuery can be added later for deeper backfill.",
        weight: 0.85, coverage: 0.32 },
      { id: "third-party", label: "Third-party Trend Sources", configured: true, enabled: true, status: "unknown",
        message: "Used only as supplemental cross-checks.", weight: 0.45, coverage: 0.2 }
    ];
    defaults.forEach((item) => this.upsertSourceHealth(item));
  }

  private ensureSocialSourceHealth(): void {
    const socialSources: SourceHealth[] = [
      { id: "telegram-trends", label: "Telegram AI Channels", configured: true, enabled: true, status: "unknown",
        message: "Monitors AI-focused Telegram channels for GitHub project signals.", weight: 0.7, coverage: 0.35 },
      { id: "twitter-trends", label: "X (Twitter) AI Signals", configured: true, enabled: true, status: "unknown",
        message: "Monitors AI discussions on X via public search and supplemental feeds.", weight: 0.65, coverage: 0.3 }
    ];
    socialSources.forEach((item) => this.upsertSourceHealth(item));
  }

  private ensureBaselineCatalog(): void {
    const now = new Date().toISOString();
    const seeds: Array<Repository & { growth: number; source: string; rank: number }> = [
      baselineRepo("github:openai/openai-agents-python", "openai/openai-agents-python", "Python framework for building multi-agent AI applications.", 24000, 3300, 260, "Python", "MIT", ["agents", "agent-framework", "llm", "python"], "A lightweight framework for orchestrating agents, handoffs, guardrails, and tools.", 3120, 1),
      baselineRepo("github:langchain-ai/langchain", "langchain-ai/langchain", "Build context-aware reasoning applications and agent workflows.", 118000, 18000, 2100, "Python", "MIT", ["llm", "agents", "rag", "python"], "Framework for developing applications powered by language models, agents, tools, and retrieval.", 4320, 2),
      baselineRepo("github:ollama/ollama", "ollama/ollama", "Run large language models locally.", 145000, 12000, 1600, "Go", "MIT", ["llm", "local-ai", "model-serving", "inference"], "Get up and running with large language models locally.", 5280, 3),
      baselineRepo("github:modelcontextprotocol/servers", "modelcontextprotocol/servers", "Reference MCP servers for connecting AI assistants to tools and data.", 62000, 7200, 480, "TypeScript", "MIT", ["mcp", "tools", "agents", "typescript"], "Model Context Protocol servers expose filesystems, repositories, databases, and tools to AI clients.", 6960, 4),
      baselineRepo("github:microsoft/autogen", "microsoft/autogen", "Programming framework for agentic AI.", 48000, 7200, 520, "Python", "MIT", ["agents", "multi-agent", "llm", "framework"], "A framework for creating multi-agent applications and conversational workflows.", 2760, 5),
      baselineRepo("github:crewaiinc/crewai", "crewAIInc/crewAI", "Framework for orchestrating role-playing autonomous AI agents.", 33000, 4300, 340, "Python", "MIT", ["agents", "automation", "llm", "multi-agent"], "CrewAI helps coordinate agents, tasks, tools, and processes.", 2380, 6),
      baselineRepo("github:run-llama/llama_index", "run-llama/llama_index", "Data framework for LLM applications and retrieval augmented generation.", 39000, 5300, 720, "Python", "MIT", ["rag", "llm", "knowledge-base", "retrieval"], "Connect private data to LLM applications through indexes, retrieval, and agents.", 2140, 7),
      baselineRepo("github:cline/cline", "cline/cline", "Autonomous coding agent inside the IDE.", 52000, 6100, 880, "TypeScript", "Apache-2.0", ["coding-agent", "developer-tools", "llm", "vscode"], "Cline can use tools, edit files, run commands, and complete software tasks.", 3560, 8),
      baselineRepo("github:browser-use/browser-use", "browser-use/browser-use", "Make websites accessible for AI agents.", 71000, 8200, 520, "Python", "MIT", ["agents", "browser", "automation", "llm"], "Browser automation primitives for AI agents that need to operate websites.", 4820, 9),
      baselineRepo("github:vllm-project/vllm", "vllm-project/vllm", "High-throughput and memory-efficient inference and serving engine for LLMs.", 36000, 5600, 980, "Python", "Apache-2.0", ["llm", "model-serving", "inference", "gpu"], "Serve large language models efficiently with paged attention and production APIs.", 1980, 10),
      baselineRepo("github:vercel/next.js", "vercel/next.js", "The React framework for production web applications.", 132000, 28000, 3100, "JavaScript", "MIT", ["react", "framework", "frontend", "web"], "Server rendering, routing, bundling, and frontend application architecture.", 1420, 11),
      baselineRepo("github:shadcn-ui/ui", "shadcn-ui/ui", "Beautifully designed components that you can copy and paste into your apps.", 92000, 6200, 950, "TypeScript", "MIT", ["react", "components", "ui", "design-system"], "A component system centered on ownership, accessibility, and product UI composition.", 1740, 12),
      baselineRepo("github:vitejs/vite", "vitejs/vite", "Next generation frontend tooling.", 78000, 7200, 620, "TypeScript", "MIT", ["frontend", "build-tool", "developer-tools", "javascript"], "Fast dev server and build tooling for modern frontend applications.", 1160, 13),
      baselineRepo("github:fastapi/fastapi", "fastapi/fastapi", "FastAPI framework, high performance, easy to learn, fast to code.", 84000, 7600, 520, "Python", "MIT", ["api", "backend", "framework", "python"], "Modern API framework with type hints, validation, and OpenAPI integration.", 1260, 14),
      baselineRepo("github:supabase/supabase", "supabase/supabase", "The open source Firebase alternative.", 79000, 8500, 980, "TypeScript", "Apache-2.0", ["backend", "database", "postgres", "api"], "A backend platform combining Postgres, auth, storage, realtime, and edge functions.", 1880, 15),
      baselineRepo("github:gin-gonic/gin", "gin-gonic/gin", "Gin is a high-performance HTTP web framework written in Go.", 82000, 8200, 850, "Go", "MIT", ["backend", "api", "go", "http"], "Minimal and fast HTTP routing patterns for backend services.", 840, 16),
      baselineRepo("github:duckdb/duckdb", "duckdb/duckdb", "DuckDB is an analytical in-process SQL database management system.", 31000, 2600, 1250, "C++", "MIT", ["database", "analytics", "sql", "olap"], "Embedded analytics database for local-first data workflows.", 1080, 17),
      baselineRepo("github:clickhouse/clickhouse", "ClickHouse/ClickHouse", "ClickHouse is a fast open-source column-oriented database management system.", 39000, 7200, 3400, "C++", "Apache-2.0", ["database", "analytics", "olap", "sql"], "Columnar analytics database for high-throughput observability and product data.", 1320, 18),
      baselineRepo("github:apache/airflow", "apache/airflow", "Platform to programmatically author, schedule, and monitor workflows.", 39000, 15000, 1200, "Python", "Apache-2.0", ["data", "workflow", "etl", "pipeline"], "Workflow orchestration patterns for data engineering and platform automation.", 920, 19),
      baselineRepo("github:pingcap/tidb", "pingcap/tidb", "TiDB is an open-source distributed SQL database.", 38000, 5800, 850, "Go", "Apache-2.0", ["database", "sql", "distributed", "analytics"], "Distributed SQL database for hybrid transactional and analytical workloads.", 760, 20),
      baselineRepo("github:projectdiscovery/nuclei", "projectdiscovery/nuclei", "Fast and customizable vulnerability scanner based on simple YAML templates.", 23000, 2900, 520, "Go", "MIT", ["security", "scanner", "vulnerability", "automation"], "Security automation patterns using templates, workflows, and high-scale scanning.", 980, 21),
      baselineRepo("github:trufflesecurity/trufflehog", "trufflesecurity/trufflehog", "Find, verify, and analyze leaked credentials.", 19000, 1800, 240, "Go", "AGPL-3.0", ["security", "secrets", "scanner", "devsecops"], "Secret scanning and verification workflows for code and infrastructure.", 720, 22),
      baselineRepo("github:kubernetes/kubernetes", "kubernetes/kubernetes", "Production-grade container scheduling and management.", 113000, 40000, 2800, "Go", "Apache-2.0", ["kubernetes", "containers", "infrastructure", "orchestration"], "Core orchestration architecture for distributed systems and platform engineering.", 1100, 23),
      baselineRepo("github:grafana/grafana", "grafana/grafana", "The open and composable observability and data visualization platform.", 68000, 13000, 3900, "TypeScript", "AGPL-3.0", ["observability", "monitoring", "dashboard", "devops"], "Visualization, dashboard, alerting, and plugin architecture for observability.", 940, 24),
      baselineRepo("github:opentofu/opentofu", "opentofu/opentofu", "OpenTofu lets you declaratively manage cloud infrastructure.", 24000, 950, 420, "Go", "MPL-2.0", ["terraform", "iac", "devops", "infrastructure"], "Infrastructure as Code patterns and provider-driven cloud automation.", 1120, 25),
      baselineRepo("github:rust-lang/rust", "rust-lang/rust", "Empowering everyone to build reliable and efficient software.", 102000, 13000, 9800, "Rust", "MIT", ["compiler", "systems", "language", "runtime"], "Compiler, language design, and systems programming implementation patterns.", 780, 26),
      baselineRepo("github:ziglang/zig", "ziglang/zig", "General-purpose programming language and toolchain for maintaining robust software.", 39000, 2800, 3300, "Zig", "MIT", ["compiler", "systems", "language", "toolchain"], "Systems language and compiler toolchain design.", 860, 27),
      baselineRepo("github:tauri-apps/tauri", "tauri-apps/tauri", "Build smaller, faster, and more secure desktop applications with a web frontend.", 98000, 3000, 930, "Rust", "Apache-2.0", ["desktop", "rust", "webview", "apps"], "Desktop application architecture using Rust, webviews, permissions, and plugins.", 1680, 28),
      baselineRepo("github:flutter/flutter", "flutter/flutter", "Flutter makes it easy and fast to build beautiful apps for mobile and beyond.", 170000, 29000, 13000, "Dart", "BSD-3-Clause", ["mobile", "desktop", "ui", "framework"], "Cross-platform UI framework and large-scale SDK governance.", 1500, 29),
      baselineRepo("github:sindresorhus/awesome", "sindresorhus/awesome", "Awesome lists about all kinds of interesting topics.", 360000, 29000, 80, "Unknown", "CC0-1.0", ["awesome", "learning", "resources", "curation"], "Curation patterns for learning maps and ecosystem discovery.", 620, 30),
      baselineRepo("github:codecrafters-io/build-your-own-x", "codecrafters-io/build-your-own-x", "Master programming by recreating your favorite technologies from scratch.", 350000, 33000, 220, "Markdown", "Unknown", ["learning", "tutorial", "systems", "education"], "Learning paths for rebuilding databases, shells, compilers, and tools.", 840, 31),
      baselineRepo("github:logseq/logseq", "logseq/logseq", "A privacy-first, open-source platform for knowledge management and collaboration.", 35000, 2100, 1500, "Clojure", "AGPL-3.0", ["notes", "knowledge-management", "productivity", "local-first"], "Local-first knowledge management, graph notes, and plugin ecosystem design.", 680, 32)
    ];

    const seedAll = this.db.transaction(() => {
      for (const seed of seeds) {
        const existingRepo = this.getRepository(seed.id);
        const repo = existingRepo ?? seed;
        if (!existingRepo) this.upsertRepository(seed);
        const existingClassification = this.getClassification(repo.id);
        const classification = existingClassification ?? classifyRepository(repo);
        if (!existingClassification) this.upsertClassification(classification);
        for (const window of ["daily", "weekly", "monthly"] as const) {
          const growth = Math.max(6, Math.round(seed.growth * (window === "daily" ? 0.3 : window === "weekly" ? 1 : 2.6)));
          const observation: SourceObservation = {
            id: `${repo.id}:${window}:baseline-catalog`, repoId: repo.id, source: seed.source,
            window, observedAt: now, rank: seed.rank, stars: repo.stars, growth, url: repo.url,
            metadata: { seeded: true, catalog: "baseline" }
          };
          this.insertObservation(observation);
          this.insertSnapshot({ id: `${repo.id}:${window}:baseline-catalog`, repoId: repo.id,
            capturedAt: now, window, stars: repo.stars, forks: repo.forks, openIssues: repo.openIssues, growth });
          const observations = this.getObservations(repo.id).filter((item) => item.window === window);
          this.upsertRanking(scoreRepository(repo, classification, observations, window));
        }
      }
    });
    seedAll();
    this.ingestFts();
  }

  private seedIfEmpty(): void {
    if (this.countRepos() > 0) return;
    const now = new Date().toISOString();
    const seeds: Array<Repository & { growth: number; window: "daily" | "weekly" | "monthly"; source: string; rank: number }> = [
      { id: "github:langchain-ai/langchain", fullName: "langchain-ai/langchain", owner: "langchain-ai", name: "langchain",
        description: "Build context-aware reasoning applications and agent workflows.",
        url: "https://github.com/langchain-ai/langchain", stars: 118000, forks: 18000, openIssues: 2100,
        language: "Python", license: "MIT", topics: ["llm", "agents", "rag", "python"],
        createdAt: "2022-10-17T00:00:00.000Z", pushedAt: now,
        readmeExcerpt: "Framework for developing applications powered by language models, agents, tools, and retrieval.",
        lastSeenAt: now, growth: 1800, window: "weekly", source: "Seed Dataset", rank: 1 },
      { id: "github:modelcontextprotocol/servers", fullName: "modelcontextprotocol/servers", owner: "modelcontextprotocol",
        name: "servers", description: "Reference MCP servers for connecting AI assistants to tools and data.",
        url: "https://github.com/modelcontextprotocol/servers", stars: 62000, forks: 7200, openIssues: 480,
        language: "TypeScript", license: "MIT", topics: ["mcp", "tools", "agents", "typescript"],
        createdAt: "2024-11-01T00:00:00.000Z", pushedAt: now,
        readmeExcerpt: "Model Context Protocol servers expose filesystems, repositories, databases, and tools to AI clients.",
        lastSeenAt: now, growth: 2900, window: "daily", source: "Seed Dataset", rank: 2 },
      { id: "github:openai/openai-agents-python", fullName: "openai/openai-agents-python", owner: "openai",
        name: "openai-agents-python", description: "Python framework for building multi-agent AI applications.",
        url: "https://github.com/openai/openai-agents-python", stars: 24000, forks: 3300, openIssues: 260,
        language: "Python", license: "MIT", topics: ["agents", "agent-framework", "llm", "python"],
        createdAt: "2025-03-01T00:00:00.000Z", pushedAt: now,
        readmeExcerpt: "A lightweight, flexible framework for orchestrating agents, handoffs, guardrails, and tools.",
        lastSeenAt: now, growth: 1300, window: "weekly", source: "Seed Dataset", rank: 3 },
      { id: "github:vercel/next.js", fullName: "vercel/next.js", owner: "vercel", name: "next.js",
        description: "The React framework for production web applications.",
        url: "https://github.com/vercel/next.js", stars: 132000, forks: 28000, openIssues: 3100,
        language: "JavaScript", license: "MIT", topics: ["react", "framework", "frontend", "web"],
        createdAt: "2016-10-05T00:00:00.000Z", pushedAt: now,
        readmeExcerpt: "Next.js gives you the best developer experience with server rendering, routing, and bundling.",
        lastSeenAt: now, growth: 900, window: "monthly", source: "Seed Dataset", rank: 4 },
      { id: "github:ollama/ollama", fullName: "ollama/ollama", owner: "ollama", name: "ollama",
        description: "Run large language models locally.", url: "https://github.com/ollama/ollama",
        stars: 145000, forks: 12000, openIssues: 1600, language: "Go", license: "MIT",
        topics: ["llm", "local-ai", "model-serving", "inference"], createdAt: "2023-06-26T00:00:00.000Z",
        pushedAt: now, readmeExcerpt: "Get up and running with large language models locally.",
        lastSeenAt: now, growth: 2200, window: "monthly", source: "Seed Dataset", rank: 5 },
      { id: "github:microsoft/vscode", fullName: "microsoft/vscode", owner: "microsoft", name: "vscode",
        description: "Visual Studio Code.", url: "https://github.com/microsoft/vscode", stars: 170000,
        forks: 33000, openIssues: 9500, language: "TypeScript", license: "MIT",
        topics: ["editor", "developer-tools", "desktop", "typescript"], createdAt: "2015-09-03T00:00:00.000Z",
        pushedAt: now, readmeExcerpt: "Code editing. Redefined.",
        lastSeenAt: now, growth: 700, window: "historical" as never, source: "Seed Dataset", rank: 6 }
    ];
    const seedAll = this.db.transaction(() => {
      for (const seed of seeds) {
        this.upsertRepository(seed);
        const classification = classifyRepository(seed);
        this.upsertClassification(classification);
        const windows = ["daily", "weekly", "monthly"] as const;
        for (const window of windows) {
          const growth = Math.max(10, Math.round(seed.growth * (window === "daily" ? 0.28 : window === "weekly" ? 1 : 2.4)));
          const observation: SourceObservation = {
            id: `${seed.id}:${window}:seed`, repoId: seed.id, source: seed.source,
            window, observedAt: now, rank: seed.rank, stars: seed.stars, growth, url: seed.url,
            metadata: { seeded: true }
          };
          this.insertObservation(observation);
          this.insertSnapshot({ id: `${seed.id}:${window}:${now.slice(0, 10)}`, repoId: seed.id,
            capturedAt: now, window, stars: seed.stars, forks: seed.forks, openIssues: seed.openIssues, growth });
          this.upsertRanking(scoreRepository(seed, classification, [observation], window));
        }
      }
    });
    seedAll();
    this.ingestFts();
  }
}

// ---------------------------------------------------------------------------
// Module-level helper functions
// ---------------------------------------------------------------------------

function baselineRepo(id: string, fullName: string, description: string, stars: number,
  forks: number, openIssues: number, language: string, license: string, topics: string[],
  readmeExcerpt: string, growth: number, rank: number
): Repository & { growth: number; source: string; rank: number } {
  const [owner, name] = fullName.split("/");
  const now = new Date().toISOString();
  return { id, fullName, owner, name, description, url: `https://github.com/${fullName}`,
    stars, forks, openIssues, language, license, topics, pushedAt: now, readmeExcerpt,
    lastSeenAt: now, growth, source: "Baseline Catalog", rank };
}

function repoFromRow(row: Row): Repository {
  return { id: String(row.id), nodeId: asOptional(row.node_id),
    fullName: String(row.full_name ?? "unknown/unknown"), owner: String(row.owner ?? "unknown"),
    name: String(row.name ?? "unknown"), description: String(row.description ?? ""),
    url: String(row.url ?? ""), homepage: asOptional(row.homepage),
    stars: Number(row.stars ?? 0), forks: Number(row.forks ?? 0),
    openIssues: Number(row.open_issues ?? 0), language: String(row.language ?? "Unknown"),
    license: String(row.license ?? "Unknown"), topics: safeJsonArray<string>(row.topics),
    createdAt: asOptional(row.created_at), pushedAt: asOptional(row.pushed_at),
    readmeExcerpt: asOptional(row.readme_excerpt),
    lastSeenAt: String(row.last_seen_at ?? new Date().toISOString()) };
}

function classificationFromRow(row: Row): Classification {
  return { repoId: String(row.repo_id),
    primaryCategory: String(row.primary_category) as Classification["primaryCategory"],
    secondaryCategory: String(row.secondary_category), tags: safeJsonArray(row.tags),
    confidence: Number(row.confidence ?? 0), reason: String(row.reason ?? ""),
    learningValue: String(row.learning_value ?? ""), audience: String(row.audience ?? ""),
    risks: safeJsonArray(row.risks), evidence: safeJsonArray(row.evidence),
    overridden: Boolean(row.overridden), updatedAt: String(row.updated_at) };
}

function rankingFromRow(row: Row): RankingScore {
  return { repoId: String(row.repo_id), window: String(row.trend_window) as RankingScore["window"],
    score: Number(row.score ?? 0), growthScore: Number(row.growth_score ?? 0),
    sourceScore: Number(row.source_score ?? 0), activityScore: Number(row.activity_score ?? 0),
    qualityScore: Number(row.quality_score ?? 0), riskPenalty: Number(row.risk_penalty ?? 0),
    explanation: safeJsonArray(row.explanation), sourceBreakdown: safeJsonArray(row.source_breakdown),
    dedupeConfidence: Number(row.dedupe_confidence ?? 0.7),
    anomalyReasons: safeJsonArray(row.anomaly_reasons), computedAt: String(row.computed_at) };
}

function observationFromRow(row: Row): SourceObservation {
  return { id: String(row.id), repoId: String(row.repo_id), source: String(row.source),
    window: String(row.trend_window) as SourceObservation["window"], observedAt: String(row.observed_at),
    rank: row.rank === null ? undefined : Number(row.rank),
    stars: row.stars === null ? undefined : Number(row.stars),
    growth: row.growth === null ? undefined : Number(row.growth),
    url: asOptional(row.url), metadata: safeJson<Record<string, unknown>>(row.metadata, {}) };
}

function snapshotFromRow(row: Row): RepoSnapshot {
  return { id: String(row.id), repoId: String(row.repo_id), capturedAt: String(row.captured_at),
    window: String(row.trend_window) as RepoSnapshot["window"], stars: Number(row.stars ?? 0),
    forks: Number(row.forks ?? 0), openIssues: Number(row.open_issues ?? 0),
    growth: Number(row.growth ?? 0) };
}

function sourceHealthFromRow(row: Row): SourceHealth {
  return { id: String(row.id), label: String(row.label), configured: Boolean(row.configured),
    enabled: Boolean(row.enabled), lastRunAt: asOptional(row.last_run_at),
    status: String(row.status) as SourceHealth["status"], message: String(row.message),
    weight: Number(row.weight ?? 0), coverage: Number(row.coverage ?? 0) };
}

function jobStepFromRow(row: Row): JobStep {
  return { id: String(row.id), jobId: String(row.job_id), source: String(row.source),
    window: String(row.trend_window) as JobStep["window"], step: String(row.step) as JobStep["step"],
    status: String(row.status) as JobStep["status"], startedAt: String(row.started_at),
    completedAt: asOptional(row.completed_at), message: asOptional(row.message),
    count: Number(row.count ?? 0) };
}

function rateLimitFromRow(row: Row): RateLimitState {
  return { source: String(row.source), resource: String(row.resource),
    limit: row.limit_count === null ? undefined : Number(row.limit_count),
    remaining: row.remaining === null ? undefined : Number(row.remaining),
    resetAt: asOptional(row.reset_at), observedAt: String(row.observed_at),
    status: String(row.status) as RateLimitState["status"] };
}

function cacheEntryFromRow(row: Row): RequestCacheEntry {
  return { key: String(row.cache_key), url: String(row.url), method: String(row.method),
    body: String(row.body), headers: safeJson<Record<string, string>>(row.headers, {}),
    createdAt: String(row.created_at), expiresAt: String(row.expires_at),
    status: Number(row.status ?? 200) };
}

function manualRuleFromRow(row: Row): ManualClassificationRule {
  return { id: String(row.id), pattern: String(row.pattern),
    primaryCategory: String(row.primary_category) as ManualClassificationRule["primaryCategory"],
    secondaryCategory: String(row.secondary_category), tags: safeJsonArray(row.tags),
    reason: String(row.reason), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function safeJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function safeJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}

function asOptional(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}
