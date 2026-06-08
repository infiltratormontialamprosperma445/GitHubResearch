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

  it("recognizes coding agents, prompts, OpenAI, ChatGPT, and MCP projects", () => {
    const cases: Array<{ name: string; description: string; topics: string[]; expected: string }> = [
      { name: "claude-code-tools", description: "Claude Code terminal coding agent with slash commands.", topics: ["claude-code", "coding-agent", "cli"], expected: "Coding Agents" },
      { name: "openai-agents-sdk", description: "OpenAI Agents SDK examples for multi-agent workflows.", topics: ["openai", "agents", "sdk"], expected: "Agent Frameworks" },
      { name: "chatgpt-cli", description: "ChatGPT CLI coding agent for terminal agent workflows.", topics: ["chatgpt", "cli", "llm", "coding-agent"], expected: "Coding Agents" },
      { name: "mcp-server-example", description: "MCP server with tool calling and computer use adapters.", topics: ["mcp-server", "tools"], expected: "MCP/Tools" },
      { name: "prompt-library", description: "System prompt templates and prompt workflow manager.", topics: ["prompt-library", "prompts"], expected: "Prompts/Workflows" },
      { name: "claude-skills", description: "Claude Code 技能插件和斜杠命令集合.", topics: ["claude", "skills", "插件"], expected: "Skills/Plugins" },
      { name: "prompt-cn", description: "中文提示词库，系统提示词模板和 prompt workflow manager.", topics: ["提示词", "prompts"], expected: "Prompts/Workflows" },
      { name: "openai-chatgpt-tools", description: "OpenAI ChatGPT 大模型应用 examples.", topics: ["openai", "chatgpt", "llm"], expected: "LLM Apps" },
      { name: "aider-codex-opencode", description: "Aider, Codex, and OpenHands style software engineering agent.", topics: ["aider", "codex", "openhands"], expected: "Coding Agents" }
    ];

    for (const item of cases) {
      const result = classifyRepository({
        ...baseRepo,
        id: `github:example/${item.name}`,
        fullName: `example/${item.name}`,
        name: item.name,
        description: item.description,
        topics: item.topics,
        readmeExcerpt: item.description
      });
      expect(result.primaryCategory, item.name).toBe("AI");
      expect(result.secondaryCategory, item.name).toBe(item.expected);
      expect(result.reason, item.name).toContain("Matched");
    }
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
