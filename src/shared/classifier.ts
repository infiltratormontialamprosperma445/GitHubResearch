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

export const CLASSIFIER_RULE_VERSION = "2026-06-08-ai-taxonomy-v3";

const AI_RULES: RuleMatch[] = [
  {
    primary: "AI",
    secondary: "Claude Code",
    keywords: [
      "claude code", "claude-code", "claude coding", "claude cli", "claude agent", "claude desktop", "claude-code-sdk",
      "anthropic code", "anthropic coding agent", "claude slash command", "claude command", "claude subagent", "claude sub-agent",
      "claude mcp", "claude tool", "claude skill", "claude skills",
      "claude 编程", "claude 代码", "claude 技能", "claude 插件", "claude 斜杠命令", "claude 智能体"
    ],
    confidence: 0.96
  },
  {
    primary: "AI",
    secondary: "Codex/CLI",
    keywords: [
      "codex", "codex cli", "openai codex", "codex agent", "codex coding", "codex terminal", "codex tools",
      "codex workflow", "codex extension", "codex prompt", "gpt codex", "openai coding agent",
      "codex 编程", "codex 代码", "codex 命令行", "codex 智能体"
    ],
    confidence: 0.95
  },
  {
    primary: "AI",
    secondary: "Coding Agents",
    keywords: [
      "chatgpt cli", "coding agent", "code agent", "ai coding", "devin",
      "swe-agent", "swe-bench", "code generation", "code assistant", "ai developer", "ai engineer",
      "software engineering agent", "terminal agent", "ide agent", "cursor", "windsurf", "aider", "continue dev",
      "openhands", "open hands", "cline", "roo code", "roo-code", "opencode", "plandex", "codeium", "copilot workspace",
      "编程智能体", "代码智能体", "编码智能体", "代码助手", "ai 编程", "ai 编码", "终端智能体", "ide 智能体", "软件工程智能体"
    ],
    confidence: 0.93
  },
  {
    primary: "AI",
    secondary: "Skills/Plugins",
    keywords: [
      "skill", "skills", "ai skill", "agent skill", "agent skills", "claude skill", "claude skills",
      "plugin", "plugins", "tool plugin", "extension", "extensions", "add-on", "addon",
      "ai plugin", "mcp plugin", "tool extension", "ide extension", "vscode extension",
      "slash command", "slash-command", "custom command", "command palette", "prompt command", "workflow command",
      "技能", "插件", "扩展", "工具插件", "智能体技能", "agent 技能", "mcp 插件", "claude 技能", "斜杠命令", "自定义命令", "命令插件"
    ],
    confidence: 0.9
  },
  {
    primary: "AI",
    secondary: "Prompts/Workflows",
    keywords: [
      "prompt", "prompts", "prompt library", "prompt manager", "prompt workflow", "prompt engineering",
      "prompt template", "prompt templates", "system prompt", "chatgpt prompts", "claude prompts", "codex prompts",
      "ai prompts", "llm prompts", "promptflow", "prompt flow", "prompt ops", "promptops", "agent workflow", "llm workflow",
      "提示词", "提示语", "提示词库", "提示词管理", "提示词工作流", "提示词工程",
      "提示词模板", "系统提示词", "工作流提示词", "chatgpt 提示词", "claude 提示词", "codex 提示词", "大模型提示词", "智能体工作流"
    ],
    confidence: 0.89
  },
  {
    primary: "AI",
    secondary: "MCP Servers",
    keywords: [
      "mcp server", "mcp-server", "mcp servers", "model context protocol server", "context server",
      "mcp registry", "mcp marketplace", "mcp directory", "awesome mcp", "mcp tools server",
      "filesystem mcp", "github mcp", "browser mcp", "playwright mcp", "database mcp", "slack mcp",
      "mcp 服务", "mcp 服务器", "mcp 服务端", "mcp 目录", "mcp 市场", "mcp 注册表", "工具服务器"
    ],
    confidence: 0.96
  },
  {
    primary: "AI",
    secondary: "MCP Clients",
    keywords: [
      "mcp client", "mcp-client", "mcp host", "mcp gateway", "mcp router", "mcp inspector", "mcp cli",
      "claude desktop mcp", "cursor mcp", "cline mcp", "roo code mcp", "vscode mcp", "agent client",
      "mcp 客户端", "mcp 主机", "mcp 网关", "mcp 路由", "mcp 调试", "mcp 检查器"
    ],
    confidence: 0.94
  },
  {
    primary: "AI",
    secondary: "Tool Calling",
    keywords: [
      "tool calling", "function calling", "tool use", "tool-use", "agent tools", "tool router",
      "tools api", "openai tools", "anthropic tools", "structured outputs", "json schema tools",
      "function call", "tool adapter", "tool registry", "toolformer",
      "工具调用", "函数调用", "工具使用", "工具路由", "工具适配器", "结构化输出", "工具注册"
    ],
    confidence: 0.9
  },
  {
    primary: "AI",
    secondary: "Browser Automation",
    keywords: [
      "browser automation", "browser agent", "browser-use", "browser use", "playwright", "puppeteer", "selenium",
      "stagehand", "browserbase", "web automation", "web agent", "headless browser", "browser control",
      "网页自动化", "浏览器自动化", "浏览器智能体", "网页智能体", "浏览器控制", "无头浏览器"
    ],
    confidence: 0.9
  },
  {
    primary: "AI",
    secondary: "Computer Use",
    keywords: [
      "computer use", "computer-use", "desktop automation", "screen agent", "ui automation", "visual agent",
      "operate computer", "gui agent", "remote browser", "sandbox agent", "e2b", "open interpreter",
      "电脑使用", "计算机使用", "桌面自动化", "屏幕智能体", "gui 智能体", "界面自动化", "沙箱智能体"
    ],
    confidence: 0.9
  },
  {
    primary: "AI",
    secondary: "AI Browsers",
    keywords: [
      "ai browser", "agent browser", "browser assistant", "arc browser ai", "dia browser", "perplexity comet",
      "browser copilot", "web copilot", "浏览器助手", "ai 浏览器", "智能浏览器", "浏览器 copilot"
    ],
    confidence: 0.84
  },
  {
    primary: "AI",
    secondary: "MCP/Tools",
    keywords: [
      "mcp", "model context protocol", "tool calling", "tools server", "agent tool",
      "mcp server", "mcp-server", "mcp servers", "mcp client", "mcp-client", "mcp gateway", "mcp registry",
      "mcp marketplace", "mcp tools", "mcp adapter", "mcp protocol", "function calling", "tool use", "tool-use",
      "computer use", "tool server", "tool adapter", "agent tools", "tool router", "context server",
      "模型上下文协议", "工具调用", "函数调用", "工具服务器", "mcp 服务", "mcp 服务器", "mcp 客户端", "mcp 网关", "mcp 工具", "工具适配器"
    ],
    confidence: 0.93
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
    secondary: "OpenAI/GPT",
    keywords: [
      "openai", "chatgpt", "gpt", "gpt-4", "gpt-4o", "gpt-5", "gpt api", "openai api",
      "responses api", "assistants api", "assistant api", "openai compatible", "gpts", "custom gpt",
      "chat cpt", "cpt ai", "openai sdk", "openai agents sdk",
      "openai 应用", "openai 接口", "chatgpt", "gpt 应用", "gpt 工具", "兼容 openai", "大模型 api"
    ],
    confidence: 0.87
  },
  {
    primary: "AI",
    secondary: "Claude/Anthropic",
    keywords: [
      "anthropic", "claude", "claude api", "claude sdk", "claude desktop", "claude model", "claude opus", "claude sonnet", "claude haiku",
      "anthropic api", "anthropic sdk", "claude mcp", "claude prompts", "claude workflow",
      "anthropic 接口", "claude 应用", "claude 模型", "claude 工具", "claude 工作流"
    ],
    confidence: 0.86
  },
  {
    primary: "AI",
    secondary: "Local Models",
    keywords: [
      "local llm", "local ai", "ollama", "llama.cpp", "gguf", "lm studio", "on-device llm", "edge llm",
      "qwen", "deepseek", "chatglm", "internlm", "modelscope", "xinference", "llamacpp", "mlx-lm",
      "本地大模型", "本地 ai", "端侧大模型", "离线大模型", "通义千问", "智谱", "书生浦语", "模型部署"
    ],
    confidence: 0.87
  },
  {
    primary: "AI",
    secondary: "LLM Gateways",
    keywords: [
      "llm gateway", "ai gateway", "model gateway", "model router", "llm router", "openai compatible",
      "one-api", "litellm", "portkey", "openrouter", "new api", "api proxy", "model proxy",
      "模型网关", "大模型网关", "模型路由", "openai 兼容", "api 代理", "统一网关"
    ],
    confidence: 0.88
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
      "llm", "chatbot", "ai app", "llm app", "language model app", "copilot",
      "gemini", "langchain", "llama", "mistral", "deepseek",
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
    if (secondary === "MCP/Tools" || secondary === "MCP Servers" || secondary === "MCP Clients") return `Study how ${name} exposes tools, context, permissions, and client/server boundaries through protocol-style integrations.`;
    if (secondary === "Tool Calling") return `Review ${name} for tool schemas, function-calling reliability, permission boundaries, and agent action design.`;
    if (secondary === "Browser Automation" || secondary === "Computer Use" || secondary === "AI Browsers") return `Study how ${name} turns browser or desktop actions into safe, observable agent workflows.`;
    if (secondary === "Agent Frameworks") return `Study how ${name} orchestrates roles, memory, tools, and multi-agent control flow.`;
    if (secondary === "Local Models" || secondary === "Model Serving" || secondary === "LLM Gateways") return `Review ${name} for deployment, routing, batching, local/hosted inference, and provider abstraction tradeoffs.`;
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
    if (secondary === "MCP/Tools" || secondary === "MCP Servers" || secondary === "MCP Clients") return "Agent platform developers, tool integration authors, and local-first AI workflow builders.";
    if (secondary === "Browser Automation" || secondary === "Computer Use" || secondary === "AI Browsers") return "AI browser automation builders, QA automation teams, and agent UX engineers.";
    if (secondary === "Tool Calling") return "Agent runtime builders, API designers, and teams standardizing reliable tool execution.";
    if (secondary === "Local Models" || secondary === "LLM Gateways") return "AI platform engineers, local model operators, and provider-routing infrastructure teams.";
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
