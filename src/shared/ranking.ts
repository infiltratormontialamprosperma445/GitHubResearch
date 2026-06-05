import {
  Classification,
  RankingScore,
  Repository,
  SourceBreakdown,
  SourceObservation,
  TrendWindow
} from "./types.js";

export function scoreRepository(
  repo: Repository,
  classification: Classification,
  observations: SourceObservation[],
  window: TrendWindow
): RankingScore {
  const growth = Math.max(...observations.map((item) => item.growth ?? 0), 0);
  const sourceBreakdown = buildSourceBreakdown(observations);
  const latestObservationRank = Math.min(
    ...observations.map((item) => item.rank ?? 999),
    999
  );

  const growthScore = clamp(Math.log10(growth + 1) * 24 + (latestObservationRank < 50 ? 8 : 0), 0, 45);
  const sourceScore = clamp(sourceBreakdown.reduce((sum, item) => sum + item.weight, 0) * 8, 0, 24);
  const activityScore = clamp(activityFromPush(repo.pushedAt) + Math.log10(repo.forks + 1) * 5, 0, 18);
  const qualityScore = clamp(classification.confidence * 9 + (repo.license !== "Unknown" ? 3 : 0), 0, 13);
  const anomalyReasons = anomalyHints(repo, growth, observations);
  const riskPenalty = anomalyReasons.reduce((sum, reason) => sum + penaltyFor(reason), 0);
  const dedupeConfidence = dedupeConfidenceFor(repo, observations);
  const score = Math.round((growthScore + sourceScore + activityScore + qualityScore - riskPenalty) * 10) / 10;

  const explanation = [
    `Window growth estimate ${growth.toLocaleString()}`,
    `${sourceBreakdown.length} source families matched`,
    `Recent activity ${Math.round(activityScore)}/18`,
    `Classification confidence ${Math.round(classification.confidence * 100)}%`,
    `Dedupe confidence ${Math.round(dedupeConfidence * 100)}%`,
    riskPenalty > 0 ? `Risk penalty ${Math.round(riskPenalty)}` : "No obvious anomaly risk"
  ];

  return {
    repoId: repo.id,
    window,
    score,
    growthScore,
    sourceScore,
    activityScore,
    qualityScore,
    riskPenalty,
    explanation,
    sourceBreakdown,
    dedupeConfidence,
    anomalyReasons,
    computedAt: new Date().toISOString()
  };
}

function buildSourceBreakdown(observations: SourceObservation[]): SourceBreakdown[] {
  const groups = new Map<string, SourceObservation[]>();
  for (const observation of observations) {
    const items = groups.get(observation.source) ?? [];
    items.push(observation);
    groups.set(observation.source, items);
  }
  return Array.from(groups.entries()).map(([source, items]) => ({
    source,
    weight: sourceWeight(source),
    observations: items.length,
    maxGrowth: Math.max(...items.map((item) => item.growth ?? 0), 0),
    bestRank: Math.min(...items.map((item) => item.rank ?? 999))
  }));
}

function sourceWeight(source: string): number {
  const normalized = source.toLowerCase();
  if (normalized.includes("trending")) return 1;
  if (normalized.includes("search")) return 0.9;
  if (normalized.includes("archive")) return 0.85;
  if (normalized.includes("stargazer")) return 0.75;
  if (normalized.includes("telegram")) return 0.7;
  if (normalized.includes("twitter") || normalized.includes("x (")) return 0.65;
  if (normalized.includes("hugging") || normalized.includes("papers")) return 0.6;
  if (normalized.includes("third")) return 0.45;
  return 0.55;
}

function activityFromPush(pushedAt?: string): number {
  if (!pushedAt) return 2;
  const ageDays = Math.max(0, (Date.now() - new Date(pushedAt).getTime()) / 86_400_000);
  if (ageDays <= 2) return 10;
  if (ageDays <= 14) return 8;
  if (ageDays <= 45) return 5;
  if (ageDays <= 180) return 2;
  return 0;
}

function anomalyHints(repo: Repository, growth: number, observations: SourceObservation[]): string[] {
  const reasons: string[] = [];
  if (growth > repo.stars * 0.6 && repo.stars > 1000) reasons.push("growth_outpaces_total_stars");
  if (observations.length === 1 && growth > 3000) reasons.push("single_source_high_growth");
  if (repo.openIssues > repo.forks * 3 && repo.openIssues > 300) reasons.push("maintenance_pressure");
  if (!repo.license || repo.license === "Unknown") reasons.push("unknown_license");
  return reasons;
}

function penaltyFor(reason: string): number {
  if (reason === "growth_outpaces_total_stars") return 7;
  if (reason === "single_source_high_growth") return 5;
  if (reason === "maintenance_pressure") return 3;
  if (reason === "unknown_license") return 1;
  return 1;
}

function dedupeConfidenceFor(repo: Repository, observations: SourceObservation[]): number {
  let confidence = 0.7;
  if (repo.nodeId) confidence += 0.2;
  if (new Set(observations.map((item) => item.source)).size > 1) confidence += 0.08;
  if (repo.fullName.includes("/")) confidence += 0.02;
  return clamp(confidence, 0.4, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
