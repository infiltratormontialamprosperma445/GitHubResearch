import {
  Repository,
  SourceHealth,
  TrendWindow
} from "../../src/shared/types.js";
import { DiscoveredRepository, SourceAdapter, SourceSettings } from "./types.js";
import { ProxyAgent } from "undici";
import { createHash } from "node:crypto";

const USER_AGENT = "Star-Intel-Desk/1.0 (Desktop Intelligence)";

// ─── Curated AI signal channels/accounts ────────────────────────────────────────

const TELEGRAM_AI_CHANNELS = [
  "awesome_ai",
  "openai_channel",
  "airesearchbot",
  "ai_ml_updates",
  "llmwatch",
  "huggingface",
  "ai_breaking_news",
  "aicoding",
  "theaiguy",
  "dailyaipapers"
];

const TWITTER_AI_SEARCH_QUERIES = [
  "github.com Claude Code coding agent",
  "github.com OpenAI agents SDK",
  "github.com ChatGPT prompt library",
  "github.com MCP server LLM",
  "github.com coding agent CLI",
  "github.com aider cursor windsurf codex",
  "github.com prompt workflow LLM",
  "github.com AI agent stars:>100",
  "github.com RAG retrieval vector",
  "github.com multimodal model open source",
  "github.com AI framework new release"
];

// ─── Nitter instances for Twitter scraping (public, no auth) ────────────────────

const NITTER_INSTANCES = [
  "nitter.privacydev.net",
  "nitter.poast.org",
  "nitter.woodland.cafe"
];

// ─── GitHub link regex ──────────────────────────────────────────────────────────

const GITHUB_REPO_REGEX = /(?:https?:\/\/)?github\.com\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)(?![A-Za-z0-9._/-])/g;

// ─── Telegram Adapter ───────────────────────────────────────────────────────────

export class TelegramTrendAdapter implements SourceAdapter {
  id = "telegram-trends";
  label = "Telegram AI Channels";
  weight = 0.7;
  supportsBackfill = false;
  maxConcurrency = 3;

  async discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]> {
    if (window === "historical") return [];
    const channelCount = window === "daily" ? 4 : window === "weekly" ? 7 : TELEGRAM_AI_CHANNELS.length;
    const channels = TELEGRAM_AI_CHANNELS.slice(0, channelCount);
    const repoHits = new Map<string, { count: number; channels: string[] }>();

    const results = await runWithConcurrency(
      channels.map((channel) => () => this.scrapeChannel(channel, settings)),
      this.maxConcurrency
    );

    for (const { channel, links } of results) {
      for (const fullName of links) {
        const key = fullName.toLowerCase();
        if (isBlacklistedRepo(key)) continue;
        const existing = repoHits.get(key);
        if (existing) {
          existing.count++;
          existing.channels.push(channel);
        } else {
          repoHits.set(key, { count: 1, channels: [channel] });
        }
      }
    }

    const sorted = Array.from(repoHits.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, settings.maxReposPerWindow ?? 30);

    const discovered: DiscoveredRepository[] = [];
    for (const [fullNameLower, { count, channels: sourceChannels }] of sorted) {
      const fullName = fullNameLower;
      const [owner, name] = fullName.split("/");
      if (!owner || !name) continue;
      const repo: Repository = {
        id: `github:${fullNameLower}`,
        fullName: `${owner}/${name}`,
        owner,
        name,
        description: `Surfaced from Telegram AI channels: ${sourceChannels.join(", ")}`,
        url: `https://github.com/${owner}/${name}`,
        stars: 0,
        forks: 0,
        openIssues: 0,
        language: "Unknown",
        license: "Unknown",
        topics: inferSocialTopics(`${owner} ${name}`),
        lastSeenAt: new Date().toISOString()
      };
      discovered.push({
        repo,
        observation: {
          id: `${repo.id}:${window}:telegram:${sourceChannels[0]}`,
          repoId: repo.id,
          source: this.label,
          window,
          observedAt: new Date().toISOString(),
          rank: sorted.findIndex(([name]) => name === fullNameLower) + 1,
          stars: 0,
          growth: count * estimateSocialGrowth(window),
          url: repo.url,
          metadata: {
            telegramChannels: sourceChannels,
            mentionCount: count,
            signalType: "telegram-ai-channel"
          }
        }
      });
    }
    return discovered;
  }

  async health(): Promise<SourceHealth> {
    return {
      id: this.id,
      label: this.label,
      configured: true,
      enabled: true,
      status: "healthy",
      message: `Monitors ${TELEGRAM_AI_CHANNELS.length} AI-focused Telegram channels for GitHub project signals.`,
      weight: this.weight,
      coverage: 0.35
    };
  }

  async rateLimit(settings: SourceSettings) {
    return undefined;
  }

  async validateSettings(): Promise<{ ok: boolean; message: string }> {
    const testChannel = TELEGRAM_AI_CHANNELS[0];
    try {
      const response = await proxiedFetch(
        `https://t.me/s/${testChannel}`,
        { headers: { "User-Agent": USER_AGENT } },
        {}
      );
      return {
        ok: response.ok || response.status === 302,
        message: response.ok
          ? "Telegram public channel preview is accessible."
          : `Telegram returned ${response.status}; some channels may require login.`
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async scrapeChannel(
    channel: string,
    settings: SourceSettings
  ): Promise<{ channel: string; links: string[] }> {
    try {
      const url = `https://t.me/s/${channel}`;
      const response = await cachedSocialFetch(url, settings, this.label);
      if (!response.ok) return { channel, links: [] };
      const html = await response.text();
      const links = extractGitHubLinks(html);
      return { channel, links };
    } catch {
      return { channel, links: [] };
    }
  }
}

// ─── Twitter/X Adapter ──────────────────────────────────────────────────────────

export class TwitterTrendAdapter implements SourceAdapter {
  id = "twitter-trends";
  label = "X (Twitter) AI Signals";
  weight = 0.65;
  supportsBackfill = false;
  maxConcurrency = 2;

  async discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]> {
    if (window === "historical") return [];
    const queryCount = window === "daily" ? 3 : window === "weekly" ? 5 : TWITTER_AI_SEARCH_QUERIES.length;
    const queries = TWITTER_AI_SEARCH_QUERIES.slice(0, queryCount);
    const repoHits = new Map<string, { count: number; queries: string[] }>();

    // Strategy 1: Try Nitter instances for public search
    const nitterResults = await this.searchViaNitter(queries, settings);
    for (const { query, links } of nitterResults) {
      for (const fullName of links) {
        const key = fullName.toLowerCase();
        if (isBlacklistedRepo(key)) continue;
        const existing = repoHits.get(key);
        if (existing) {
          existing.count++;
          existing.queries.push(query);
        } else {
          repoHits.set(key, { count: 1, queries: [query] });
        }
      }
    }

    // Strategy 2: Supplement with curated AI trending repos from RSS/blog feeds
    const supplementRepos = await this.fetchSupplementalAISignals(settings);
    for (const fullName of supplementRepos) {
      const key = fullName.toLowerCase();
      if (isBlacklistedRepo(key)) continue;
      const existing = repoHits.get(key);
      if (existing) {
        existing.count++;
      } else {
        repoHits.set(key, { count: 1, queries: ["ai-signal-supplement"] });
      }
    }

    const sorted = Array.from(repoHits.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, settings.maxReposPerWindow ?? 25);

    const discovered: DiscoveredRepository[] = [];
    for (const [fullNameLower, { count, queries: sourceQueries }] of sorted) {
      const [owner, name] = fullNameLower.split("/");
      if (!owner || !name) continue;
      const repo: Repository = {
        id: `github:${fullNameLower}`,
        fullName: `${owner}/${name}`,
        owner,
        name,
        description: `Trending in AI discussions on X: found via ${sourceQueries[0]}`,
        url: `https://github.com/${owner}/${name}`,
        stars: 0,
        forks: 0,
        openIssues: 0,
        language: "Unknown",
        license: "Unknown",
        topics: inferSocialTopics(`${owner} ${name}`),
        lastSeenAt: new Date().toISOString()
      };
      discovered.push({
        repo,
        observation: {
          id: `${repo.id}:${window}:twitter:${hashShort(sourceQueries[0])}`,
          repoId: repo.id,
          source: this.label,
          window,
          observedAt: new Date().toISOString(),
          rank: sorted.findIndex(([n]) => n === fullNameLower) + 1,
          stars: 0,
          growth: count * estimateSocialGrowth(window),
          url: repo.url,
          metadata: {
            twitterQueries: sourceQueries,
            mentionCount: count,
            signalType: "twitter-ai-discussion"
          }
        }
      });
    }
    return discovered;
  }

  async health(): Promise<SourceHealth> {
    return {
      id: this.id,
      label: this.label,
      configured: true,
      enabled: true,
      status: "healthy",
      message: "Monitors AI discussions on X via Nitter public search and supplemental AI signal feeds.",
      weight: this.weight,
      coverage: 0.3
    };
  }

  async rateLimit(settings: SourceSettings) {
    return undefined;
  }

  async validateSettings(): Promise<{ ok: boolean; message: string }> {
    for (const instance of NITTER_INSTANCES) {
      try {
        const response = await proxiedFetch(
          `https://${instance}/search`,
          { headers: { "User-Agent": USER_AGENT } },
          {}
        );
        if (response.ok) {
          return { ok: true, message: `Nitter instance ${instance} is accessible.` };
        }
      } catch {
        // Try next instance
      }
    }
    return {
      ok: true,
      message: "Nitter instances may be limited; supplemental AI signal feeds will still provide data."
    };
  }

  private async searchViaNitter(
    queries: string[],
    settings: SourceSettings
  ): Promise<Array<{ query: string; links: string[] }>> {
    const results: Array<{ query: string; links: string[] }> = [];
    for (const instance of NITTER_INSTANCES) {
      let instanceWorks = false;
      for (const query of queries) {
        try {
          const url = `https://${instance}/search?f=tweets&q=${encodeURIComponent(query)}`;
          const response = await cachedSocialFetch(url, settings, this.label);
          if (!response.ok) continue;
          instanceWorks = true;
          const html = await response.text();
          const links = extractGitHubLinks(html);
          results.push({ query, links });
        } catch {
          // Instance may be down, try next
        }
      }
      if (instanceWorks) break;
    }
    return results;
  }

  private async fetchSupplementalAISignals(settings: SourceSettings): Promise<string[]> {
    // Fetch from known AI news aggregation pages that list GitHub repos
    const feeds = [
      "https://huggingface.co/papers",
      "https://paperswithcode.com/latest"
    ];
    const allLinks: string[] = [];
    const results = await runWithConcurrency(
      feeds.map((feedUrl) => async () => {
        try {
          const response = await cachedSocialFetch(feedUrl, settings, this.label);
          if (!response.ok) return [];
          const html = await response.text();
          return extractGitHubLinks(html);
        } catch {
          return [];
        }
      }),
      this.maxConcurrency
    );
    for (const links of results) {
      allLinks.push(...links);
    }
    return allLinks;
  }
}

// ─── Shared utilities ───────────────────────────────────────────────────────────

function extractGitHubLinks(html: string): string[] {
  const links = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = GITHUB_REPO_REGEX.exec(html)) !== null) {
    const fullName = match[1].replace(/\.git$/, "").replace(/[.)\]}"',]+$/, "");
    if (isValidRepoName(fullName)) {
      links.add(fullName);
    }
  }
  return Array.from(links);
}

function isValidRepoName(fullName: string): boolean {
  const parts = fullName.split("/");
  if (parts.length !== 2) return false;
  const [owner, name] = parts;
  if (!owner || !name || owner.length < 1 || name.length < 1) return false;
  // Filter out common false positives
  const blacklist = [
    "site/terms", "site/privacy", "about", "pricing", "features",
    "marketplace", "sponsors", "settings", "notifications",
    "login", "signup", "join", "explore", "collections",
    "events", "topics", "trending", "security", "enterprise"
  ];
  if (blacklist.includes(owner.toLowerCase())) return false;
  if (blacklist.includes(name.toLowerCase())) return false;
  return true;
}

const BLACKLISTED_REPOS = new Set([
  "github/blog", "github/gitignore", "github/opensource.guide",
  "github/docs", "github/github-readme-stats"
]);

function isBlacklistedRepo(fullNameLower: string): boolean {
  return BLACKLISTED_REPOS.has(fullNameLower);
}

function inferSocialTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const candidates = [
    "claude-code", "claude", "anthropic", "openai-agents", "openai", "chatgpt",
    "codex", "aider", "cursor", "windsurf", "cline", "roo-code", "openhands",
    "coding-agent", "terminal-agent", "agent", "mcp-server", "mcp", "llm", "rag",
    "prompt-library", "prompt-workflow", "prompt", "skills", "plugins", "ai", "ml", "model",
    "transformer", "diffusion", "fine-tune", "inference",
    "react", "cli", "security", "kubernetes"
  ];
  const matched = candidates.filter((topic) => lower.includes(topic) || lower.includes(topic.replace(/-/g, " ")));
  return matched.length ? matched : ["ai-social-signal"];
}

function estimateSocialGrowth(window: TrendWindow): number {
  if (window === "daily") return 120;
  if (window === "weekly") return 350;
  return 800;
}

function hashShort(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

async function proxiedFetch(
  url: string,
  init: RequestInit,
  settings: SourceSettings
): Promise<Response> {
  if (!settings.proxyUrl) return fetch(url, init);
  return fetch(url, {
    ...init,
    dispatcher: new ProxyAgent(settings.proxyUrl)
  } as RequestInit & { dispatcher: ProxyAgent });
}

async function cachedSocialFetch(
  url: string,
  settings: SourceSettings,
  source: string
): Promise<Response> {
  const key = createHash("sha256").update(`GET:${url}`).digest("hex");
  const cached = settings.getCache?.(key);
  if (cached) {
    return new Response(cached.body, {
      status: cached.status,
      headers: cached.headers
    });
  }
  const response = await proxiedFetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  }, settings);
  if (response.ok && settings.setCache) {
    const body = await response.clone().text();
    const createdAt = new Date();
    const ttlHours = Math.min(settings.cacheTtlHours ?? 4, 8);
    settings.setCache({
      key,
      url,
      method: "GET",
      body,
      headers: Object.fromEntries(response.headers.entries()),
      status: response.status,
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
