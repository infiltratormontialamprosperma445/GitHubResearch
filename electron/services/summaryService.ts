// ── Summary Service ────────────────────────────────────────────
// Provides AI-powered and rule-based (offline) summarization for
// repository records.  Summaries are cached in the request_cache
// table (key prefix "summary:") so repeat lookups are fast.
//
// When an AI API key is configured the service streams tokens back
// to the renderer via webContents.send("summary:token", ...).
// When no key is available it falls back to a deterministic template.

import type { WebContents } from "electron";
import type {
  Classification,
  RankingScore,
  RepoRecord,
  RepoSummary,
  Settings
} from "../../src/shared/types.js";

// ── Cache helpers (uses request_cache table via db query function) ──

const SUMMARY_CACHE_PREFIX = "summary:";
const SUMMARY_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generic function to query the worker for a cached summary.
 * Returns the parsed RepoSummary or undefined when nothing is cached.
 */
async function getCachedSummary(
  repoId: string,
  queryWorker: (method: string, ...args: any[]) => Promise<any>
): Promise<RepoSummary | undefined> {
  try {
    const entry = await queryWorker("getCacheEntry", `${SUMMARY_CACHE_PREFIX}${repoId}`);
    if (!entry) return undefined;
    const parsed = JSON.parse(entry.body) as RepoSummary;
    // Check manual expiry
    if (new Date(parsed.createdAt).getTime() + SUMMARY_TTL_MS < Date.now()) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Persist a summary to the request_cache table via the worker.
 */
async function setCachedSummary(
  summary: RepoSummary,
  queryWorker: (method: string, ...args: any[]) => Promise<any>
): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SUMMARY_TTL_MS).toISOString();
  try {
    await queryWorker("setCacheEntry", {
      key: `${SUMMARY_CACHE_PREFIX}${summary.repoId}`,
      url: `summary://${summary.repoId}`,
      method: "summary",
      body: JSON.stringify(summary),
      headers: { summaryType: summary.summaryType },
      createdAt: now,
      expiresAt,
      status: 200
    });
  } catch {
    // Cache write failure is non-fatal
  }
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Generate a summary for a single repository.
 *
 * @param repoId      The repository identifier.
 * @param force       When true, bypass the cache and regenerate.
 * @param queryWorker A function that sends a QUERY to the worker and returns the result.
 * @param settings    Current application settings (includes AI config).
 * @param webContents Optional Electron WebContents for streaming AI tokens.
 * @returns An object indicating whether the result was cached and the summary text.
 */
export async function summarizeRepo(
  repoId: string,
  force: boolean,
  queryWorker: (method: string, ...args: any[]) => Promise<any>,
  settings: Settings,
  webContents?: WebContents
): Promise<{ cached: boolean; summary?: string }> {
  // Check cache first (unless force-refresh requested)
  if (!force) {
    const cached = await getCachedSummary(repoId, queryWorker);
    if (cached) {
      return { cached: true, summary: cached.summaryMd };
    }
  }

  // Fetch the full repo record from the worker
  const record: RepoRecord | undefined = await queryWorker("getRepo", repoId);
  if (!record) {
    return { cached: false, summary: undefined };
  }

  // Decide: AI summary or rule-based?
  const hasAiKey = Boolean(settings.aiApiKey);
  let summaryMd: string;
  let summaryType: "ai" | "rule";
  let model: string | undefined;

  if (hasAiKey) {
    try {
      summaryMd = await generateAiSummary(record, settings, webContents, repoId);
      summaryType = "ai";
      model = settings.aiModel;
    } catch {
      // Fall back to rule-based on any AI failure
      summaryMd = buildRuleSummary(record.repo, record.classification, record.ranking);
      summaryType = "rule";
    }
  } else {
    summaryMd = buildRuleSummary(record.repo, record.classification, record.ranking);
    summaryType = "rule";
  }

  const summary: RepoSummary = {
    repoId,
    summaryMd,
    summaryType,
    model,
    createdAt: new Date().toISOString()
  };

  // Cache the result
  await setCachedSummary(summary, queryWorker);

  return { cached: false, summary: summaryMd };
}

/**
 * Build a deterministic, template-based summary from local data.
 * No network calls are made; this always works offline.
 */
export function buildRuleSummary(
  repo: RepoRecord["repo"],
  classification: RepoRecord["classification"],
  ranking: RepoRecord["ranking"]
): string {
  const tags = Array.isArray(classification?.tags) ? classification.tags.slice(0, 8) : [];
  const stars = repo.stars.toLocaleString();
  const forks = repo.forks.toLocaleString();
  const growth = ranking?.explanation?.join("; ") ?? "No ranking data available.";
  const learningValue = classification?.learningValue ?? "";
  const audience = classification?.audience ?? "";
  const risks = Array.isArray(classification?.risks) ? classification.risks : [];
  const evidence = Array.isArray(classification?.evidence) ? classification.evidence : [];

  const lines: string[] = [];

  lines.push(`## ${repo.fullName}`);
  lines.push("");
  if (repo.description) {
    lines.push(repo.description);
    lines.push("");
  }

  // Key metrics table
  lines.push("| Metric | Value |");
  lines.push("|--------|-------|");
  lines.push(`| Stars | ${stars} |`);
  lines.push(`| Forks | ${forks} |`);
  lines.push(`| Open Issues | ${repo.openIssues.toLocaleString()} |`);
  lines.push(`| Language | ${repo.language || "Unknown"} |`);
  lines.push(`| License | ${repo.license || "Unknown"} |`);
  lines.push("");

  // Classification
  lines.push(`**Category:** ${classification?.primaryCategory ?? "Unclassified"} / ${classification?.secondaryCategory ?? "N/A"}`);
  if (tags.length > 0) {
    lines.push(`**Tags:** ${tags.map((t) => `\`${t}\``).join(", ")}`);
  }
  lines.push("");

  // Learning value & audience
  if (learningValue) {
    lines.push(`**Learning Value:** ${learningValue}`);
    lines.push("");
  }
  if (audience) {
    lines.push(`**Audience:** ${audience}`);
    lines.push("");
  }

  // Ranking explanation
  lines.push("### Ranking Insights");
  lines.push("");
  lines.push(growth);
  lines.push("");

  // Evidence
  if (evidence.length > 0) {
    lines.push("### Evidence");
    lines.push("");
    for (const item of evidence) {
      lines.push(`- ${item}`);
    }
    lines.push("");
  }

  // Risks
  if (risks.length > 0) {
    lines.push("### Risks");
    lines.push("");
    for (const risk of risks) {
      lines.push(`- ${risk}`);
    }
    lines.push("");
  }

  // Topics
  if (Array.isArray(repo.topics) && repo.topics.length > 0) {
    lines.push("### Topics");
    lines.push("");
    lines.push(repo.topics.map((t) => `\`${t}\``).join(" "));
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Generate summaries for a batch of repositories.
 * Returns a single combined markdown document.
 *
 * @param repoIds     Array of repository IDs to summarize.
 * @param title       A title header for the combined document.
 * @param queryWorker A function that sends a QUERY to the worker and returns the result.
 * @param settings    Current application settings.
 * @returns An object with the combined summary markdown.
 */
export async function summarizeBatch(
  repoIds: string[],
  title: string,
  queryWorker: (method: string, ...args: any[]) => Promise<any>,
  settings: Settings
): Promise<{ summary: string }> {
  const sections: string[] = [];

  sections.push(`# ${title}`);
  sections.push("");
  sections.push(`Generated at ${new Date().toLocaleString()}`);
  sections.push("");
  sections.push("---");
  sections.push("");

  for (const repoId of repoIds) {
    try {
      const result = await summarizeRepo(repoId, false, queryWorker, settings);
      if (result.summary) {
        sections.push(result.summary);
        sections.push("");
        sections.push("---");
        sections.push("");
      }
    } catch {
      sections.push(`## ${repoId}`);
      sections.push("");
      sections.push("_Failed to generate summary._");
      sections.push("");
      sections.push("---");
      sections.push("");
    }
  }

  return { summary: sections.join("\n") };
}

// ── Internal: AI Summary ───────────────────────────────────────

/**
 * Call the configured AI endpoint to generate a streaming summary.
 * Tokens are forwarded to the renderer in real time via webContents.
 */
async function generateAiSummary(
  record: RepoRecord,
  settings: Settings,
  webContents: WebContents | undefined,
  repoId: string
): Promise<string> {
  const baseUrl = settings.aiBaseUrl.replace(/\/$/, "");
  const { repo, classification, ranking } = record;

  const systemPrompt = [
    "You are a concise technical analyst summarizing GitHub repositories for a developer intelligence dashboard.",
    "Produce a short Markdown summary (under 500 words) covering:",
    "1. What the project does and its core value proposition.",
    "2. Key technical highlights (architecture, language, dependencies).",
    "3. Community traction (stars, growth trends, adoption signals).",
    "4. Potential learning value and target audience.",
    "Use bullet points where possible. Be factual and avoid hype."
  ].join("\n");

  const userContent = JSON.stringify({
    fullName: repo.fullName,
    description: repo.description,
    url: repo.url,
    language: repo.language,
    stars: repo.stars,
    forks: repo.forks,
    openIssues: repo.openIssues,
    topics: repo.topics,
    license: repo.license,
    classification: {
      primaryCategory: classification?.primaryCategory,
      secondaryCategory: classification?.secondaryCategory,
      tags: classification?.tags,
      learningValue: classification?.learningValue,
      audience: classification?.audience
    },
    ranking: {
      score: ranking?.score,
      growthScore: ranking?.growthScore,
      explanation: ranking?.explanation
    }
  });

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${settings.aiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: settings.aiModel,
      stream: true,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`AI API returned ${response.status}: ${errorText}`);
  }

  // Stream the response body, extracting SSE delta tokens
  let fullContent = "";

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") break;

        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const token = parsed.choices?.[0]?.delta?.content ?? "";
          if (token) {
            fullContent += token;
            if (webContents && !webContents.isDestroyed()) {
              webContents.send("summary:token", { repoId, token });
            }
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }
  } else {
    // Fallback: read the entire response as JSON (non-streaming)
    const json = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    fullContent = json.choices?.[0]?.message?.content ?? "";
  }

  if (!fullContent.trim()) {
    throw new Error("AI returned empty summary.");
  }

  return fullContent;
}
