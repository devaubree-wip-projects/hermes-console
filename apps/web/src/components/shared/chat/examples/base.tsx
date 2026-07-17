"use client";

import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/shared/chat/assistant-ui/attachment";
import { MarkdownText } from "@/components/shared/chat/assistant-ui/markdown-text";
import { DotMatrix } from "@/components/shared/chat/assistant-ui/dot-matrix";
import { MessageTiming } from "@/components/shared/chat/assistant-ui/message-timing";
import { ToolFallback } from "@/components/shared/chat/assistant-ui/tool-fallback";
import { ToolCallsByName } from "@/components/shared/chat/assistant-ui/tool-calls-by-name";
import { ToolApprovalBanner } from "@/components/shared/chat/assistant-ui/tool-approval-banner";
import {
  ArchivedThreadsButton,
  ThreadList,
} from "@/components/shared/chat/assistant-ui/thread-list";
import { TooltipIconButton } from "@/components/shared/chat/assistant-ui/tooltip-icon-button";
import { TelegramHandoffDialog } from "@/components/shared/chat/assistant-ui/telegram-handoff-dialog";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/shared/chat/assistant-ui/reasoning";
import { Button } from "@/components/shared/chat/ui/button";
import { cn } from "@/lib/utils";
import { useSessionMetricsStore } from "@/lib/shared/chat/session-metrics-store";
import {
  ComposerQuotePreview,
  QuoteBlock,
  SelectionToolbar,
} from "@/components/shared/chat/assistant-ui/quote";
import { ComposerTriggerPopover } from "@/components/shared/chat/assistant-ui/composer-trigger-popover";
import { DirectiveText } from "@/components/shared/chat/assistant-ui/directive-text";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  type AssistantState,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadListPrimitive,
  ThreadPrimitive,
  unstable_defaultDirectiveFormatter,
  unstable_useMentionAdapter,
  unstable_useSlashCommandAdapter,
  unstable_useLiveCompletionAdapter,
  useAui,
  useAuiState,
  type Unstable_SlashCommand,
} from "@assistant-ui/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BatteryChargingIcon,
  BotIcon,
  BrainIcon,
  ChartColumnIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloudSunIcon,
  CodeXmlIcon,
  CopyIcon,
  DiscIcon,
  DownloadIcon,
  FileTextIcon,
  FolderIcon,
  GaugeIcon,
  GitBranchIcon,
  GlobeIcon,
  HelpCircleIcon,
  LanguagesIcon,
  LightbulbIcon,
  MenuIcon,
  MicIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  PencilLineIcon,
  PlusIcon,
  PaperclipIcon,
  RefreshCwIcon,
  SettingsIcon,
  ShareIcon,
  SlashIcon,
  SquareIcon,
  SquarePenIcon,
  ShieldCheckIcon,
  ShieldAlertIcon,
  ZapIcon,
  WrenchIcon,
  XIcon,
} from "lucide-react";
import {
  LexicalComposerInput,
  type DirectiveChipProps,
} from "@assistant-ui/react-lexical";
import { toast } from "sonner";
import Link from "next/link";
import { useChatRoutes } from "@/components/shared/chat/chat-routes-context";
import { useState, type FC, type ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/shared/chat/ui/sheet";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shared/chat/ui/select";
import { ContextUsageIndicator } from "@/components/shared/chat/assistant-ui/context-usage-indicator";
import { ContextAlertWatcher } from "@/components/shared/chat/context-alert-watcher";
import {
  ModelSelector,
} from "@/components/shared/chat/assistant-ui/model-selector";
import { docsModelOptions } from "@/components/shared/chat/docs/assistant/docs-model-options";
import {
  DEFAULT_LLM_PROVIDER,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  getDefaultModelId,
  type LLMProvider,
  type ModelId,
  type ReasoningEffortId,
} from "@/components/shared/chat/constants/model";
import {
  getDefaultReasoningControlId,
  getReasoningControlConfig,
} from "@/components/shared/chat/constants/reasoning-config";
import {
  readLlmPreference,
  writeLlmPreference,
} from "@/lib/shared/chat/llm-preference";
import { useChatToolsStore } from "@/lib/shared/chat/chat-tools-store";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/chat/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  useHermesComposer,
  type HermesEffort,
  type HermesPermission,
} from "@/components/shared/chat/runtime/hermes-composer-context";

const Logo: FC = () => {
  const { activeAgentName } = useChatRoutes();

  return (
    <div className="flex min-w-0 items-center gap-2 px-2">
      <BotIcon className="text-muted-foreground size-5 shrink-0" />
      <span className="flex min-w-0 flex-col">
        <span className="text-foreground/90 truncate text-sm font-medium">
          {activeAgentName ?? "Agent"}
        </span>
        <span className="text-muted-foreground text-[11px] leading-tight">
          Sessions
        </span>
      </span>
    </div>
  );
};

const Sidebar: FC<{ collapsed?: boolean }> = ({ collapsed }) => {
  const { activeAgentName, baseWithAgent } = useChatRoutes();

  return (
    <aside
      className={cn(
        "flex h-full flex-col overflow-hidden transition-all duration-200",
        collapsed ? "w-12" : "w-65",
      )}
    >
      <div
        className={cn(
          "mt-2 flex h-12 shrink-0 items-center transition-[padding] duration-200",
          collapsed ? "px-3.5" : "px-6",
        )}
      >
        <BotIcon className="text-muted-foreground size-5 shrink-0" />
        <span
          className={cn(
            "ml-2 flex min-w-0 flex-col whitespace-nowrap transition-opacity duration-200",
            collapsed && "opacity-0",
          )}
        >
          <span className="text-foreground/90 truncate text-sm font-medium">
            {activeAgentName ?? "Agent"}
          </span>
          <span className="text-muted-foreground text-[11px] leading-tight">
            Sessions
          </span>
        </span>
      </div>
      {collapsed ? (
        <ThreadListPrimitive.New asChild>
          <TooltipIconButton
            tooltip="Nouvelle session"
            side="right"
            variant="ghost"
            size="icon"
            className="mt-1 ml-2 size-8 cursor-pointer"
            onClick={() => window.history.pushState(null, "", baseWithAgent)}
          >
            <PlusIcon className="size-4" />
          </TooltipIconButton>
        </ThreadListPrimitive.New>
      ) : (
        <div className="flex w-65 flex-1 flex-col overflow-hidden">
          <div className="relative flex-1 overflow-y-auto p-3">
            <ThreadList />
          </div>
          <ArchivedThreadsButton />
        </div>
      )}
    </aside>
  );
};

const MobileSidebar: FC = () => {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 md:hidden"
        >
          <MenuIcon className="size-4" />
          <span className="sr-only">Toggle menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="flex w-70 flex-col p-0">
        <div className="flex h-12 shrink-0 items-center px-4">
          <Logo />
        </div>
        <div className="relative flex-1 overflow-y-auto p-3">
          <ThreadList />
        </div>
        <ArchivedThreadsButton />
      </SheetContent>
    </Sheet>
  );
};

const ModelPicker: FC<{
  provider: LLMProvider;
  modelId: ModelId;
  onModelIdChange: (modelId: ModelId) => void;
  effort: ReasoningEffortId;
  onEffortChange: (effort: ReasoningEffortId) => void;
}> = ({ provider, modelId, onModelIdChange, effort, onEffortChange }) => {
  const models = docsModelOptions(provider);

  return (
    <ModelSelector
      key={provider}
      provider={provider}
      models={models}
      value={modelId}
      onValueChange={(next) => onModelIdChange(next as ModelId)}
      effort={effort}
      onEffortChange={(next) => onEffortChange(next as ReasoningEffortId)}
      showEffortSelector={false}
      showEffortValue={false}
      variant="ghost"
      size="sm"
      className="h-7 rounded-full px-2.5"
    />
  );
};

const ReasoningIntensityPicker: FC<{
  provider: string;
  modelId: string;
  supportsReasoning: boolean;
  value: HermesEffort;
  onValueChange: (value: HermesEffort) => void;
}> = ({ provider, modelId, supportsReasoning, value, onValueChange }) => {
  const [open, setOpen] = useState(false);
  const config = getReasoningControlConfig(
    provider,
    modelId,
    supportsReasoning,
  );

  if (!config) return null;

  const selected = config.options.find((option) => option.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-slot="reasoning-effort-trigger"
          data-reasoning-label={config.label}
          className="text-muted-foreground hover:text-foreground h-7 gap-1.5 rounded-full px-2.5 text-xs"
          aria-label="Select effort"
        >
          <BrainIcon className="size-3.5" />
          <span className="hidden sm:inline">{config.label}</span>
          <span className="text-foreground font-medium">
            {selected?.name ?? value}
          </span>
          <ChevronDownIcon className="size-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="reasoning-effort-content"
        align="start"
        sideOffset={6}
        className="w-52 rounded-xl p-1.5"
      >
        <div className="flex flex-col gap-1">
          {config.options.map((option) => {
            const isSelected = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                data-slot="reasoning-effort-item"
                data-state={isSelected ? "checked" : "unchecked"}
                title={option.description}
                className={cn(
                  "hover:bg-accent hover:text-accent-foreground flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm outline-none transition-colors",
                  isSelected && "bg-accent text-accent-foreground font-medium",
                )}
                onClick={() => {
                  onValueChange(option.id);
                  setOpen(false);
                }}
              >
                <span className="flex min-w-0 flex-col">
                  <span>{option.name}</span>
                  {option.description ? (
                    <span className="text-muted-foreground text-[11px] leading-tight font-normal">
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {isSelected && <CheckIcon className="size-4 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const ThreadTitle: FC = () => {
  const title = useAuiState(
    (s) =>
      s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.title,
  );

  return (
    <span className="min-w-0 truncate text-sm font-medium">
      {title ?? "Nouvelle session"}
    </span>
  );
};

const LLMProviderSelect: FC<{
  value: LLMProvider;
  onValueChange: (provider: LLMProvider) => void;
}> = ({ value, onValueChange }) => {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next as LLMProvider)}
    >
      <SelectTrigger
        data-slot="llm-provider-select-trigger"
        size="sm"
        className="h-8 rounded-full"
        aria-label="Select LLM provider"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectGroup>
          {LLM_PROVIDERS.map((provider) => (
            <SelectItem key={provider} value={provider}>
              <span className="flex items-center gap-2">
                {(() => {
                  const Icon = LLMProviderIconMap[provider];
                  return <Icon className="size-4" />;
                })()}
                {LLM_PROVIDER_LABELS[provider]}
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

const OpenAIProviderIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className={className}
    fill="currentColor"
    fillRule="evenodd"
  >
    <path d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z" />
  </svg>
);

const ClaudeProviderIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className={className}
    fill="currentColor"
    fillRule="evenodd"
  >
    <path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" />
  </svg>
);

const OllamaProviderIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className={className}
    fill="currentColor"
    fillRule="evenodd"
  >
    <path d="M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z" />
  </svg>
);

const GeminiProviderIcon: FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className={className}
    fill="currentColor"
    fillRule="evenodd"
  >
    <path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" />
  </svg>
);

const LLMProviderIconMap = {
  claude: ClaudeProviderIcon,
  openai: OpenAIProviderIcon,
  ollama: OllamaProviderIcon,
  gemini: GeminiProviderIcon,
} satisfies Record<LLMProvider, FC<{ className?: string }>>;

const APPROVAL_CHIP_LABEL: Record<string, string> = {
  manual: "Approbation manuelle",
  smart: "Approbation intelligente",
  off: "Validations désactivées (YOLO)",
};

// Live read-only view of the agent's real machine access for the active
// session. Reads composerState.info (already streamed over the bridge) — no
// extra network. Hidden until a working directory is known.
const AccessChip: FC = () => {
  const { info } = useHermesComposer();
  const cwd = info?.cwd;
  if (!cwd) return null;

  const base = cwd.replace(/\/+$/, "").split("/").filter(Boolean).at(-1) ?? cwd;
  const mode = info?.yolo ? "off" : info?.approval_mode ?? "smart";
  const yolo = mode === "off";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Accès machine de l’agent"
          className="inline-flex h-8 max-w-[40vw] items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground transition-colors hover:bg-muted sm:max-w-[16rem]"
        >
          <FolderIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate font-mono">{base}</span>
          {yolo ? (
            <ShieldAlertIcon className="size-3.5 shrink-0 text-destructive" aria-hidden />
          ) : (
            <ShieldCheckIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 rounded-xl p-3 text-sm">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Répertoire de travail
          </div>
          <code className="block break-all font-mono text-xs">{cwd}</code>
        </div>
        {info?.branch ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <GitBranchIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="font-mono">{info.branch}</span>
          </div>
        ) : null}
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs",
            yolo ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {yolo ? (
            <ShieldAlertIcon className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden />
          )}
          <span>{APPROVAL_CHIP_LABEL[mode] ?? mode}</span>
        </div>
      </PopoverContent>
    </Popover>
  );
};

const Header: FC<{
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}> = ({
  sidebarCollapsed,
  onToggleSidebar,
}) => {
  const { settingsUrl } = useChatRoutes();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-4">
      <MobileSidebar />
      <TooltipIconButton
        variant="ghost"
        size="icon"
        tooltip={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        side="bottom"
        onClick={onToggleSidebar}
        className="hidden size-8 md:flex"
      >
        <PanelLeftIcon className="size-4" />
      </TooltipIconButton>
      <ThreadTitle />
      <div className="ml-auto flex items-center gap-1.5">
        <AccessChip />
        <TelegramHandoffDialog />
        {settingsUrl ? (
        <Link
          href={settingsUrl}
          aria-label="Chat settings"
          title="Chat settings"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-current transition-colors hover:bg-muted"
        >
          <SettingsIcon className="size-4" />
        </Link>
        ) : null}
        <TooltipIconButton
          variant="ghost"
          size="icon"
          tooltip="Share"
          side="bottom"
          disabled
          className="size-8"
        >
          <ShareIcon className="size-4" />
        </TooltipIconButton>
      </div>
    </header>
  );
};

// The runtime alone cannot distinguish a new chat from a deep link while the
// session list is loading. Route intent keeps existing threads docked from the
// first client render instead of briefly centering the composer.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

const Thread: FC = () => {
  const runtimeShowsNewChat = useAuiState(isNewChatView);
  const { currentThreadId } = useChatRoutes();
  const isNewConversation = !currentThreadId && runtimeShowsNewChat;
  const autoScroll = useChatToolsStore((s) => s.autoScroll);
  const compactMessages = useChatToolsStore((s) => s.compactMessages);
  const wrapCode = useChatToolsStore((s) => s.wrapCode);

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root bg-background @container flex h-full flex-col"
      style={{
        ["--thread-max-width" as string]: "44rem",
        ["--composer-bg" as string]:
          "color-mix(in oklab, var(--color-muted) 30%, var(--color-background))",
        ["--composer-radius" as string]: "1.5rem",
        ["--composer-padding" as string]: "8px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        autoScroll={autoScroll}
        scrollToBottomOnInitialize
        scrollToBottomOnThreadSwitch
        data-slot="aui_thread-viewport"
        className={cn(
          "relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth px-4 pt-4",
          isNewConversation && "justify-center",
        )}
      >
        {isNewConversation ? <ThreadWelcome /> : null}

        <div
          data-slot="aui_message-group"
          data-wrap-code={wrapCode ? "true" : "false"}
          className={cn(
            "mb-14 flex flex-col empty:hidden",
            compactMessages ? "gap-y-3" : "gap-y-6",
          )}
        >
          <ThreadPrimitive.Messages>
            {({ message }) => {
              if (message.composer.isEditing) return <EditComposer />;
              if (message.role === "user") return <UserMessage />;
              return <AssistantMessage />;
            }}
          </ThreadPrimitive.Messages>
        </div>

        <ThreadPrimitive.ViewportFooter
          className={cn(
            "aui-thread-viewport-footer bg-background mx-auto flex w-full max-w-3xl flex-col gap-4 overflow-visible pb-0 md:pb-2",
            !isNewConversation && "sticky bottom-0 mt-auto rounded-t-(--composer-radius)",
          )}
        >
          <ThreadScrollToBottom />
          <Composer />
          {isNewConversation ? (
            <div className="aui-thread-welcome-suggestions-shell min-h-19">
              <AuiIf condition={(s) => s.composer.isEmpty}>
                <ThreadSuggestions />
              </AuiIf>
            </div>
          ) : null}
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>

      <SelectionToolbar />
    </ThreadPrimitive.Root>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom asChild>
      <TooltipIconButton
        tooltip="Scroll to bottom"
        variant="outline"
        className="aui-thread-scroll-to-bottom dark:border-border dark:bg-background dark:hover:bg-accent absolute -top-12 z-10 size-8 self-center rounded-full p-0 disabled:invisible"
      >
        <ArrowDownIcon />
      </TooltipIconButton>
    </ThreadPrimitive.ScrollToBottom>
  );
};

const ThreadWelcome: FC = () => {
  const mechanicMode = useChatToolsStore((s) => s.mechanicMode);
  return (
    <div className="aui-thread-welcome-root mx-auto mb-6 flex w-full max-w-(--thread-max-width) flex-col items-center px-4 text-center">
      <h1 className="aui-thread-welcome-message-inner fade-in slide-in-from-bottom-1 animate-in fill-mode-both text-2xl font-semibold duration-200">
        {mechanicMode
          ? "Un souci mécanique ? Décrivez-le-moi."
          : "How can I help you today?"}
      </h1>
    </div>
  );
};

type SuggestionGroup = {
  label: string;
  icon: ReactNode;
  options: { label: string; prompt: string }[];
};

const GENERIC_SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    label: "Weather",
    icon: <CloudSunIcon />,
    options: [
      {
        label: "in San Francisco",
        prompt: "What's the weather in San Francisco?",
      },
      { label: "in Singapore", prompt: "What's the weather in Singapore?" },
      { label: "in Tokyo", prompt: "What's the weather in Tokyo?" },
      { label: "in London", prompt: "What's the weather in London?" },
    ],
  },
  {
    label: "Code",
    icon: <CodeXmlIcon />,
    options: [
      {
        label: "explain React hooks",
        prompt: "Explain React hooks like useState and useEffect",
      },
      {
        label: "write a debounce function",
        prompt: "Write a debounce function in TypeScript",
      },
      {
        label: "review a useEffect cleanup",
        prompt: "Show me the right way to clean up a subscription in useEffect",
      },
    ],
  },
  {
    label: "Write",
    icon: <PencilLineIcon />,
    options: [
      {
        label: "a product announcement",
        prompt: "Draft a short product announcement for a new dark mode",
      },
      {
        label: "release notes",
        prompt:
          "Write release notes for a bugfix release of a React component library",
      },
      {
        label: "a PR description",
        prompt:
          "Write a pull request description for a change that adds keyboard shortcuts",
      },
    ],
  },
  {
    label: "Analyze",
    icon: <ChartColumnIcon />,
    options: [
      {
        label: "React vs Vue vs Svelte",
        prompt: "Compare React, Vue, and Svelte in a table",
      },
      {
        label: "GDP of US, China, Japan",
        prompt:
          "Compare the GDP of the United States, China, and Japan in a table",
      },
      {
        label: "pros and cons of SSR",
        prompt: "What are the pros and cons of server-side rendering?",
      },
    ],
  },
  {
    label: "Brainstorm",
    icon: <LightbulbIcon />,
    options: [
      {
        label: "side project ideas",
        prompt: "Brainstorm five side project ideas for a React developer",
      },
      {
        label: "names for a dev tool",
        prompt: "Brainstorm names for a developer tools startup",
      },
      {
        label: "talk topics",
        prompt: "Brainstorm talk topics for a React meetup",
      },
    ],
  },
];

const MECHANIC_SUGGESTION_GROUPS: SuggestionGroup[] = [
  {
    label: "Démarrage",
    icon: <BatteryChargingIcon />,
    options: [
      {
        label: "batterie à plat",
        prompt: "Ma batterie est à plat, comment la changer moi-même ?",
      },
      {
        label: "le moteur ne démarre pas",
        prompt: "Ma voiture ne démarre pas ce matin, aide-moi à diagnostiquer.",
      },
      {
        label: "démarrer avec des câbles",
        prompt: "Comment démarrer ma voiture avec des câbles sans rien griller ?",
      },
    ],
  },
  {
    label: "Entretien",
    icon: <WrenchIcon />,
    options: [
      {
        label: "changer une bougie",
        prompt: "Je veux changer mes bougies d'allumage moi-même.",
      },
      {
        label: "faire la vidange",
        prompt: "Comment faire la vidange d'huile moteur moi-même ?",
      },
      {
        label: "remplacer le filtre à air",
        prompt: "Comment remplacer le filtre à air de mon moteur ?",
      },
    ],
  },
  {
    label: "Freinage",
    icon: <DiscIcon />,
    options: [
      {
        label: "bruit au freinage",
        prompt: "J'entends un bruit métallique quand je freine, c'est grave ?",
      },
      {
        label: "changer les plaquettes",
        prompt: "Je veux changer mes plaquettes de frein moi-même.",
      },
      {
        label: "pédale de frein molle",
        prompt: "Ma pédale de frein est molle, que faut-il vérifier ?",
      },
    ],
  },
  {
    label: "Diagnostic",
    icon: <GaugeIcon />,
    options: [
      {
        label: "voyant moteur allumé",
        prompt: "Mon voyant moteur est allumé, comment savoir ce que c'est ?",
      },
      {
        label: "vibrations au volant",
        prompt: "Mon volant vibre à haute vitesse, quelles causes possibles ?",
      },
      {
        label: "fuite sous la voiture",
        prompt: "Il y a une flaque sous ma voiture, comment identifier la fuite ?",
      },
    ],
  },
];

const suggestionChipClass =
  "aui-thread-welcome-suggestion text-foreground hover:bg-muted border-border/60 h-auto gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-normal whitespace-nowrap transition-colors [&_svg]:size-4";

const ThreadSuggestions: FC = () => {
  const aui = useAui();
  const mechanicMode = useChatToolsStore((s) => s.mechanicMode);
  const suggestionGroups = mechanicMode
    ? MECHANIC_SUGGESTION_GROUPS
    : GENERIC_SUGGESTION_GROUPS;
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  const expandedGroup = suggestionGroups.find(
    (group) => group.label === expandedLabel,
  );

  const sendPrompt = (prompt: string) => {
    if (aui.thread().getState().isRunning) return;
    aui.thread().append({
      content: [{ type: "text", text: prompt }],
      runConfig: aui.composer().getState().runConfig,
    });
  };

  return (
    <div className="aui-thread-welcome-suggestions flex w-full flex-col gap-2 px-4">
      <div className="w-full scrollbar-none overflow-x-auto">
        <div className="mx-auto flex w-max items-center gap-2">
          {suggestionGroups.map((group) => (
            <Button
              key={group.label}
              variant="ghost"
              className={cn(
                suggestionChipClass,
                group.label === expandedLabel && "bg-muted",
              )}
              onClick={() =>
                setExpandedLabel(
                  group.label === expandedLabel ? null : group.label,
                )
              }
            >
              {group.icon}
              {group.label}
            </Button>
          ))}
        </div>
      </div>
      {expandedGroup && (
        <div
          key={expandedGroup.label}
          className="fade-in slide-in-from-top-1 animate-in w-full scrollbar-none overflow-x-auto duration-200"
        >
          <div className="mx-auto flex w-max items-center gap-2">
            {expandedGroup.options.map((option) => (
              <Button
                key={option.label}
                variant="ghost"
                className={suggestionChipClass}
                onClick={() => sendPrompt(option.prompt)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const slashCommands: readonly Unstable_SlashCommand[] = [
  {
    id: "canvas",
    description: "Draft a document in the canvas panel",
    icon: "SquarePen",
    // Directive-only, like /search: the "/canvas" text stays inline in the
    // user message; the model is nudged (ChatSystemInstructions) to call the
    // canvas tool, and the panel opens when that tool call streams back.
    execute: () => {},
  },
  {
    id: "summarize",
    description: "Summarize the conversation",
    icon: "FileText",
    execute: () => console.log("[base example] /summarize invoked"),
  },
  {
    id: "translate",
    description: "Translate text to another language",
    icon: "Languages",
    execute: () => console.log("[base example] /translate invoked"),
  },
  {
    id: "search",
    description: "Search the live web (any LLM, via the web_search tool)",
    icon: "Globe",
    // The directive is sent inline with the message; the model then calls the
    // provider-agnostic web_search tool. No client-side action required here.
    execute: () => {},
  },
  {
    id: "help",
    description: "List available commands",
    icon: "HelpCircle",
    execute: () => console.log("[base example] /help invoked"),
  },
];

const slashIconMap: Record<string, FC<{ className?: string }>> = {
  SquarePen: SquarePenIcon,
  FileText: FileTextIcon,
  Languages: LanguagesIcon,
  Globe: GlobeIcon,
  HelpCircle: HelpCircleIcon,
};

function DirectiveChip(props: DirectiveChipProps) {
  const { directiveId, directiveType, label } = props;
  if (directiveType === "command") return null;
  const showWrench = directiveType !== "command";
  return (
    <span
      className="aui-directive-chip"
      data-directive-type={directiveType}
      data-directive-id={directiveId}
    >
      {showWrench && (
        <span className="aui-directive-chip-icon">
          <WrenchIcon className="size-3" />
        </span>
      )}
      <span className="aui-directive-chip-label">{label}</span>
    </span>
  );
}

function ComposerCommandBadges() {
  const aui = useAui();
  const composerText = useAuiState((state) => state.composer.text);
  const commands = unstable_defaultDirectiveFormatter
    .parse(composerText)
    .flatMap((segment) => (
      segment.kind === "mention" && segment.type === "command"
        ? [segment]
        : []
    ));

  const removeCommand = (command: (typeof commands)[number]) => {
    const serialized = unstable_defaultDirectiveFormatter.serialize({
      id: command.id,
      type: command.type,
      label: command.label,
    });
    const index = composerText.indexOf(serialized);
    if (index < 0) return;
    const before = composerText.slice(0, index).trimEnd();
    const after = composerText.slice(index + serialized.length).trimStart();
    aui.composer().setText([before, after].filter(Boolean).join(" "));
  };

  if (commands.length === 0) return null;

  return commands.map((command, index) => (
    <span
      key={`${command.id}-${index}`}
      data-slot="aui-command-badge"
      className="inline-flex h-6 max-w-48 items-center gap-1 rounded-md border bg-muted px-2 text-xs font-medium text-foreground"
    >
      <SlashIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{command.label}</span>
      <button
        type="button"
        aria-label={`Retirer ${command.label}`}
        className="-mr-1 inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        onClick={() => removeCommand(command)}
      >
        <XIcon className="size-3" aria-hidden />
      </button>
    </span>
  ));
}

const Composer: FC = () => {
  const hermes = useHermesComposer();
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const sessionMetrics = useSessionMetricsStore((state) => (
    remoteId ? state.sessions[remoteId] : undefined
  ));
  const mention = unstable_useLiveCompletionAdapter({
    fetcher: async (query) => (await hermes.completePath(query)).map((item) => ({
      id: item.id,
      type: "mention",
      label: item.label,
      description: item.description,
      metadata: { icon: "FileText" },
    })),
  });
  const slash = unstable_useLiveCompletionAdapter({
    fetcher: async (query) => (await hermes.completeSlash(query)).map((item) => ({
      id: item.id,
      type: "command",
      label: item.id === "agent-create" ? item.label : item.label.replace(/^\//, ""),
      description: item.description,
      metadata: { icon: "Slash" },
    })),
  });
  const selectedModel = hermes.models.find(
    (item) => item.provider === hermes.provider && item.model === hermes.model,
  );
  const providerModels = hermes.models.filter(
    (item) => item.provider === hermes.provider,
  );
  const providerLabel = (
    providerModels[0]?.providerLabel ?? hermes.provider
  ).replaceAll("-", " ");
  const modelLabel = hermes.model
    ? hermes.model.split("/").at(-1)?.replaceAll("-", " ")
    : "Select model";
  const usage = hermes.info?.usage;
  const sharedContext = sessionMetrics?.context
    ?? sessionMetrics?.persistedContext
    ?? sessionMetrics?.estimatedContext;
  const contextUsed = sharedContext?.usedTokens ?? usage?.context_used ?? 0;
  const contextMax = sharedContext?.maxTokens ?? usage?.context_max ?? 0;
  const usagePercent = sharedContext
    ? sharedContext.percent / 100
    : Math.min(
        1,
        Math.max(0, (usage?.context_percent ?? 0) > 1
          ? (usage?.context_percent ?? 0) / 100
          : (usage?.context_percent ?? 0)),
      );
  const run = (promise: Promise<void>) => {
    void promise.catch((error) => toast.error("Hermes", { description: String(error) }));
  };

  return (
    <ComposerPrimitive.Unstable_TriggerPopoverRoot>
      <ComposerPrimitive.Root
        data-plan-mode={hermes.planMode || undefined}
        className="aui-composer-root relative mx-auto flex w-full max-w-3xl flex-col px-4 pt-2 pb-4"
      >
        {hermes.pendingApproval ? (
          <ToolApprovalBanner
            className="mb-2"
            request={hermes.pendingApproval}
            onRespond={hermes.respondApproval}
          />
        ) : null}
        <div className="rounded-xl bg-muted p-1 shadow-sm">
          <div
            data-slot="aui_composer-shell"
            className="rounded-lg border border-transparent bg-card shadow-sm transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20"
          >
            <div className="px-4 pt-3 empty:hidden">
              <ComposerAttachments />
            </div>
            <LexicalComposerInput
              ref={(node) => {
                node?.querySelector(".aui-lexical-input")?.setAttribute("aria-label", "Message to Hermes");
              }}
              directiveChip={DirectiveChip}
              placeholder="Ask anything, @ to add files, / for commands"
              className="aui-composer-input relative block min-h-14 max-h-40 w-full resize-none overflow-y-auto bg-transparent px-4 pt-4 pb-2 text-sm leading-relaxed outline-none [&_.aui-lexical-input]:min-h-lh [&_.aui-lexical-input]:outline-none [&_.aui-lexical-input>p]:m-0 [&_.aui-lexical-placeholder]:pointer-events-none [&_.aui-lexical-placeholder]:absolute [&_.aui-lexical-placeholder]:inset-x-0 [&_.aui-lexical-placeholder]:top-0 [&_.aui-lexical-placeholder]:truncate [&_.aui-lexical-placeholder]:px-4 [&_.aui-lexical-placeholder]:pt-4 [&_.aui-lexical-placeholder]:text-sm [&_.aui-lexical-placeholder]:leading-relaxed [&_.aui-lexical-placeholder]:text-muted-foreground"
            />

            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex min-w-0 items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label="Add context or change mode"
                      className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      <PlusIcon className="size-4" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="w-56 rounded-xl border-0 p-1 shadow-md">
                    <ComposerPrimitive.AddAttachment asChild>
                      <button type="button" className="hover:bg-secondary flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm">
                        <PaperclipIcon className="text-muted-foreground size-4" />
                        Attach files
                      </button>
                    </ComposerPrimitive.AddAttachment>
                    <div className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-sm">
                      <FileTextIcon className="text-muted-foreground size-4" />
                      <label htmlFor="composer-plan-mode" className="flex-1 cursor-pointer text-left">
                        Plan mode
                      </label>
                      <Switch
                        id="composer-plan-mode"
                        size="sm"
                        aria-label="Plan mode"
                        checked={hermes.planMode}
                        onCheckedChange={hermes.setPlanMode}
                        className="data-checked:bg-[oklch(0.62_0.24_255)]"
                      />
                    </div>
                    {hermes.webSearchAvailable ? (
                      <div className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-sm">
                        <GlobeIcon className="text-muted-foreground size-4" />
                        <label htmlFor="composer-web-search" className="flex-1 cursor-pointer text-left">
                          Recherche web
                        </label>
                        <Switch
                          id="composer-web-search"
                          size="sm"
                          aria-label="Recherche web"
                          checked={hermes.webSearch}
                          onCheckedChange={hermes.setWebSearch}
                          className="data-checked:bg-[oklch(0.62_0.24_255)]"
                        />
                      </div>
                    ) : null}
                    <div className="my-1 h-px bg-border" />
                    <div
                      className="relative"
                      data-slot="aui-speed-menu"
                      onMouseEnter={() => setSpeedMenuOpen(true)}
                      onMouseLeave={() => setSpeedMenuOpen(false)}
                      onFocus={() => setSpeedMenuOpen(true)}
                      onBlur={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) {
                          setSpeedMenuOpen(false);
                        }
                      }}
                    >
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={speedMenuOpen}
                        className="hover:bg-secondary focus-visible:bg-secondary flex h-8 w-full cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none"
                      >
                        <ZapIcon className="text-muted-foreground size-4" />
                        <span className="flex-1 text-left">Speed</span>
                        <ChevronRightIcon className="text-muted-foreground size-4" />
                      </button>
                      <div
                        role="menu"
                        aria-label="Speed options"
                        className={cn(
                          "absolute bottom-0 left-full z-50 w-36 pl-1 transition-opacity duration-150",
                          speedMenuOpen
                            ? "visible opacity-100"
                            : "pointer-events-none invisible opacity-0",
                        )}
                      >
                        <div className="rounded-xl bg-popover p-1 text-popover-foreground shadow-md">
                          {([false, true] as const).map((fast) => (
                            <button
                              key={String(fast)}
                              type="button"
                              role="menuitemradio"
                              aria-checked={hermes.fast === fast}
                              disabled={fast && selectedModel?.supportsFast === false}
                              onClick={() => {
                                run(hermes.setFast(remoteId, fast));
                                setSpeedMenuOpen(false);
                              }}
                              className="hover:bg-secondary focus-visible:bg-secondary flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-45"
                            >
                              <span className="flex-1 text-left">{fast ? "Fast" : "Standard"}</span>
                              {hermes.fast === fast && <CheckIcon className="text-primary size-4" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
                <ComposerCommandBadges />
                {hermes.webSearch && (
                  <span
                    role="status"
                    data-slot="aui-web-search-badge"
                    className="inline-flex h-6 shrink-0 items-center rounded-full bg-[oklch(0.62_0.24_255)] px-2.5 text-xs font-medium text-[oklch(0.985_0.003_255)]"
                  >
                    Recherche web
                  </span>
                )}
              </div>

              <ComposerAction />
            </div>

            <div className="flex min-h-9 items-center justify-between gap-2 border-t border-border/60 px-2 py-1">
              <div className="flex min-w-0 items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label="Select model" className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground inline-flex h-7 max-w-48 cursor-pointer items-center gap-1 rounded-md px-2.5 text-xs capitalize">
                      <BotIcon className="size-3.5 shrink-0" />
                      <span className="truncate">{modelLabel}</span>
                      <ChevronDownIcon className="size-3 shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="start" className="max-h-72 w-64 overflow-y-auto rounded-xl border-0 p-1 shadow-md">
                    <div className="text-muted-foreground sticky top-0 bg-popover px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
                      {providerLabel}
                    </div>
                    {providerModels.map((item) => (
                      <button
                        key={`${item.provider}:${item.model}`}
                        type="button"
                        onClick={() => run(hermes.setModel(remoteId, item.model))}
                        className="hover:bg-secondary flex min-h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm"
                      >
                        <BotIcon className="text-muted-foreground size-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate font-medium">{item.model}</span>
                        {item.model === hermes.model && <CheckIcon className="text-primary size-4" />}
                      </button>
                    ))}
                    {hermes.ready && providerModels.length === 0 && (
                      <p className="text-muted-foreground px-2 py-3 text-xs">
                        Aucun modèle disponible pour ce fournisseur.
                      </p>
                    )}
                  </PopoverContent>
                </Popover>

                <ReasoningIntensityPicker
                  provider={hermes.provider}
                  modelId={hermes.model}
                  supportsReasoning={selectedModel?.supportsReasoning ?? true}
                  value={hermes.effort}
                  onValueChange={(effort) => run(hermes.setEffort(remoteId, effort))}
                />
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label="Select permissions" className="text-muted-foreground hover:bg-foreground/5 hover:text-foreground inline-flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-xs capitalize">
                      <ShieldCheckIcon className="size-3.5" />
                      <span className="hidden sm:inline">{hermes.permission}</span>
                      <ChevronDownIcon className="size-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent side="top" align="end" className="w-56 rounded-xl border-0 p-1 shadow-md">
                    <p className="text-muted-foreground px-2 py-1.5 text-[11px]">Smart and Manual update the Hermes profile. Bypass only affects this session.</p>
                    {(["smart", "manual", "bypass"] as HermesPermission[]).map((permission) => (
                      <button
                        key={permission}
                        type="button"
                        onClick={() => {
                          if (permission === "bypass" && !window.confirm("Bypass Hermes approvals for this session?")) return;
                          run(hermes.setPermission(remoteId, permission));
                        }}
                        className="hover:bg-secondary flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-sm capitalize"
                      >
                        <ShieldCheckIcon className="text-muted-foreground size-4" />
                        <span className="flex-1 text-left">{permission}</span>
                        {hermes.permission === permission && <CheckIcon className="text-primary size-4" />}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                {hermes.planMode && <span className="text-primary hidden rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium sm:inline">Plan</span>}
                <ContextUsageIndicator
                  usedTokens={contextUsed}
                  contextWindow={contextMax}
                  percent={usagePercent}
                />
              </div>
            </div>
          </div>
        </div>

        <ComposerTriggerPopover char="@" adapter={mention.adapter} isLoading={mention.isLoading} directive={{}} />
        <ComposerTriggerPopover char="/" adapter={slash.adapter} isLoading={slash.isLoading} directive={{}} emptyItemsLabel="No matching commands" />
      </ComposerPrimitive.Root>
    </ComposerPrimitive.Unstable_TriggerPopoverRoot>
  );
};

const MechanicModeToggle: FC = () => {
  const mechanicMode = useChatToolsStore((s) => s.mechanicMode);
  const setMechanicMode = useChatToolsStore((s) => s.setMechanicMode);
  return (
    <TooltipIconButton
      tooltip={
        mechanicMode
          ? "Agent Mécanique auto — activé"
          : "Agent Mécanique auto — désactivé"
      }
      side="bottom"
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setMechanicMode(!mechanicMode)}
      aria-pressed={mechanicMode}
      className={cn(
        "size-7 rounded-full",
        mechanicMode &&
          "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
      )}
    >
      <WrenchIcon className="size-4" />
    </TooltipIconButton>
  );
};

const ComposerAction: FC = () => {
  return (
    <div className="aui-composer-action-wrapper relative flex items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate asChild>
              <TooltipIconButton
                tooltip="Voice input"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-dictate size-8 cursor-pointer rounded-lg"
                aria-label="Start voice input"
              >
                <MicIcon className="aui-composer-dictate-icon size-4" />
              </TooltipIconButton>
            </ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation asChild>
              <TooltipIconButton
                tooltip="Stop dictation"
                side="bottom"
                type="button"
                variant="ghost"
                size="icon"
                className="aui-composer-stop-dictation text-destructive size-8 cursor-pointer rounded-lg"
                aria-label="Stop voice input"
              >
                <SquareIcon className="aui-composer-stop-dictation-icon size-3.5 animate-pulse fill-current" />
              </TooltipIconButton>
            </ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf condition={(s) => !s.thread.isRunning}>
          <ComposerPrimitive.Send asChild>
            <TooltipIconButton
              tooltip="Send message"
              side="bottom"
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-send size-8 cursor-pointer rounded-lg bg-cyan-600 text-white hover:bg-cyan-500"
              aria-label="Send message"
            >
              <ArrowUpIcon className="aui-composer-send-icon size-4.5" />
            </TooltipIconButton>
          </ComposerPrimitive.Send>
        </AuiIf>
        <AuiIf condition={(s) => s.thread.isRunning}>
          <ComposerPrimitive.Cancel asChild>
            <Button
              type="button"
              variant="default"
              size="icon"
              className="aui-composer-cancel size-8 cursor-pointer rounded-lg bg-cyan-600 text-white hover:bg-cyan-500"
              aria-label="Stop generating"
            >
              <SquareIcon className="aui-composer-cancel-icon size-3.5 fill-current" />
            </Button>
          </ComposerPrimitive.Cancel>
        </AuiIf>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root border-destructive bg-destructive/10 text-destructive dark:bg-destructive/5 mt-2 rounded-md border p-3 text-sm dark:text-red-200">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantRunIndicator: FC = () => {
  const show = useAuiState((s) => {
    if (s.message.status?.type !== "running") return false;
    const hasVisibleText = s.message.parts.some(
      (part) =>
        part.type === "text" &&
        "text" in part &&
        typeof part.text === "string" &&
        part.text.length > 0,
    );
    if (hasVisibleText) return false;
    const hasReasoning = s.message.parts.some(
      (part) =>
        part.type === "reasoning" &&
        "text" in part &&
        typeof part.text === "string" &&
        part.text.length > 0,
    );
    return !hasReasoning;
  });
  if (!show) return null;
  return (
    <span
      data-slot="aui_assistant-run-indicator"
      className="text-muted-foreground mb-2 inline-flex items-center align-middle"
      aria-label="En cours"
    >
      <DotMatrix state="connecting" aria-hidden />
    </span>
  );
};

const messageTimestampFormatter = new Intl.DateTimeFormat("fr-FR", {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Wall-clock time of the message (HH:MM), gated by the `showTimestamps`
 * preference. Reads `message.createdAt` from the assistant-ui state.
 */
const MessageTimestamp: FC<{ className?: string }> = ({ className }) => {
  const showTimestamps = useChatToolsStore((s) => s.showTimestamps);
  const createdAt = useAuiState((s) => s.message.createdAt);
  if (!showTimestamps || !createdAt) return null;

  return (
    <time
      dateTime={createdAt.toISOString()}
      data-slot="message-timestamp"
      className={cn(
        "text-muted-foreground text-xs tabular-nums",
        className,
      )}
    >
      {messageTimestampFormatter.format(createdAt)}
    </time>
  );
};

const AssistantMessage: FC = () => {
  // reserves space for action bar and compensates with `-mb` for consistent msg spacing
  // keeps hovered action bar from shifting layout (autohide doesn't support absolute positioning well)
  // for pt-[n] use -mb-[n + 6] & min-h-[n + 6] to preserve compensation
  const ACTION_BAR_PT = "pt-1.5";
  const ACTION_BAR_HEIGHT = `-mb-7.5 min-h-7.5 ${ACTION_BAR_PT}`;
  const showReasoning = useChatToolsStore((s) => s.showReasoning);
  const showToolCalls = useChatToolsStore((s) => s.showToolCalls);

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      className="fade-in slide-in-from-bottom-1 animate-in relative mx-auto w-full max-w-(--thread-max-width) duration-150"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-relaxed wrap-break-word"
      >
        <AssistantRunIndicator />
        <MessagePrimitive.GroupedParts
          indicator="never"
          groupBy={groupPartByType({
            reasoning: ["group-chainOfThought", "group-reasoning"],
            "tool-call": ["group-chainOfThought", "group-tool"],
            "standalone-tool-call": [],
          })}
        >
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-tool":
                if (!showToolCalls) return null;
                return (
                  <ToolCallsByName
                    indices={part.indices}
                    streaming={part.status.type === "running"}
                  />
                );
              case "group-reasoning": {
                if (!showReasoning) return null;
                const running = part.status.type === "running";
                return (
                  <ReasoningRoot streaming={running}>
                    <ReasoningTrigger active={running} />
                    <ReasoningContent aria-busy={running}>
                      <ReasoningText>{children}</ReasoningText>
                    </ReasoningContent>
                  </ReasoningRoot>
                );
              }
              case "text":
                return <MarkdownText />;
              case "reasoning":
                if (!showReasoning) return null;
                return <Reasoning {...part} />;
              case "tool-call":
                // When tool calls are hidden, still render deliverable tool UIs
                // (canvas, generated documents, web images) — only suppress the
                // generic ToolFallback execution card.
                if (!showToolCalls) return part.toolUI ?? null;
                return part.toolUI ?? <ToolFallback {...part} />;
              case "data":
                return part.dataRendererUI;
              default:
                return null;
            }
          }}
        </MessagePrimitive.GroupedParts>
        <MessageError />
      </div>

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ml-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
        <MessageTimestamp className="ml-auto pr-2" />
      </div>
    </MessagePrimitive.Root>
  );
};

const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-assistant-action-bar-root text-muted-foreground animate-in fade-in col-start-3 row-start-2 -ml-1 flex gap-1 duration-200"
    >
      <ActionBarPrimitive.Copy asChild>
        <TooltipIconButton
          tooltip="Copy"
          onClick={() => toast.success("Réponse copiée")}
        >
          <AuiIf condition={(s) => s.message.isCopied}>
            <CheckIcon className="animate-in zoom-in-50 fade-in duration-200 ease-out" />
          </AuiIf>
          <AuiIf condition={(s) => !s.message.isCopied}>
            <CopyIcon className="animate-in zoom-in-75 fade-in duration-150" />
          </AuiIf>
        </TooltipIconButton>
      </ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload asChild>
        <TooltipIconButton tooltip="Refresh">
          <RefreshCwIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger asChild>
          <TooltipIconButton
            tooltip="More"
            className="data-[state=open]:bg-accent"
          >
            <MoreHorizontalIcon />
          </TooltipIconButton>
        </ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover/95 text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5 shadow-lg backdrop-blur-sm"
        >
          <ActionBarPrimitive.ExportMarkdown asChild>
            <ActionBarMorePrimitive.Item
              onClick={() => toast.success("Conversation exportée en Markdown")}
              className="aui-action-bar-more-item hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm outline-none select-none"
            >
              <DownloadIcon className="size-4" />
              Export as Markdown
            </ActionBarMorePrimitive.Item>
          </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
      <MessageTiming />
    </ActionBarPrimitive.Root>
  );
};

const UserMessage: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      data-role="user"
      className="fade-in slide-in-from-bottom-1 animate-in mx-auto grid w-full max-w-(--thread-max-width) auto-rows-auto grid-cols-[minmax(72px,1fr)_auto] content-start gap-y-2 px-2 duration-150 [&:where(>*)]:col-start-2"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 min-w-0">
        <div className="aui-user-message-content peer bg-muted text-foreground rounded-xl px-4 py-2 wrap-break-word empty:hidden">
          <MessagePrimitive.Quote>
            {(quote) => <QuoteBlock {...quote} />}
          </MessagePrimitive.Quote>
          <MessagePrimitive.Parts components={{ Text: DirectiveText }} />
        </div>
        <div className="aui-user-action-bar-wrapper absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 pr-2 peer-empty:hidden">
          <UserActionBar />
        </div>
        <MessageTimestamp className="mt-1 block text-right" />
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 row-start-3 -mr-1 justify-end"
      />
    </MessagePrimitive.Root>
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit asChild>
        <TooltipIconButton tooltip="Edit" className="aui-user-action-edit">
          <PencilIcon />
        </TooltipIconButton>
      </ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="mx-auto flex w-full max-w-(--thread-max-width) flex-col px-2"
    >
      <ComposerPrimitive.Unstable_TriggerPopoverRoot>
        <ComposerPrimitive.Root className="aui-edit-composer-root border-border/60 dark:border-muted-foreground/15 ml-auto flex w-full max-w-[85%] flex-col rounded-(--composer-radius) border bg-(--composer-bg) shadow-[0_4px_16px_-8px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none">
          <LexicalComposerInput
            directiveChip={DirectiveChip}
            autoFocus
            className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none [&_.aui-directive-chip]:inline-flex [&_.aui-directive-chip]:items-baseline [&_.aui-directive-chip]:gap-1 [&_.aui-directive-chip]:rounded-md [&_.aui-directive-chip]:bg-blue-100 [&_.aui-directive-chip]:px-1.5 [&_.aui-directive-chip]:py-0.5 [&_.aui-directive-chip]:text-[13px] [&_.aui-directive-chip]:leading-none [&_.aui-directive-chip]:font-medium [&_.aui-directive-chip]:text-blue-700 dark:[&_.aui-directive-chip]:bg-blue-900/50 dark:[&_.aui-directive-chip]:text-blue-300 [&_.aui-directive-chip-icon]:self-center [&_.aui-lexical-input]:min-h-lh [&_.aui-lexical-input]:outline-none"
          />
          <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
            <ComposerPrimitive.Cancel asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3.5"
              >
                Cancel
              </Button>
            </ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send asChild>
              <Button size="sm" className="h-8 rounded-full px-3.5">
                Update
              </Button>
            </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
      </ComposerPrimitive.Unstable_TriggerPopoverRoot>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground mr-2 -ml-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous asChild>
        <TooltipIconButton tooltip="Previous">
          <ChevronLeftIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next asChild>
        <TooltipIconButton tooltip="Next">
          <ChevronRightIcon />
        </TooltipIconButton>
      </BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};

export const Base: FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="bg-muted/30 flex h-full w-full">
      <div className="hidden md:block">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden p-2 md:pl-0">
        <div className="bg-background flex flex-1 flex-col overflow-hidden rounded-lg">
          <Header
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
          <main className="flex-1 overflow-hidden">
            <Thread />
          </main>
        </div>
      </div>
    </div>
  );
};
