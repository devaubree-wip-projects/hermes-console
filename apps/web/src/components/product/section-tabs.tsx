"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type TabItem = {
  value: string;
  label: string;
  count?: number;
  action?: ReactNode;
  content: ReactNode;
};

/**
 * Tab shell whose right-side action switches with the active tab. Server
 * components render the per-tab `content`/`action` and pass them in as props.
 */
export function SectionTabs({ tabs }: { tabs: TabItem[] }) {
  const [value, setValue] = useState(tabs[0]?.value ?? "");
  const active = tabs.find((tab) => tab.value === value) ?? tabs[0];

  return (
    <Tabs value={value} onValueChange={setValue} className="gap-6">
      <div className="flex items-center justify-between gap-4">
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
              {typeof tab.count === "number" ? (
                <span className="rounded-full bg-foreground/10 px-1.5 text-xs font-medium tabular-nums text-current">
                  {tab.count}
                </span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {active?.action ? <div className="shrink-0">{active.action}</div> : null}
      </div>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
