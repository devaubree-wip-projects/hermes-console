"use client";

import { memo } from "react";
import { TextMessagePartProvider } from "@assistant-ui/react";
import {
  MarkdownTextPrimitive,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/components/shared/chat/assistant-ui/markdown-text";

export const ToolMarkdown = memo(function ToolMarkdown({
  text,
}: {
  text: string;
}) {
  return (
    <TextMessagePartProvider text={text} isRunning={false}>
      <MarkdownTextPrimitive
        remarkPlugins={[remarkGfm]}
        className="aui-md text-sm leading-relaxed"
        components={markdownComponents}
        smooth={false}
      />
    </TextMessagePartProvider>
  );
});
