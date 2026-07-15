export type ToolDisplaySection =
  | { type: "markdown"; text: string }
  | { type: "code"; language: string; text: string };

export type ToolDisplayContent = {
  summary: string;
  args?: ToolDisplaySection;
  result?: ToolDisplaySection;
};

function truncate(text: string, max = 120) {
  const line = text.split("\n")[0] ?? text;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

export function tryParseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSkillPayload(value: unknown) {
  return isRecord(value) && typeof value.content === "string" && typeof value.name === "string";
}

function formatTags(tags: unknown) {
  if (!Array.isArray(tags) || tags.length === 0) return "";
  return `**Tags:** ${tags.map(String).join(", ")}\n\n`;
}

function formatSkillPayload(data: Record<string, unknown>): ToolDisplayContent {
  const name = typeof data.name === "string" ? data.name : "skill";
  const description = typeof data.description === "string" ? data.description.trim() : "";
  const content = typeof data.content === "string" ? data.content.trim() : "";
  const summary = description ? `${name} — ${truncate(description, 96)}` : name;

  const parts = [
    `## ${name}`,
    description,
    formatTags(data.tags).trim(),
    content,
  ].filter((part) => part.length > 0);

  return {
    summary,
    result: { type: "markdown", text: parts.join("\n\n") },
  };
}

function jsonValueToMarkdown(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return "_vide_";
  if (typeof value === "string") {
    if (value.includes("\n") || value.length > 120) {
      return `\n\n\`\`\`\n${value}\n\`\`\``;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return value.map(String).join(", ");
    }
    return value.map((item) => `- ${jsonValueToMarkdown(item, depth + 1)}`).join("\n");
  }
  if (!isRecord(value)) return String(value);

  const entries = Object.entries(value);
  if (entries.length === 0) return "_vide_";
  if (depth >= 1) {
    return `\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
  }

  return entries
    .map(([key, nested]) => {
      const rendered = jsonValueToMarkdown(nested, depth + 1);
      if (rendered.includes("\n")) {
        return `**${key}**${rendered}`;
      }
      return `**${key}:** ${rendered}`;
    })
    .join("\n\n");
}

function objectToMarkdown(data: Record<string, unknown>, title?: string) {
  const body = jsonValueToMarkdown(data);
  return title ? `## ${title}\n\n${body}` : body;
}

function formatArgsSection(
  args: Record<string, unknown>,
  argsText: string,
): ToolDisplaySection | undefined {
  const parsed = tryParseJson(argsText.trim() || args);
  if (typeof parsed === "string") {
    const text = parsed.trim();
    return text ? { type: "markdown", text } : undefined;
  }
  if (isSkillPayload(parsed)) return undefined;
  if (isRecord(parsed) && Object.keys(parsed).length === 0) return undefined;
  if (isRecord(parsed)) {
    return { type: "markdown", text: objectToMarkdown(parsed, "Arguments") };
  }
  return undefined;
}

function formatResultSection(
  toolName: string,
  result: unknown,
): ToolDisplaySection | undefined {
  const parsed = tryParseJson(result);
  if (parsed === undefined || parsed === null || parsed === "") return undefined;

  if (isSkillPayload(parsed) || (toolName === "skill_view" && isRecord(parsed))) {
    return formatSkillPayload(isRecord(parsed) ? parsed : {}).result;
  }

  if (typeof parsed === "string") {
    const text = parsed.trim();
    if (!text) return undefined;
    if (/^#{1,6}\s/.test(text) || text.includes("\n## ") || text.includes("\n- ")) {
      return { type: "markdown", text };
    }
    return { type: "markdown", text };
  }

  if (isRecord(parsed)) {
    if (typeof parsed.content === "string" && parsed.content.trim()) {
      return formatSkillPayload(parsed).result;
    }
    if (typeof parsed.summary === "string" && parsed.summary.trim()) {
      return { type: "markdown", text: parsed.summary.trim() };
    }
    if (typeof parsed.result_text === "string" && parsed.result_text.trim()) {
      return { type: "markdown", text: parsed.result_text.trim() };
    }
    return { type: "markdown", text: objectToMarkdown(parsed, toolName) };
  }

  if (Array.isArray(parsed)) {
    return { type: "markdown", text: jsonValueToMarkdown(parsed) };
  }

  return { type: "markdown", text: String(parsed) };
}

function buildSummary(
  toolName: string,
  args: Record<string, unknown>,
  argsText: string,
  result: unknown,
) {
  const parsedResult = tryParseJson(result);
  if (isSkillPayload(parsedResult)) {
    const name = typeof parsedResult.name === "string" ? parsedResult.name : toolName;
    const description = typeof parsedResult.description === "string"
      ? parsedResult.description.trim()
      : "";
    return description ? `${name} — ${truncate(description, 96)}` : name;
  }

  const parsedArgs = tryParseJson(argsText.trim() || args);
  if (isRecord(parsedArgs)) {
    const skill = parsedArgs.skill ?? parsedArgs.name ?? parsedArgs.path;
    if (typeof skill === "string" && skill.trim()) {
      return `${toolName} · ${truncate(skill.trim(), 96)}`;
    }
  }

  const argsPreview = typeof parsedArgs === "string"
    ? parsedArgs.trim()
    : isRecord(parsedArgs)
      ? JSON.stringify(parsedArgs)
      : "";
  if (argsPreview) return truncate(argsPreview, 120);

  if (typeof parsedResult === "string" && parsedResult.trim()) {
    return truncate(parsedResult.trim(), 120);
  }

  if (isRecord(parsedResult) && typeof parsedResult.name === "string") {
    return parsedResult.name;
  }

  return toolName;
}

export function formatToolDisplay(
  toolName: string,
  args: Record<string, unknown>,
  argsText: string,
  result: unknown,
): ToolDisplayContent {
  return {
    summary: buildSummary(toolName, args, argsText, result),
    args: formatArgsSection(args, argsText),
    result: formatResultSection(toolName, result),
  };
}
