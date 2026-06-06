import {
  AI_SUBCATEGORIES,
  Classification,
  PrimaryCategory,
  Repository
} from "./types.js";

type RuleMatch = {
  primary: PrimaryCategory;
  secondary: string;
  keywords: string[];
  confidence: number;
};

const AI_RULES: RuleMatch[] = [
  {
    primary: "AI",
    secondary: "Coding Agents",
    keywords: [
      "claude code", "codex", "coding agent", "code agent", "ai coding", "devin",
      "swe-agent", "swe-bench", "code generation", "code assistant", "ai developer",
      "ide agent", "cursor", "windsurf", "aider", "continue dev", "codeium"
    ],
    confidence: 0.93
  },
  {
    primary: "AI",
    secondary: "Skills/Plugins",
    keywords: [
      "skill", "skills", "plugin", "plugins", "tool plugin", "extension",
      "ai plugin", "agent skill", "mcp plugin", "tool extension"
    ],
    confidence: 0.88
  },
  {
    primary: "AI",
    secondary: "MCP/Tools",
    keywords: [
      "mcp", "model context protocol", "tool calling", "tools server", "agent tool",
      "mcp server", "mcp client", "function calling", "tool use", "tool-use"
    ],
    confidence: 0.91
  },
  {
    primary: "AI",
    secondary: "Agent Frameworks",
    keywords: [
      "agent framework", "multi-agent", "workflow agent", "autonomous agent", "agentic",
      "agent orchestration", "agent chain", "langgraph", "autogen", "crewai",
      "agent swarm", "agent collaboration", "agent pipeline"
    ],
    confidence: 0.9
  },
  {
    primary: "AI",
    secondary: "Agents",
    keywords: [
      "agent", "agents", "assistant", "autonomous", "crew", "swarm",
      "ai assistant", "conversational agent", "task agent", "planning agent"
    ],
    confidence: 0.84
  },
  {
    primary: "AI",
    secondary: "RAG/Knowledge",
    keywords: [
      "rag", "retrieval", "vector database", "embedding", "knowledge base", "semantic search",
      "retrieval augmented", "vector store", "chunking", "document retrieval",
      "knowledge graph", "semantic index", "hybrid search", "reranking", "reranker"
    ],
    confidence: 0.88
  },
  {
    primary: "AI",
    secondary: "Model Serving",
    keywords: [
      "llm serving", "inference", "vllm", "ollama", "llama.cpp", "model server",
      "model serving", "text generation inference", "tgi", "tensorrt", "triton server",
      "model deployment", "serving engine", "batch inference", "speculative decoding"
    ],
    confidence: 0.87
  },
  {
    primary: "AI",
    secondary: "Evaluation",
    keywords: [
      "eval", "benchmark", "prompt evaluation", "llm judge", "testing llm",
      "llm benchmark", "evaluation framework", "human eval", "mt bench",
      "arena", "leaderboard", "ai testing", "prompt test"
    ],
    confidence: 0.84
  },
  {
    primary: "AI",
    secondary: "AI Security",
    keywords: [
      "prompt injection", "jailbreak", "guardrail", "red team", "ai security",
      "ai safety", "alignment", "rlhf", "dpo", "constitutional ai",
      "adversarial attack", "model watermark", "content filter"
    ],
    confidence: 0.86
  },
  {
    primary: "AI",
    secondary: "Multimodal",
    keywords: [
      "multimodal", "vision-language", "image generation", "speech", "video generation",
      "text-to-image", "image-to-text", "text-to-video", "audio generation",
      "stable diffusion", "flux", "vision transformer", "clip model"
    ],
    confidence: 0.83
  },
  {
    primary: "AI",
    secondary: "LLM Apps",
    keywords: [
      "llm", "chatbot", "openai", "anthropic", "gemini", "prompt", "copilot",
      "gpt", "claude", "chatgpt", "langchain", "llama", "mistral", "deepseek",
      "qwen", "phi model", "small language model", "on-device llm"
    ],
    confidence: 0.8
  }
];

const GENERAL_RULES: RuleMatch[] = [
  {
    primary: "Developer Tools",
    secondary: "CLI/Automation",
    keywords: ["cli", "developer tool", "automation", "terminal", "sdk", "api client"],
    confidence: 0.78
  },
  {
    primary: "Frontend/UI",
    secondary: "UI Frameworks",
    keywords: ["react", "vue", "svelte", "component", "ui", "css", "tailwind", "design system"],
    confidence: 0.78
  },
  {
    primary: "Backend/API",
    secondary: "Servers/APIs",
    keywords: ["api", "server", "backend", "framework", "http", "graphql", "rpc"],
    confidence: 0.76
  },
  {
    primary: "Data/Analytics",
    secondary: "Data Platforms",
    keywords: ["database", "analytics", "warehouse", "etl", "dataframe", "sql", "pipeline"],
    confidence: 0.8
  },
  {
    primary: "Security",
    secondary: "Security Tools",
    keywords: ["security", "vulnerability", "scanner", "malware", "auth", "secrets", "forensics"],
    confidence: 0.82
  },
  {
    primary: "Infrastructure/DevOps",
    secondary: "Cloud/DevOps",
    keywords: ["kubernetes", "docker", "terraform", "observability", "monitoring", "ci/cd", "devops"],
    confidence: 0.82
  },
  {
    primary: "Systems",
    secondary: "Runtime/Systems",
    keywords: ["runtime", "compiler", "kernel", "operating system", "wasm", "distributed system"],
    confidence: 0.78
  },
  {
    primary: "Mobile/Desktop",
    secondary: "Client Apps",
    keywords: ["ios", "android", "electron", "desktop", "mobile", "flutter", "react native"],
    confidence: 0.77
  },
  {
    primary: "Education/Awesome Lists",
    secondary: "Learning Resources",
    keywords: ["awesome", "course", "tutorial", "roadmap", "examples", "learn"],
    confidence: 0.82
  },
  {
    primary: "Productivity",
    secondary: "Productivity Tools",
    keywords: ["notes", "calendar", "todo", "productivity", "workflow", "knowledge management"],
    confidence: 0.72
  }
];

export function classifyRepository(repo: Repository): Classification {
  const topics = Array.isArray(repo.topics) ? repo.topics : [];
  const haystack = normalize(
    [
      repo.fullName ?? "",
      repo.description ?? "",
      repo.language ?? "",
      repo.license ?? "",
      repo.readmeExcerpt ?? "",
      topics.join(" ")
    ].join(" ")
  );

  const rules = [...AI_RULES, ...GENERAL_RULES];
  const matches = rules
    .map((rule) => ({
      rule,
      hits: rule.keywords.filter((keyword) => haystack.includes(normalize(keyword)))
    }))
    .filter((match) => match.hits.length > 0)
    .sort((a, b) => b.hits.length * b.rule.confidence - a.hits.length * a.rule.confidence);

  const best = matches[0]?.rule ?? inferByLanguage(repo);
  const bestHits = matches[0]?.hits ?? [repo.language || "repository metadata"];
  const confidence = Math.min(0.98, best.confidence + Math.max(0, bestHits.length - 1) * 0.03);
  const tags = unique([
    best.secondary,
    ...bestHits.map((hit) => titleTag(hit)),
    ...topics.slice(0, 4)
  ]).slice(0, 8);

  return {
    repoId: repo.id,
    primaryCategory: best.primary,
    secondaryCategory: normalizeAiSecondary(best.primary, best.secondary),
    tags,
    confidence,
    reason: `Matched ${bestHits.join(", ")} in repository metadata and README summary.`,
    learningValue: learningValueFor(best.primary, best.secondary, repo),
    audience: audienceFor(best.primary, best.secondary),
    risks: riskHints(repo),
    evidence: bestHits,
    overridden: false,
    updatedAt: new Date().toISOString()
  };
}

function inferByLanguage(repo: Repository): RuleMatch {
  const language = (repo.language ?? "").toLowerCase();
  if (["typescript", "javascript", "css", "html"].includes(language)) {
    return { primary: "Frontend/UI", secondary: "Web Apps", keywords: [repo.language], confidence: 0.58 };
  }
  if (["python", "jupyter notebook"].includes(language)) {
    return { primary: "AI", secondary: "LLM Apps", keywords: [repo.language], confidence: 0.56 };
  }
  if (["go", "rust", "c", "c++", "zig"].includes(language)) {
    return { primary: "Systems", secondary: "Runtime/Systems", keywords: [repo.language], confidence: 0.57 };
  }
  return { primary: "Other", secondary: "Unclassified", keywords: ["fallback"], confidence: 0.5 };
}

function normalizeAiSecondary(primary: PrimaryCategory, secondary: string): string {
  if (primary !== "AI") return secondary;
  return AI_SUBCATEGORIES.includes(secondary as never) ? secondary : "LLM Apps";
}

function learningValueFor(primary: PrimaryCategory, secondary: string, repo: Repository): string {
  if (primary === "AI") {
    return `Study how ${repo.name} approaches ${secondary.toLowerCase()} patterns, project structure, and user-facing abstractions.`;
  }
  if (primary === "Developer Tools") {
    return "Useful for understanding developer ergonomics, command design, and automation workflows.";
  }
  if (primary === "Infrastructure/DevOps") {
    return "Good candidate for learning production operations, deployment primitives, and reliability tradeoffs.";
  }
  return "Worth reviewing for implementation patterns, API design, and ecosystem signals.";
}

function audienceFor(primary: PrimaryCategory, secondary: string): string {
  if (primary === "AI") return `AI builders, agent platform developers, and engineers tracking ${secondary}.`;
  if (primary === "Frontend/UI") return "Frontend engineers and product builders.";
  if (primary === "Security") return "Security engineers and platform teams.";
  return "Developers collecting high-signal open source projects.";
}

function riskHints(repo: Repository): string[] {
  const risks: string[] = [];
  if (!repo.license || repo.license === "Unknown") risks.push("License is unclear.");
  if (repo.openIssues > 500) risks.push("Large open issue count may indicate maintenance pressure.");
  if (repo.stars > 50000 && repo.forks < 500) risks.push("Star/fork ratio is unusual; verify practical adoption.");
  if (!repo.pushedAt) risks.push("Recent activity could not be verified.");
  return risks.length ? risks : ["No obvious metadata risk detected."];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function titleTag(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
