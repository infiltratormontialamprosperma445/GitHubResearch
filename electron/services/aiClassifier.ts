import { AI_SUBCATEGORIES, Classification, PRIMARY_CATEGORIES, Repository } from "../../src/shared/types.js";

export interface AiClassifierSettings {
  aiApiKey: string;
  aiBaseUrl: string;
  aiModel: string;
}

export async function maybeRefineClassification(
  repo: Repository,
  initial: Classification,
  settings: AiClassifierSettings
): Promise<Classification> {
  if (!settings.aiApiKey || initial.confidence >= 0.72) return initial;
  try {
    const response = await fetch(`${settings.aiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.aiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: settings.aiModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Classify GitHub repositories for a local trend intelligence app. Return strict JSON with primaryCategory, secondaryCategory, tags, confidence, reason, learningValue, audience, risks, evidence."
          },
          {
            role: "user",
            content: JSON.stringify({
              allowedPrimary: [
                "AI",
                "Developer Tools",
                "Frontend/UI",
                "Backend/API",
                "Data/Analytics",
                "Security",
                "Infrastructure/DevOps",
                "Systems",
                "Mobile/Desktop",
                "Education/Awesome Lists",
                "Productivity",
                "Other"
              ],
              requiredAiSecondary: [
                "Agents",
                "Coding Agents",
                "Agent Frameworks",
                "Skills/Plugins",
                "MCP/Tools",
                "RAG/Knowledge",
                "LLM Apps",
                "Model Serving",
                "Evaluation",
                "AI Security",
                "Multimodal"
              ],
              repo
            })
          }
        ]
      })
    });
    if (!response.ok) return initial;
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return initial;
    const parsed = validateAiClassification(JSON.parse(content), initial);
    return {
      ...initial,
      primaryCategory: parsed.primaryCategory,
      secondaryCategory: parsed.secondaryCategory,
      tags: sanitizeStringArray(parsed.tags, initial.tags).slice(0, 10),
      confidence: clamp(Number(parsed.confidence ?? initial.confidence), 0.1, 0.98),
      reason: parsed.reason,
      learningValue: parsed.learningValue,
      audience: parsed.audience,
      risks: sanitizeStringArray(parsed.risks, initial.risks),
      evidence: sanitizeStringArray(parsed.evidence, initial.evidence),
      updatedAt: new Date().toISOString()
    };
  } catch {
    return initial;
  }
}

function validateAiClassification(value: unknown, fallback: Classification): Classification {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Partial<Classification>;
  const primaryCategory = PRIMARY_CATEGORIES.includes(candidate.primaryCategory as never)
    ? candidate.primaryCategory as Classification["primaryCategory"]
    : fallback.primaryCategory;
  const secondaryCategory = primaryCategory === "AI" && !AI_SUBCATEGORIES.includes(candidate.secondaryCategory as never)
    ? fallback.secondaryCategory
    : typeof candidate.secondaryCategory === "string" && candidate.secondaryCategory
      ? candidate.secondaryCategory
      : fallback.secondaryCategory;
  return {
    ...fallback,
    primaryCategory,
    secondaryCategory,
    tags: sanitizeStringArray(candidate.tags, fallback.tags),
    confidence: clamp(Number(candidate.confidence ?? fallback.confidence), 0.1, 0.98),
    reason: typeof candidate.reason === "string" ? candidate.reason : fallback.reason,
    learningValue: typeof candidate.learningValue === "string" ? candidate.learningValue : fallback.learningValue,
    audience: typeof candidate.audience === "string" ? candidate.audience : fallback.audience,
    risks: sanitizeStringArray(candidate.risks, fallback.risks),
    evidence: sanitizeStringArray(candidate.evidence, fallback.evidence)
  };
}

function sanitizeStringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
