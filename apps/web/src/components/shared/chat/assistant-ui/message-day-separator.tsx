"use client";

import { useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import { chatCopy } from "@/components/shared/chat/constants/chat-copy";
import {
  Marker,
  MarkerContent,
  MarkerSeparatorContent,
} from "@/components/shared/chat/ui/marker";

const dayFormatter = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayLabel(date: Date) {
  const today = startOfDay(new Date());
  const target = startOfDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return chatCopy.today;
  if (diffDays === 1) return chatCopy.yesterday;
  return dayFormatter.format(date);
}

export function MessageDaySeparator() {
  const label = useAuiState((s) => {
    const createdAt = s.message.createdAt;
    if (!createdAt) return null;
    const currentDay = dayLabel(createdAt);
    const index = s.thread.messages.findIndex((message) => message.id === s.message.id);
    if (index <= 0) return currentDay;
    const previous = s.thread.messages[index - 1]?.createdAt;
    if (!previous) return currentDay;
    return dayLabel(previous) === currentDay ? null : currentDay;
  });

  if (!label) return null;

  return (
    <Marker variant="separator" className="my-2">
      <MarkerSeparatorContent>{label}</MarkerSeparatorContent>
    </Marker>
  );
}

export function useMessageDayLabel(createdAt: Date | undefined) {
  return useMemo(() => (createdAt ? dayLabel(createdAt) : null), [createdAt]);
}
