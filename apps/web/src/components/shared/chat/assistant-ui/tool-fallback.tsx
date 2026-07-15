"use client";

import type { ToolCallMessagePartComponent, ToolCallMessagePartProps } from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/shared/chat/ui/collapsible";
import { formatToolDisplay } from "@/components/shared/chat/assistant-ui/tool-result-format";
import { ToolMarkdown } from "@/components/shared/chat/assistant-ui/tool-markdown";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import { useMemo } from "react";

function ToolDisplaySectionView({
  title,
  section,
}: {
  title: string;
  section: NonNullable<ReturnType<typeof formatToolDisplay>["result"]>;
}) {
  return (
    <section>
      <div className="text-muted-foreground text-xs font-medium">{title}</div>
      {section.type === "markdown" ? (
        <div className="mt-2">
          <ToolMarkdown text={section.text} />
        </div>
      ) : (
        <pre className="mt-1 max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-md border border-border/50 bg-background/80 p-3 font-mono text-xs">
          {section.text}
        </pre>
      )}
    </section>
  );
}

export function ToolFallbackBody({
  toolName,
  args,
  argsText,
  result,
}: Pick<ToolCallMessagePartProps, "toolName" | "args" | "argsText" | "result">) {
  const display = useMemo(
    () => formatToolDisplay(toolName, args, argsText, result),
    [toolName, args, argsText, result],
  );

  return (
    <div
      data-slot="tool-fallback-body"
      className="rounded-md border border-border bg-muted/40 p-3 text-sm"
    >
      {display.args ? (
        <ToolDisplaySectionView title="Arguments" section={display.args} />
      ) : null}
      {display.result ? (
        <ToolDisplaySectionView
          title="Résultat"
          section={display.result}
        />
      ) : null}
    </div>
  );
}

export const ToolFallback: ToolCallMessagePartComponent = (props) => {
  return <ToolFallbackBody {...props} />;
};

export const ToolFallbackDetail: ToolCallMessagePartComponent = (props) => (
  <ToolFallbackDetailView {...props} collapsible />
);

export function ToolFallbackDetailView({
  toolName,
  args,
  argsText,
  result,
  status,
  collapsible,
}: ToolCallMessagePartProps & { collapsible: boolean }) {
  const isRunning = status?.type === "running" && result === undefined;
  const summary = useMemo(
    () => formatToolDisplay(toolName, args, argsText, result).summary,
    [toolName, args, argsText, result],
  );

  if (!collapsible) {
    return (
      <ToolFallbackBody
        toolName={toolName}
        args={args}
        argsText={argsText}
        result={result}
      />
    );
  }

  return (
    <Collapsible data-slot="tool-call-detail" defaultOpen={false}>
      <CollapsibleTrigger
        className={cn(
          "group/tool-call-trigger flex w-full items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left text-sm transition-colors",
          "hover:bg-muted/50",
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs">{summary}</span>
        {isRunning ? (
          <span className="text-muted-foreground shrink-0 text-xs">en cours…</span>
        ) : null}
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 transition-transform duration-200",
            "group-data-[state=closed]/tool-call-trigger:-rotate-90",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-1">
        <ToolFallbackBody
          toolName={toolName}
          args={args}
          argsText={argsText}
          result={result}
        />
      </CollapsibleContent>
    </Collapsible>
  );
}
