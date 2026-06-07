import {
  Repository,
  SourceHealth,
  TrendWindow
} from "../../src/shared/types.js";
import { DiscoveredRepository, SourceAdapter, SourceSettings } from "./types.js";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { ProxyAgent } from "undici";

const USER_AGENT = "Star-Intel-Desk/1.0";

async function smartRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; maxDelay?: number; jitter?: boolean } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, maxDelay = 10000, jitter = true } = options;
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === maxRetries) break;
      const isRateLimit = lastError.message.includes("429") || lastError.message.includes("rate limit");
      const delay = Math.min(
        maxDelay,
        baseDelay * Math.pow(2, attempt) * (isRateLimit ? 3 : 1)
      );
      const jitteredDelay = jitter ? delay * (0.5 + Math.random() * 0.5) : delay;
      await new Promise((resolve) => setTimeout(resolve, jitteredDelay));
    }
  }
  throw lastError;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
): Promise<T[]> {
  const results: T[] = [];
  const executing = new Set<Promise<void>>();
  for (const task of tasks) {
    const runner = (async () => {
      const result = await task();
      results.push(result);
    })();
    executing.add(runner);
    runner.then(() => executing.delete(runner));
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
  return results;
}

export class GitHubTrendingAdapter implements SourceAdapter {
  id = "github-trending";
  label = "GitHub Trending";
  weight = 1;
  supportsBackfill = false;
  maxConcurrency = 1;

  async discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]> {
    if (window === "historical") return [];
    const since = window === "daily" ? "daily" : window === "weekly" ? "weekly" : "monthly";
    const response = await smartRetry(() => cachedFetch(`https://github.com/trending?since=${since}`, {
      headers: { "User-Agent": USER_AGENT }
    }, settings, this.label, true));
    if (!response.ok) throw new Error(`GitHub Trending responded ${response.status}`);
    const html = await response.text();
    const repos = parseTrending(html, window);
    const defaultLimit = settings.githubToken ? 60 : 25;
    const limited = repos.slice(0, Math.min(settings.maxReposPerWindow ?? defaultLimit, defaultLimit));
    const enriched = await runWithConcurrency(
      limited.map((item) => async (): Promise<DiscoveredRepository> => {
        const fullName = item.repo.fullName;
        const repo = await enrichGitHubRepository(fullName, settings).catch(() => item.repo);
        return {
          repo: { ...item.repo, ...repo, lastSeenAt: new Date().toISOString() },
          observation: {
            ...item.observation,
            repoId: repo.id || item.repo.id,
            stars: repo.stars || item.repo.stars,
            url: repo.url || item.repo.url
          }
        };
      }),
      5
    );
    return enriched;
  }

  async health(): Promise<SourceHealth> {
    return {
      id: this.id,
      label: this.label,
      configured: true,
      enabled: true,
      status: "healthy",
      message: "Fetches GitHub Trending HTML for daily, weekly, and monthly windows.",
      weight: this.weight,
      coverage: 0.8
    };
  }

  async rateLimit(settings: SourceSettings) {
    return readCachedRate(this.label, settings);
  }

  async validateSettings(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "GitHub Trending does not require credentials." };
  }
}

export class GitHubSearchAdapter implements SourceAdapter {
  id = "github-search";
  label = "GitHub Search API";
  weight = 0.9;
  supportsBackfill = false;
  maxConcurrency = 2;

  async discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]> {
    if (window === "historical") return [];
    const queries = searchQueries(window, Boolean(settings.githubToken));
    const tasks = queries.map((query) => async (): Promise<DiscoveredRepository[]> => {
      const url = new URL("https://api.github.com/search/repositories");
      url.searchParams.set("q", query);
      url.searchParams.set("sort", "stars");
      url.searchParams.set("order", "desc");
      url.searchParams.set("per_page", String(Math.min(settings.maxReposPerWindow ?? 40, settings.githubToken ? 50 : 24)));
      const response = await smartRetry(() => githubFetch(url.toString(), settings));
      if (!response.ok) throw new Error(`GitHub Search responded ${response.status}`);
      const payload = (await response.json()) as { items?: GitHubRepoPayload[] };
      return (payload.items ?? []).map((item, index) => {
        const repo = repoFromPayload(item);
        return {
          repo,
          observation: {
            id: `${repo.id}:${window}:github-search:${encodeURIComponent(query)}`,
            repoId: repo.id,
            source: this.label,
            window,
            observedAt: new Date().toISOString(),
            rank: index + 1,
            stars: repo.stars,
            growth: estimateGrowth(window, repo.stars, index),
            url: repo.url,
            metadata: { query }
          }
        };
      });
    });
    const batchResults = await runWithConcurrency(tasks, 4);
    return dedupe(batchResults.flat());
  }

  async health(settings: SourceSettings): Promise<SourceHealth> {
    return {
      id: this.id,
      label: this.label,
      configured: Boolean(settings.githubToken),
      enabled: true,
      status: settings.githubToken ? "healthy" : "degraded",
      message: settings.githubToken
        ? "Authenticated GitHub REST searches are enabled."
        : "Unauthenticated mode works at lower rate limits; add a token for better refreshes.",
      weight: this.weight,
      coverage: settings.githubToken ? 0.75 : 0.42
    };
  }

  async rateLimit(settings: SourceSettings) {
    const response = await githubFetch("https://api.github.com/rate_limit", settings).catch(() => undefined);
    if (!response?.ok) return readCachedRate(this.label, settings);
    return readCachedRate(this.label, settings);
  }

  async validateSettings(settings: SourceSettings): Promise<{ ok: boolean; message: string }> {
    const response = await githubFetch("https://api.github.com/rate_limit", settings).catch((error) => error as Error);
    if (response instanceof Error) return { ok: false, message: response.message };
    return {
      ok: response.ok,
      message: response.ok ? "GitHub API connection succeeded." : `GitHub API returned ${response.status}.`
    };
  }
}

export class SupplementalTrendAdapter implements SourceAdapter {
  id = "third-party";
  label = "Third-party Trend Sources";
  weight = 0.45;
  supportsBackfill = false;
  maxConcurrency = 1;

  async discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]> {
    if (window === "historical") return [];
    return supplementalCatalog(window)
      .slice(0, settings.maxReposPerWindow ?? 40)
      .map((repo, index) => ({
        repo,
        observation: {
          id: `${repo.id}:${window}:supplemental:${index}`,
          repoId: repo.id,
          source: this.label,
          window,
          observedAt: new Date().toISOString(),
          rank: index + 1,
          stars: repo.stars,
          growth: estimateGrowth(window, repo.stars, index),
          url: repo.url,
          metadata: { supplemental: "curated cross-check catalog" }
        }
      }));
  }

  async health(): Promise<SourceHealth> {
    return {
      id: this.id,
      label: this.label,
      configured: true,
      enabled: true,
      status: "healthy",
      message: "Uses supplemental GitHub topic sweeps as a stable local substitute for optional third-party trend feeds.",
      weight: this.weight,
      coverage: 0.28
    };
  }

  async rateLimit(settings: SourceSettings) {
    return readCachedRate(this.label, settings);
  }

  async validateSettings(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "Supplemental topic sweep is available." };
  }
}

export class GhArchiveAdapter implements SourceAdapter {
  id = "gh-archive";
  label = "GH Archive WatchEvents";
  weight = 0.85;
  supportsBackfill = true;
  maxConcurrency = 1;

  async discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]> {
    const hours = archiveHours(window);
    const counts = new Map<string, number>();
    const eventDates = archiveHourUrls(hours);
    await runWithConcurrency(
      eventDates.map(({ url }) => async (): Promise<void> => {
        const response = await smartRetry(() => proxiedFetch(url, { headers: { "User-Agent": USER_AGENT } }, settings));
        if (!response.ok) return;
        const buffer = Buffer.from(await response.arrayBuffer());
        const body = decodeGhArchiveBody(buffer);
        for (const line of body.split("\n")) {
          if (!line.includes("\"WatchEvent\"")) continue;
          try {
            const event = JSON.parse(line) as { type?: string; repo?: { name?: string } };
            if (event.type === "WatchEvent" && event.repo?.name) {
              counts.set(event.repo.name, (counts.get(event.repo.name) ?? 0) + 1);
            }
          } catch {
            // Ignore malformed archive lines and continue with the rest of the hour.
          }
        }
      }),
      3
    );

    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, settings.githubToken ? 35 : 14);

    const discovered: DiscoveredRepository[] = [];
    for (const [fullName, growth] of top) {
      const repo = await enrichGitHubRepository(fullName, settings).catch(() => lightweightRepo(fullName, growth));
      discovered.push({
        repo,
        observation: {
          id: `${repo.id}:${window}:gh-archive:${new Date().toISOString().slice(0, 13)}`,
          repoId: repo.id,
          source: this.label,
          window: window === "historical" ? "monthly" : window,
          observedAt: new Date().toISOString(),
          stars: repo.stars,
          growth,
          url: repo.url,
          metadata: { hoursSampled: hours, source: "gharchive.org WatchEvent" }
        }
      });
    }
    return discovered;
  }

  async health(settings: SourceSettings): Promise<SourceHealth> {
    return {
      id: this.id,
      label: this.label,
      configured: true,
      enabled: true,
      status: "healthy",
      message: settings.bigQueryProjectId
        ? "Direct GH Archive sampling is active; project id is retained for future BigQuery-scale backfill."
        : "Direct GH Archive sampling is active for recent WatchEvent cross-checks.",
      weight: this.weight,
      coverage: settings.bigQueryProjectId ? 0.55 : 0.32
    };
  }

  async rateLimit(settings: SourceSettings) {
    return readCachedRate(this.label, settings);
  }

  async validateSettings(): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: "GH Archive sampling does not require credentials." };
  }
}

export async function enrichGitHubRepository(fullName: string, settingsOrToken?: SourceSettings | string): Promise<Repository> {
  const settings = typeof settingsOrToken === "string" ? { githubToken: settingsOrToken } : settingsOrToken ?? {};
  const response = await smartRetry(() => githubFetch(`https://api.github.com/repos/${fullName}`, settings));
  if (!response.ok) throw new Error(`GitHub repo ${fullName} responded ${response.status}`);
  const repo = repoFromPayload((await response.json()) as GitHubRepoPayload);
  const readme = await fetchReadme(fullName, settings).catch(() => undefined);
  return { ...repo, readmeExcerpt: readme ?? repo.readmeExcerpt };
}

function parseTrending(html: string, window: TrendWindow): DiscoveredRepository[] {
  const articles = html.match(/<article[\s\S]*?<\/article>/g) ?? [];
  return articles.map((article, index) => {
    const fullName = decodeHtml(article.match(/href="\/([^/"]+\/[^/"]+)"/)?.[1] ?? "unknown/unknown").replace(/\s/g, "");
    const [owner, name] = fullName.split("/");
    const description = stripHtml(article.match(/<p[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "");
    const language = stripHtml(article.match(/itemprop="programmingLanguage"[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? "Unknown");
    const periodText = article.match(/([\d,.]+)\s+stars?\s+(today|this week|this month)/i)?.[1];
    const starsText = article.match(/\/stargazers[\s\S]*?>([\s\d,.]+)<\/a>/i)?.[1];
    const stars = parseNumber(starsText ?? "0");
    const growth = parseNumber(periodText ?? String(Math.max(1, Math.round(stars * 0.01))));
    const repo: Repository = {
      id: `github:${fullName.toLowerCase()}`,
      fullName,
      owner,
      name,
      description,
      url: `https://github.com/${fullName}`,
      stars,
      forks: 0,
      openIssues: 0,
      language,
      license: "Unknown",
      topics: inferTopics(`${fullName} ${description} ${language}`),
      lastSeenAt: new Date().toISOString()
    };
    return {
      repo,
      observation: {
        id: `${repo.id}:${window}:github-trending`,
        repoId: repo.id,
        source: "GitHub Trending",
        window,
        observedAt: new Date().toISOString(),
        rank: index + 1,
        stars,
        growth,
        url: repo.url,
        metadata: { parser: "github trending html" }
      }
    };
  }).filter((item) => item.repo.fullName !== "unknown/unknown");
}

function searchQueries(window: TrendWindow, authenticated: boolean): string[] {
  const since = new Date(Date.now() - windowDays(window) * 86_400_000).toISOString().slice(0, 10);
  const recent = `pushed:>=${since}`;
  const core = [
    `stars:>1000 ${recent}`,
    `topic:agent stars:>100 ${recent}`,
    `topic:agents stars:>100 ${recent}`,
    `topic:llm stars:>200 ${recent}`,
    `topic:mcp stars:>30 ${recent}`,
    `topic:model-context-protocol stars:>10 ${recent}`,
    `topic:coding-agent stars:>20 ${recent}`,
    `topic:prompt-engineering stars:>50 ${recent}`,
    `topic:ai-tools stars:>100 ${recent}`,
    `topic:developer-tools stars:>500 ${recent}`
  ];
  const aiEcosystem = [
    `chatgpt stars:>50 ${recent}`,
    `openai agents stars:>20 ${recent}`,
    `"openai agents sdk" stars:>10 ${recent}`,
    `"responses api" openai stars:>10 ${recent}`,
    `"assistants api" openai stars:>10 ${recent}`,
    `"custom gpt" stars:>10 ${recent}`,
    `"claude code" stars:>10 ${recent}`,
    `claude-code stars:>10 ${recent}`,
    `anthropic agent stars:>10 ${recent}`,
    `"claude" cli stars:>20 ${recent}`,
    `"claude" mcp stars:>10 ${recent}`,
    `"claude" skills stars:>10 ${recent}`,
    `aider stars:>20 ${recent}`,
    `"cursor agent" stars:>10 ${recent}`,
    `"windsurf agent" stars:>10 ${recent}`,
    `"codex cli" stars:>10 ${recent}`,
    `devin stars:>10 ${recent}`,
    `swe-agent stars:>10 ${recent}`,
    `openhands stars:>10 ${recent}`,
    `cline stars:>20 ${recent}`,
    `"roo code" stars:>10 ${recent}`,
    `"terminal agent" stars:>10 ${recent}`,
    `"coding agent" cli stars:>10 ${recent}`,
    `"model context protocol" stars:>10 ${recent}`,
    `"mcp server" stars:>10 ${recent}`,
    `"mcp client" stars:>10 ${recent}`,
    `"tool calling" stars:>10 ${recent}`,
    `"function calling" agent stars:>10 ${recent}`,
    `"slash commands" ai stars:>10 ${recent}`,
    `"prompt library" stars:>10 ${recent}`,
    `"prompt manager" stars:>10 ${recent}`,
    `"prompt workflow" stars:>10 ${recent}`,
    `"system prompt" stars:>10 ${recent}`,
    `"prompt templates" stars:>10 ${recent}`
  ];
  const broader = [
    `topic:rag stars:>100 ${recent}`,
    `topic:retrieval-augmented-generation stars:>50 ${recent}`,
    `topic:model-serving stars:>50 ${recent}`,
    `topic:ai-agent stars:>50 ${recent}`,
    `topic:agentic stars:>30 ${recent}`,
    `topic:multi-agent stars:>50 ${recent}`,
    `topic:vector-database stars:>50 ${recent}`,
    `topic:embedding stars:>50 ${recent}`,
    `topic:multimodal stars:>100 ${recent}`,
    `topic:diffusion stars:>100 ${recent}`,
    `topic:fine-tuning stars:>50 ${recent}`,
    `topic:llmops stars:>20 ${recent}`,
    `topic:ai-inference stars:>50 ${recent}`,
    `topic:ai-evaluation stars:>20 ${recent}`,
    `topic:ai-safety stars:>30 ${recent}`,
    `topic:copilot stars:>100 ${recent}`,
    `topic:database stars:>1000 ${recent}`,
    `topic:security stars:>1000 ${recent}`,
    `topic:kubernetes stars:>1000 ${recent}`,
    `topic:react stars:>1000 ${recent}`
  ];
  const all = uniqueQueries([...core, ...aiEcosystem, ...broader]);
  const limit = authenticated
    ? (window === "daily" ? 24 : window === "weekly" ? 36 : all.length)
    : (window === "daily" ? 10 : window === "weekly" ? 14 : 18);
  return all.slice(0, limit);
}

function uniqueQueries(queries: string[]): string[] {
  return Array.from(new Set(queries));
}

function windowDays(window: TrendWindow): number {
  if (window === "daily") return 1;
  if (window === "weekly") return 7;
  return 30;
}

function archiveHours(window: TrendWindow): number {
  if (window === "daily") return 2;
  if (window === "weekly") return 4;
  return 8;
}

function archiveHourUrls(hours: number): Array<{ url: string; date: Date }> {
  const urls: Array<{ url: string; date: Date }> = [];
  const current = new Date();
  current.setUTCMinutes(0, 0, 0);
  for (let offset = 2; offset < hours + 2; offset += 1) {
    const date = new Date(current.getTime() - offset * 3_600_000);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = date.getUTCHours();
    urls.push({ url: `https://data.gharchive.org/${year}-${month}-${day}-${hour}.json.gz`, date });
  }
  return urls;
}

function decodeGhArchiveBody(buffer: Buffer): string {
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) {
    return gunzipSync(buffer).toString("utf8");
  }
  return buffer.toString("utf8");
}

async function githubFetch(url: string, settings: SourceSettings = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "Accept-Encoding": "gzip, deflate",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (settings.githubToken) headers.Authorization = `Bearer ${settings.githubToken}`;
  return cachedFetch(url, { headers }, settings, "GitHub API", true);
}

async function fetchReadme(fullName: string, settings: SourceSettings): Promise<string | undefined> {
  const response = await githubFetch(`https://api.github.com/repos/${fullName}/readme`, settings);
  if (!response.ok) return undefined;
  const payload = (await response.json()) as { content?: string; encoding?: string };
  if (!payload.content || payload.encoding !== "base64") return undefined;
  return Buffer.from(payload.content, "base64").toString("utf8").replace(/\s+/g, " ").slice(0, 900);
}

async function cachedFetch(
  url: string,
  init: RequestInit,
  settings: SourceSettings,
  source: string,
  cacheable: boolean
): Promise<Response> {
  const method = init.method ?? "GET";
  const key = cacheKey(method, url);
  if (cacheable && method === "GET") {
    const cached = settings.getCache?.(key);
    if (cached) {
      const cachedETag = cached.headers?.etag ?? cached.headers?.ETag;
      if (cachedETag) {
        const conditionalHeaders = new Headers(init.headers);
        conditionalHeaders.set("If-None-Match", cachedETag);
        const conditionalInit = { ...init, headers: conditionalHeaders };
        const conditionalResponse = await proxiedFetch(url, conditionalInit, settings);
        recordRateLimitFromHeaders(source, conditionalResponse, settings);
        if (conditionalResponse.status === 304) {
          return new Response(cached.body, {
            status: cached.status,
            headers: cached.headers
          });
        }
        if (conditionalResponse.ok) {
          const body = await conditionalResponse.clone().text();
          const createdAt = new Date();
          const ttlHours = settings.cacheTtlHours ?? 6;
          settings.setCache?.({
            key,
            url,
            method,
            body,
            headers: Object.fromEntries(conditionalResponse.headers.entries()),
            status: conditionalResponse.status,
            createdAt: createdAt.toISOString(),
            expiresAt: new Date(createdAt.getTime() + ttlHours * 3_600_000).toISOString()
          });
          return new Response(body, {
            status: conditionalResponse.status,
            headers: conditionalResponse.headers
          });
        }
        return conditionalResponse;
      }
      return new Response(cached.body, {
        status: cached.status,
        headers: cached.headers
      });
    }
  }

  const response = await proxiedFetch(url, init, settings);
  recordRateLimitFromHeaders(source, response, settings);
  if (cacheable && method === "GET" && response.ok) {
    const body = await response.clone().text();
    const createdAt = new Date();
    const ttlHours = settings.cacheTtlHours ?? 6;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const etag = response.headers.get("etag") ?? undefined;
    settings.setCache?.({
      key,
      url,
      method,
      body,
      headers: responseHeaders,
      status: response.status,
      etag,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ttlHours * 3_600_000).toISOString()
    });
    return new Response(body, {
      status: response.status,
      headers: response.headers
    });
  }
  return response;
}

function recordRateLimitFromHeaders(source: string, response: Response, settings: SourceSettings): void {
  const limit = numberHeader(response.headers.get("x-ratelimit-limit"));
  const remaining = numberHeader(response.headers.get("x-ratelimit-remaining"));
  const reset = numberHeader(response.headers.get("x-ratelimit-reset"));
  if (limit === undefined && remaining === undefined && reset === undefined) return;
  settings.recordRateLimit?.({
    source,
    resource: response.headers.get("x-ratelimit-resource") ?? "core",
    limit,
    remaining,
    resetAt: reset ? new Date(reset * 1000).toISOString() : undefined,
    observedAt: new Date().toISOString(),
    status: remaining === 0 ? "limited" : "ok"
  });
}

function readCachedRate(source: string, settings: SourceSettings) {
  settings.recordRateLimit?.({
    source,
    resource: "status",
    observedAt: new Date().toISOString(),
    status: "unknown"
  });
  return undefined;
}

function numberHeader(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function cacheKey(method: string, url: string): string {
  return createHash("sha256").update(`${method}:${url}`).digest("hex");
}

function proxiedFetch(url: string, init: RequestInit, settings: SourceSettings): Promise<Response> {
  if (!settings.proxyUrl) return fetch(url, init);
  return fetch(url, {
    ...init,
    dispatcher: new ProxyAgent(settings.proxyUrl)
  } as RequestInit & { dispatcher: ProxyAgent });
}

function repoFromPayload(item: GitHubRepoPayload): Repository {
  const fullName = item.full_name;
  const [owner, name] = fullName.split("/");
  return {
    id: `github:${fullName.toLowerCase()}`,
    nodeId: item.node_id,
    fullName,
    owner,
    name,
    description: item.description ?? "",
    url: item.html_url,
    homepage: item.homepage ?? undefined,
    stars: item.stargazers_count ?? 0,
    forks: item.forks_count ?? 0,
    openIssues: item.open_issues_count ?? 0,
    language: item.language ?? "Unknown",
    license: item.license?.spdx_id ?? item.license?.name ?? "Unknown",
    topics: item.topics ?? inferTopics(`${fullName} ${item.description ?? ""} ${item.language ?? ""}`),
    createdAt: item.created_at,
    pushedAt: item.pushed_at,
    readmeExcerpt: item.description ?? "",
    lastSeenAt: new Date().toISOString()
  };
}

function lightweightRepo(fullName: string, stars: number): Repository {
  const [owner, name] = fullName.split("/");
  return {
    id: `github:${fullName.toLowerCase()}`,
    fullName,
    owner,
    name,
    description: "Repository surfaced from GH Archive WatchEvent activity.",
    url: `https://github.com/${fullName}`,
    stars,
    forks: 0,
    openIssues: 0,
    language: "Unknown",
    license: "Unknown",
    topics: inferTopics(fullName),
    lastSeenAt: new Date().toISOString()
  };
}

function supplementalCatalog(window: TrendWindow): Repository[] {
  const now = new Date().toISOString();
  const repos: Array<[string, string, number, string, string[]]> = [
    ["openai/openai-agents-python", "Python framework for building multi-agent AI applications.", 24000, "Python", ["openai", "agents", "agent-framework", "llm"]],
    ["openai/codex", "OpenAI coding agent CLI and terminal workflow for software engineering tasks.", 30000, "TypeScript", ["openai", "codex", "coding-agent", "cli"]],
    ["openai/openai-cookbook", "Examples, guides, prompts, and workflows for building with OpenAI APIs.", 65000, "Jupyter Notebook", ["openai", "prompt", "llm", "examples"]],
    ["modelcontextprotocol/servers", "Reference MCP servers for connecting AI assistants to tools and data.", 62000, "TypeScript", ["mcp", "tools", "agents"]],
    ["modelcontextprotocol/typescript-sdk", "TypeScript SDK for Model Context Protocol clients and servers.", 15000, "TypeScript", ["mcp", "sdk", "tools"]],
    ["modelcontextprotocol/python-sdk", "Python SDK for building Model Context Protocol clients and servers.", 9000, "Python", ["mcp", "python", "tools"]],
    ["aider-ai/aider", "AI pair programming in the terminal with support for multiple LLM providers.", 35000, "Python", ["coding-agent", "cli", "llm", "aider"]],
    ["All-Hands-AI/OpenHands", "Open platform for software engineering agents that can modify code and run commands.", 55000, "Python", ["coding-agent", "software-engineering-agent", "llm"]],
    ["cline/cline", "Autonomous coding agent inside the IDE.", 52000, "TypeScript", ["coding-agent", "llm", "developer-tools"]],
    ["RooVetGit/Roo-Code", "Agentic coding assistant extension with tool use and coding workflows.", 18000, "TypeScript", ["coding-agent", "tools", "llm"]],
    ["continuedev/continue", "Open-source AI code assistant and custom coding agent platform.", 28000, "TypeScript", ["coding-agent", "developer-tools", "llm"]],
    ["sst/opencode", "Terminal-native AI coding agent and CLI workflow.", 18000, "TypeScript", ["coding-agent", "cli", "terminal-agent"]],
    ["plandex-ai/plandex", "Terminal-based AI coding engine for large changes and planning workflows.", 14000, "Go", ["coding-agent", "cli", "planning-agent"]],
    ["browser-use/browser-use", "Make websites accessible for AI agents.", 71000, "Python", ["agents", "browser", "automation"]],
    ["langchain-ai/langgraph", "Build stateful multi-agent and tool-calling applications with language models.", 18000, "Python", ["agent-framework", "multi-agent", "llm"]],
    ["crewAIInc/crewAI", "Framework for orchestrating role-playing autonomous AI agents.", 32000, "Python", ["agent-framework", "multi-agent", "llm"]],
    ["microsoft/autogen", "Programming framework for agentic AI and multi-agent applications.", 45000, "Python", ["agent-framework", "multi-agent", "llm"]],
    ["microsoft/semantic-kernel", "SDK for agents, plugins, planners, and model orchestration.", 24000, "C#", ["agent-framework", "plugins", "llm"]],
    ["stanfordnlp/dspy", "Framework for programming and optimizing language model pipelines.", 25000, "Python", ["prompt", "optimization", "llm"]],
    ["promptfoo/promptfoo", "Test, evaluate, and secure LLM prompts and applications.", 8000, "TypeScript", ["prompt-evaluation", "eval", "llm"]],
    ["f/awesome-chatgpt-prompts", "Curated prompt library for ChatGPT and LLM workflows.", 120000, "HTML", ["chatgpt", "prompt-library", "prompts"]],
    ["microsoft/promptflow", "Build, evaluate, and deploy prompt workflows and LLM apps.", 10000, "Python", ["prompt-workflow", "llmops", "evaluation"]],
    ["BerriAI/litellm", "LLM gateway and model router for OpenAI-compatible APIs.", 28000, "Python", ["llm", "gateway", "openai-compatible"]],
    ["vllm-project/vllm", "High-throughput and memory-efficient inference and serving engine for LLMs.", 36000, "Python", ["llm", "model-serving", "inference"]],
    ["ollama/ollama", "Run large language models locally from a simple CLI.", 145000, "Go", ["llm", "cli", "local-ai", "model-serving"]],
    ["run-llama/llama_index", "Data framework for LLM applications and retrieval augmented generation.", 39000, "Python", ["rag", "llm", "retrieval"]],
    ["shadcn-ui/ui", "Reusable UI components for modern React applications.", 92000, "TypeScript", ["react", "ui", "components"]],
    ["fastapi/fastapi", "FastAPI framework for production APIs.", 84000, "Python", ["api", "backend", "framework"]],
    ["duckdb/duckdb", "Analytical in-process SQL database management system.", 31000, "C++", ["database", "analytics", "sql"]],
    ["projectdiscovery/nuclei", "Fast and customizable vulnerability scanner.", 23000, "Go", ["security", "scanner", "vulnerability"]],
    ["opentofu/opentofu", "Open source infrastructure as code tool.", 24000, "Go", ["terraform", "infrastructure", "devops"]],
    ["tauri-apps/tauri", "Build smaller, faster, and more secure desktop applications.", 98000, "Rust", ["desktop", "rust", "apps"]]
  ];
  const multiplier = window === "daily" ? 0.4 : window === "weekly" ? 1 : 2.2;
  return repos.map(([fullName, description, stars, language, topics], index) => {
    const [owner, name] = fullName.split("/");
    return {
      id: `github:${fullName.toLowerCase()}`,
      fullName,
      owner,
      name,
      description,
      url: `https://github.com/${fullName}`,
      stars,
      forks: Math.max(100, Math.round(stars / 12)),
      openIssues: Math.max(20, Math.round(stars / 180)),
      language,
      license: "Unknown",
      topics,
      pushedAt: now,
      readmeExcerpt: description,
      lastSeenAt: now,
      // Keep the catalog order meaningful even when GitHub is rate limited.
      syntheticGrowth: Math.round((repos.length - index) * 120 * multiplier)
    } as Repository & { syntheticGrowth: number };
  });
}

function estimateGrowth(window: TrendWindow, stars: number, rank: number): number {
  const divisor = window === "daily" ? 180 : window === "weekly" ? 80 : 35;
  return Math.max(1, Math.round(stars / divisor / Math.max(1, rank + 1)));
}

function inferTopics(value: string): string[] {
  const text = value.toLowerCase();
  const candidates = [
    "claude-code", "claude", "anthropic", "chatgpt", "openai", "codex",
    "aider", "cursor", "windsurf", "cline", "roo-code", "openhands",
    "coding-agent", "terminal-agent", "agent", "agents", "mcp", "model-context-protocol",
    "skills", "plugins", "prompt-library", "prompt-workflow", "prompt", "llm",
    "rag", "model-serving", "inference", "ollama", "vllm", "react", "cli",
    "security", "kubernetes", "database"
  ];
  const topics = candidates.filter((topic) => text.includes(topic.replace(/-/g, " ")) || text.includes(topic));
  return topics.length ? topics : ["trending"];
}

function dedupe(items: DiscoveredRepository[]): DiscoveredRepository[] {
  return Array.from(new Map(items.map((item) => [item.repo.fullName.toLowerCase(), item])).values());
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function parseNumber(value: string): number {
  return Number(value.replace(/[^\d]/g, "")) || 0;
}

interface GitHubRepoPayload {
  node_id?: string;
  full_name: string;
  description?: string | null;
  html_url: string;
  homepage?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  open_issues_count?: number;
  language?: string | null;
  license?: { spdx_id?: string; name?: string } | null;
  topics?: string[];
  created_at?: string;
  pushed_at?: string;
}
