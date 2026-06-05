import { describe, expect, it } from "vitest";
import { classifyRepository } from "../shared/classifier.js";
import { scoreRepository } from "../shared/ranking.js";
import { Repository, SourceObservation } from "../shared/types.js";

const baseRepo: Repository = {
  id: "github:example/agent-tools",
  fullName: "example/agent-tools",
  owner: "example",
  name: "agent-tools",
  description: "MCP tools and skills for coding agents.",
  url: "https://github.com/example/agent-tools",
  stars: 4200,
  forks: 600,
  openIssues: 40,
  language: "TypeScript",
  license: "MIT",
  topics: ["mcp", "agents", "skills"],
  pushedAt: new Date().toISOString(),
  readmeExcerpt: "Model Context Protocol server with plugins and agent tool calling.",
  lastSeenAt: new Date().toISOString()
};

describe("classifier", () => {
  it("places MCP and skills projects under the AI taxonomy", () => {
    const result = classifyRepository(baseRepo);
    expect(result.primaryCategory).toBe("AI");
    expect(["MCP/Tools", "Skills/Plugins", "Coding Agents"]).toContain(result.secondaryCategory);
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});

describe("ranking", () => {
  it("produces explainable scores from growth and source observations", () => {
    const classification = classifyRepository(baseRepo);
    const observations: SourceObservation[] = [
      {
        id: "one",
        repoId: baseRepo.id,
        source: "GitHub Trending",
        window: "daily",
        observedAt: new Date().toISOString(),
        rank: 2,
        stars: baseRepo.stars,
        growth: 820
      },
      {
        id: "two",
        repoId: baseRepo.id,
        source: "GitHub Search API",
        window: "daily",
        observedAt: new Date().toISOString(),
        rank: 8,
        stars: baseRepo.stars,
        growth: 760
      }
    ];
    const score = scoreRepository(baseRepo, classification, observations, "daily");
    expect(score.score).toBeGreaterThan(50);
    expect(score.explanation.join(" ")).toContain("source families matched");
    expect(score.sourceBreakdown).toHaveLength(2);
    expect(score.dedupeConfidence).toBeGreaterThan(0.7);
  });
});
