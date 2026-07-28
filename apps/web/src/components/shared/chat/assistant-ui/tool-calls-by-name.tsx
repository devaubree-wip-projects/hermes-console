"use client";

import {
  memo,
  useMemo,
  type FC,
} from "react";
import {
  MessagePrimitive,
  useAui,
  useAuiState,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { ToolFallbackDetailView } from "@/components/shared/chat/assistant-ui/tool-fallback";
import { toolDisplayLabel } from "@/components/shared/chat/constants/tool-labels";
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/shared/chat/assistant-ui/tool-group";

function ToolCallByIndex({
  index,
  collapsible,
}: {
  index: number;
  collapsible: boolean;
}) {
  const components = useMemo(
    () => ({
      tools: {
        Override: (props: ToolCallMessagePartProps) => (
          <ToolFallbackDetailView {...props} collapsible={collapsible} />
        ),
      },
    }),
    [collapsible],
  );

  return (
    <MessagePrimitive.PartByIndex
      index={index}
      components={components}
    />
  );
}

export type ToolCallsByNameProps = {
  indices: readonly number[];
  streaming?: boolean;
};

export const ToolCallsByName: FC<ToolCallsByNameProps> = memo(({
  indices,
  streaming = false,
}) => {
  const aui = useAui();
  const partsFingerprint = useAuiState((s) =>
    indices.map((index) => {
      const part = s.message.parts[index];
      if (part?.type !== "tool-call") return "";
      const resultText = typeof part.result === "string" ? part.result : "";
      return [
        index,
        part.toolName,
        part.status?.type ?? "",
        part.result === undefined ? "pending" : "done",
        part.argsText.length,
        resultText.length,
        // Cheap content signal so completed tools remount when payload arrives/changes.
        resultText.slice(0, 24),
        resultText.slice(-24),
      ].join(":");
    }).join("|"),
  );
  const groups = useMemo(() => {
    const parts = aui.message().getState().parts;
    const map = new Map<string, { indices: number[]; running: boolean }>();

    for (const index of indices) {
      const part = parts[index];
      if (part?.type !== "tool-call") continue;
      const name = part.toolName;
      const entry = map.get(name) ?? { indices: [], running: false };
      entry.indices.push(index);
      if (part.status?.type === "running" || part.result === undefined) {
        entry.running = true;
      }
      map.set(name, entry);
    }

    return Array.from(map.entries());
  }, [aui, indices, partsFingerprint]);

  return (
    <div data-slot="tool-calls-by-name" className="flex flex-col gap-1">
      {groups.map(([name, group]) => (
        <ToolGroupRoot
          key={name}
          variant="ghost"
          streaming={streaming || group.running}
        >
          <ToolGroupTrigger
            count={group.indices.length}
            label={toolDisplayLabel(name, group.indices.length)}
            active={streaming || group.running}
          />
          <ToolGroupContent>
            {group.indices.map((index) => (
              <ToolCallByIndex
                key={index}
                index={index}
                collapsible={group.indices.length > 1}
              />
            ))}
          </ToolGroupContent>
        </ToolGroupRoot>
      ))}
    </div>
  );
});

ToolCallsByName.displayName = "ToolCallsByName";
