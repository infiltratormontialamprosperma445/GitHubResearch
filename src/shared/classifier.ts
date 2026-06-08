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

export const CLASSIFIER_RULE_VERSION = "2026-06-08-ai-zh-v1";

const AI_RULES: RuleMatch[] = [
  {
    primary: "AI",
    secondary: "Coding Agents",
    keywords: [
      "claude code", "claude-code", "chatgpt cli", "codex", "codex cli", "coding agent", "code agent", "ai coding", "devin",
      "swe-agent", "swe-bench", "code generation", "code assistant", "ai developer",
      "software engineering agent", "terminal agent", "ide agent", "cursor", "windsurf", "aider", "continue dev",
      "openhands", "open hands", "cline", "roo code", "roo-code", "opencode", "plandex", "codeium",
      "编程智能体", "代码智能体", "编码智能体", "代码助手", "ai 编程", "ai 编码", "终端智能体", "ide 智能体"
    ],
    confidence: 0.93
  },
  {
    primary: "AI",
    secondary: "Skills/Plugins",
    keywords: [
      "skill", "skills", "plugin", "plugins", "tool plugin", "extension",
      "ai plugin", "agent skill", "agent skills", "mcp plugin", "tool extension",
      "slash command", "slash-command", "custom command", "command palette",
      "技能", "插件", "扩展", "工具插件", "智能体技能", "agent 技能", "mcp 插件", "斜杠命令", "自定义命令"
    ],
    confidence: 0.88
  },
  {
    primary: "AI",
    secondary: "Prompts/Workflows",
    keywords: [
      "prompt library", "prompt manager", "prompt workflow", "prompt engineering",
      "prompt template", "prompt templates", "system prompt", "chatgpt prompts",
      "ai prompts", "llm prompts", "promptflow", "prompt flow",
      "提示词", "提示语", "提示词库", "提示词管理", "提示词工作流", "提示词工程",
      "提示词模板", "系统提示词", "工作流提示词", "chatgpt 提示词", "大模型提示词"
    ],
    confidence: 0.87
  },
  {
    primary: "AI",
    secondary: "MCP/Tools",
    keywords: [
      "mcp", "model context protocol", "tool calling", "tools server", "agent tool",
      "mcp server", "mcp-server", "mcp client", "mcp-client", "function calling", "tool use", "tool-use",
      "computer use", "tool server", "tool adapter",
      "模型上下文协议", "工具调用", "函数调用", "工具服务器", "mcp 服务", "mcp 客户端", "工具适配器"
    ],
    confidence: 0.91
  },
  {
    primary: "AI",
    secondary: "Agent Frameworks",
    keywords: [
      "agent framework", "multi-agent", "workflow agent", "autonomous agent", "agentic",
      "agent orchestration", "agent chain", "langgraph", "autogen", "crewai",
      "openai agents sdk", "openai agents", "semantic kernel", "agent swarm", "agent collaboration", "agent pipeline",
      "智能体框架", "多智能体", "工作流智能体", "自主智能体", "智能体编排", "智能体协作", "智能体流水线"
    ],
    confidence: 0.9
  },
  {
    primary: "AI",
    secondary: "Agents",
    keywords: [
      "agent", "agents", "assistant", "autonomous", "crew", "swarm",
      "ai assistant", "conversational agent", "task agent", "planning agent",
      "智能体", "代理", "ai 助手", "对话智能体", "任务智能体", "规划智能体"
    ],
    confidence: 0.84
  },
  {
    primary: "AI",
    secondary: "RAG/Knowledge",
    keywords: [
      "rag", "retrieval", "vector database", "embedding", "knowledge base", "semantic search",
      "retrieval augmented", "vector store", "chunking", "document retrieval",
      "knowledge graph", "semantic index", "hybrid search", "reranking", "reranker",
      "检索增强", "向量数据库", "向量存储", "嵌入", "知识库", "语义搜索", "知识图谱", "混合搜索", "重排序"
    ],
    confidence: 0.88
  },
  {
    primary: "AI",
    secondary: "Model Serving",
    keywords: [
      "llm serving", "inference", "vllm", "ollama", "llama.cpp", "model server",
      "model serving", "text generation inference", "tgi", "tensorrt", "triton server",
      "model deployment", "serving engine", "batch inference", "speculative decoding",
      "模型服务", "模型推理", "推理服务", "模型部署", "大模型部署", "批量推理"
    ],
    confidence: 0.87
  },
  {
    primary: "AI",
    secondary: "Evaluation",
    keywords: [
      "eval", "benchmark", "prompt evaluation", "llm judge", "testing llm",
      "llm benchmark", "evaluation framework", "human eval", "mt bench",
      "arena", "leaderboard", "ai testing", "prompt test",
      "模型评测", "大模型评测", "提示词评测", "评估框架", "排行榜", "基准测试"
    ],
    confidence: 0.84
  },
  {
    primary: "AI",
    secondary: "AI Security",
    keywords: [
      "prompt injection", "jailbreak", "guardrail", "red team", "ai security",
      "ai safety", "alignment", "rlhf", "dpo", "constitutional ai",
      "adversarial attack", "model watermark", "content filter",
      "提示词注入", "越狱", "护栏", "ai 安全", "大模型安全", "模型水印", "内容过滤"
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
      "llm", "chatbot", "openai", "anthropic", "gemini", "copilot",
      "gpt", "claude", "chatgpt", "custom gpt", "gpts", "assistants api", "assistant api",
      "responses api", "openai compatible", "langchain", "llama", "mistral", "deepseek",
      "qwen", "phi model", "small language model", "on-device llm",
      "大模型", "语言模型", "聊天机器人", "对话机器人", "通义千问", "千问", "本地大模型", "端侧大模型"
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
    const name = repo.name || repo.fullName;
    if (secondary === "Coding Agents") return `Study how ${name} structures agentic coding loops, terminal/IDE tool use, and repository editing safeguards.`;
    if (secondary === "Prompts/Workflows") return `Review ${name} for reusable prompt patterns, evaluation flows, and workflow templates.`;
    if (secondary === "MCP/Tools") return `Study how ${name} exposes tools, context, and permissions to AI clients through protocol-style integrations.`;
    if (secondary === "Agent Frameworks") return `Study how ${name} orchestrates roles, memory, tools, and multi-agent control flow.`;
    if (secondary === "Model Serving") return `Review ${name} for deployment, routing, batching, and local/hosted inference tradeoffs.`;
    return `Study how ${name} approaches ${secondary.toLowerCase()} patterns, project structure, and user-facing abstractions.`;
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
  if (primary === "AI") {
    if (secondary === "Coding Agents") return "AI coding tool builders, CLI/IDE extension authors, and software engineering automation teams.";
    if (secondary === "Prompts/Workflows") return "Prompt engineers, AI product builders, and teams standardizing reusable LLM workflows.";
    if (secondary === "MCP/Tools") return "Agent platform developers, tool integration authors, and local-first AI workflow builders.";
    return `AI builders, agent platform developers, and engineers tracking ${secondary}.`;
  }
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
