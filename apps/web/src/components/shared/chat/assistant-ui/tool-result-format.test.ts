import { describe, expect, test } from "bun:test";
import { formatToolDisplay } from "@/components/shared/chat/assistant-ui/tool-result-format";

describe("formatToolDisplay", () => {
  test("renders skill_view JSON as markdown content", () => {
    const result = JSON.stringify({
      success: true,
      name: "codebase-inspection",
      description: "Inspect codebases w/ pygount: LOC, languages, ratios.",
      tags: ["LOC", "Code Analysis"],
      content: "## When to Use\n\nUse this skill when you need LOC stats.",
    });

    const display = formatToolDisplay("skill_view", {}, "", result);

    expect(display.summary).toBe(
      "codebase-inspection — Inspect codebases w/ pygount: LOC, languages, ratios.",
    );
    expect(display.result?.type).toBe("markdown");
    expect(display.result?.text).toContain("## codebase-inspection");
    expect(display.result?.text).toContain("## When to Use");
    expect(display.result?.text).not.toContain('"success": true');
  });

  test("uses readable summary instead of raw JSON in collapsed rows", () => {
    const display = formatToolDisplay(
      "skill_view",
      {},
      "",
      JSON.stringify({
        name: "requesting-code-review",
        description: "Pre-commit review: diff-focused checklist.",
        content: "# Review",
      }),
    );

    expect(display.summary).toBe(
      "requesting-code-review — Pre-commit review: diff-focused checklist.",
    );
  });

  test("formats generic object results as markdown fields", () => {
    const display = formatToolDisplay(
      "terminal",
      {},
      "",
      JSON.stringify({ exit_code: 0, stdout: "ok\nline 2" }),
    );

    expect(display.result?.type).toBe("markdown");
    expect(display.result?.text).toContain("**exit_code:** 0");
    expect(display.result?.text).toContain("```");
    expect(display.result?.text).toContain("ok");
  });

  test("does not summarize empty args as {}", () => {
    const display = formatToolDisplay(
      "browser_navigate",
      {},
      "",
      `<untrusted_tool_result source="browser_navigate">
{"success": true, "url": "https://wttr.in/Villeneuve-d%27Ascq", "title": "wttr.in"}
</untrusted_tool_result>`,
    );

    expect(display.summary).toBe("https://wttr.in/Villeneuve-d%27Ascq");
    expect(display.summary).not.toBe("{}");
    expect(display.result?.text).toContain("**url:**");
  });
});
