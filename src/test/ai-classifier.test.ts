import { afterEach, describe, expect, it, vi } from "vitest";
import { maybeRefineClassification } from "../../electron/services/aiClassifier.js";
import { classifyRepository } from "../shared/classifier.js";
import { Repository } from "../shared/types.js";

const repo: Repository = {
  id: "github:example/unknown-tool",
  fullName: "example/unknown-tool",
  owner: "example",
  name: "unknown-tool",
  description: "An experimental repository.",
  url: "https://github.com/example/unknown-tool",
  stars: 120,
  forks: 9,
  openIssues: 2,
  language: "TypeScript",
  license: "MIT",
  topics: ["experimental"],
  lastSeenAt: new Date().toISOString()
};

describe("AI classifier validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to the rule classification when AI returns invalid JSON", async () => {
    const initial = { ...classifyRepository(repo), confidence: 0.4 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "not json" } }]
    }), { status: 200 })));

    const result = await maybeRefineClassification(repo, initial, {
      aiApiKey: "test",
      aiBaseUrl: "https://example.test/v1",
      aiModel: "test-model"
    });

    expect(result).toEqual(initial);
  });

  it("rejects AI categories outside the supported taxonomy", async () => {
    const initial = { ...classifyRepository(repo), confidence: 0.4 };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            primaryCategory: "Finance",
            secondaryCategory: "Speculation",
            tags: ["bad"],
            confidence: 2,
            reason: "bad category",
            learningValue: "x",
            audience: "x",
            risks: [],
            evidence: []
          })
        }
      }]
    }), { status: 200 })));

    const result = await maybeRefineClassification(repo, initial, {
      aiApiKey: "test",
      aiBaseUrl: "https://example.test/v1",
      aiModel: "test-model"
    });

    expect(result.primaryCategory).toBe(initial.primaryCategory);
    expect(result.confidence).toBeLessThanOrEqual(0.98);
  });
});
