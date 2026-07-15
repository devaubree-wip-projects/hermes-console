"use client"

import dynamic from "next/dynamic"

import { ChatPageLoading } from "@/components/shared/chat/chat-page-loading"

// ssr: false — the chat shell is entirely driven by the client-side runtime
// (thread state + client-fetched messages). Server-rendering it produces an
// empty tree that diverges from the populated client tree on a deep-link
// reload, causing hydration mismatches. There is no SEO value to SSR here, so
// render it client-only: SSR emits the loading skeleton, the client mounts the
// shell after first paint.
const XuluxChatShell = dynamic(
  () =>
    import("@/components/shared/chat/chat-shell").then(
      (mod) => mod.XuluxChatShell,
    ),
  {
    ssr: false,
    loading: () => <ChatPageLoading />,
  },
)

export function ChatPageClient() {
  return <XuluxChatShell />
}
