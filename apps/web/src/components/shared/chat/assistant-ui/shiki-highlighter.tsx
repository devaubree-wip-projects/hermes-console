"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

type TokenVariant = {
  color?: string;
  fontStyle?: number;
};

type HighlightToken = {
  content: string;
  variants?: {
    light?: TokenVariant;
    dark?: TokenVariant;
  };
};

type SyntaxHighlighterProps = {
  code: string;
  language?: string;
  className?: string;
};

type TokenStyle = CSSProperties & {
  "--shiki-light"?: string;
  "--shiki-dark"?: string;
};

const normalizeLanguage = (language?: string) => {
  const lang = language?.trim().toLowerCase();
  if (!lang) return "text";

  const aliases: Record<string, string> = {
    cjs: "js",
    console: "shellscript",
    env: "shellscript",
    mjs: "js",
    plaintext: "text",
    shell: "shellscript",
    sh: "shellscript",
    terminal: "shellscript",
    yml: "yaml",
  };

  return aliases[lang] ?? lang;
};

export function SyntaxHighlighter({
  code,
  language,
  className,
}: SyntaxHighlighterProps) {
  const normalizedLanguage = useMemo(
    () => normalizeLanguage(language),
    [language],
  );
  const [tokens, setTokens] = useState<HighlightToken[][] | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      const { codeToTokensWithThemes } = await import("shiki");

      try {
        const highlighted = await codeToTokensWithThemes(code, {
          lang: normalizedLanguage as "text",
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
        });

        if (!cancelled) setTokens(highlighted as HighlightToken[][]);
      } catch {
        const highlighted = await codeToTokensWithThemes(code, {
          lang: "text",
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
        });

        if (!cancelled) setTokens(highlighted as HighlightToken[][]);
      }
    }

    setTokens(null);
    void highlight();

    return () => {
      cancelled = true;
    };
  }, [code, normalizedLanguage]);

  if (!tokens) {
    return (
      <code className={cn("block font-mono text-foreground", className)}>
        {code}
      </code>
    );
  }

  return (
    <code className={cn("block font-mono", className)}>
      {tokens.map((line, lineIndex) => (
        <span key={lineIndex} className="block min-h-[1lh]">
          {line.map((token, tokenIndex) => {
            const light = token.variants?.light;
            const dark = token.variants?.dark;
            const style: TokenStyle = {
              "--shiki-light": light?.color,
              "--shiki-dark": dark?.color,
              fontStyle:
                (light?.fontStyle ?? dark?.fontStyle) === 1
                  ? "italic"
                  : undefined,
            };

            return (
              <span
                key={tokenIndex}
                className="[color:var(--shiki-light)] dark:[color:var(--shiki-dark)]"
                style={style}
              >
                {token.content}
              </span>
            );
          })}
        </span>
      ))}
    </code>
  );
}
