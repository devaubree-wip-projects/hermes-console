"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cva, type VariantProps } from "class-variance-authority";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { useAui } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shared/chat/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/shared/chat/ui/command";

export type ModelSelectorEffortOption = {
  id: string;
  name: string;
};

export const DEFAULT_EFFORT_OPTIONS: readonly ModelSelectorEffortOption[] = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Medium" },
  { id: "high", name: "High" },
];

export type ModelOption = {
  id: string;
  name: string;
  version?: string;
  description?: string;
  /** Max input tokens supported by this model. */
  contextWindow?: number;
  icon?: ReactNode;
  disabled?: boolean;
  /** Extra terms matched by ModelSelector.Search, in addition to id and name. */
  keywords?: readonly string[];
  /**
   * Reasoning effort levels the model supports. Pass `true` for the default
   * low/medium/high levels, or a custom list. Omit for models without
   * configurable reasoning.
   */
  efforts?: boolean | readonly ModelSelectorEffortOption[];
};

function getModelEfforts(
  model: ModelOption | undefined,
): readonly ModelSelectorEffortOption[] | undefined {
  if (!model?.efforts) return undefined;
  return model.efforts === true ? DEFAULT_EFFORT_OPTIONS : model.efforts;
}

function resolveEffort(
  efforts: readonly ModelSelectorEffortOption[] | undefined,
  effort: string | undefined,
): string | undefined {
  if (effort === undefined) return undefined;
  return efforts?.some((e) => e.id === effort) ? effort : undefined;
}

/**
 * Returns the effort id if the given model supports it, otherwise undefined.
 * Effort selection is kept sticky across model switches; this resolves what
 * actually applies to the current model.
 */
export function resolveModelEffort(
  models: readonly ModelOption[],
  modelId: string | undefined,
  effort: string | undefined,
): string | undefined {
  return resolveEffort(
    getModelEfforts(models.find((m) => m.id === modelId)),
    effort,
  );
}

function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: {
  prop: T | undefined;
  defaultProp: T | undefined;
  onChange: ((next: T) => void) | undefined;
}) {
  const [internal, setInternal] = useState(defaultProp);
  const isControlled = prop !== undefined;
  const value = isControlled ? prop : internal;
  // Read onChange through a ref so inline callbacks don't recreate the setter
  // (and with it the memoized context value) every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const setValue = useCallback(
    (next: T) => {
      if (!isControlled) setInternal(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );
  return [value, setValue] as const;
}

type ModelSelectorContextValue = {
  models: readonly ModelOption[];
  value: string | undefined;
  setValue: (value: string) => void;
  /** The model matching `value`, derived once for all sub-components. */
  selectedModel: ModelOption | undefined;
  /** The selected model's effort levels, undefined when not configurable. */
  efforts: readonly ModelSelectorEffortOption[] | undefined;
  /** Effort resolved against the selected model's supported levels. */
  effort: string | undefined;
  setEffort: (effort: string) => void;
  setOpen: (open: boolean) => void;
};

const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(
  null,
);

function useModelSelectorContext() {
  const ctx = useContext(ModelSelectorContext);
  if (!ctx) {
    throw new Error(
      "ModelSelector sub-components must be used within ModelSelector.Root",
    );
  }
  return ctx;
}

/**
 * The selected model's effort levels and the active selection. Use it to build
 * a custom effort UI inside ModelSelector.Content (e.g. a slider or a shadcn
 * DropdownMenu) when the built-in ModelSelector.Effort layout doesn't fit.
 * `efforts` is undefined for models without configurable reasoning.
 */
export function useModelSelectorEfforts(): {
  efforts: readonly ModelSelectorEffortOption[] | undefined;
  effort: string | undefined;
  setEffort: (effort: string) => void;
} {
  const { efforts, effort, setEffort } = useModelSelectorContext();
  return { efforts, effort, setEffort };
}

export type ModelSelectorRootProps = {
  models: readonly ModelOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  effort?: string;
  defaultEffort?: string;
  onEffortChange?: (effort: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

function ModelSelectorRoot({
  models,
  value: valueProp,
  defaultValue,
  onValueChange,
  effort: effortProp,
  defaultEffort,
  onEffortChange,
  open: openProp,
  defaultOpen,
  onOpenChange,
  children,
}: ModelSelectorRootProps) {
  const [value, setValue] = useControllableState({
    prop: valueProp,
    defaultProp: defaultValue ?? models[0]?.id,
    onChange: onValueChange,
  });
  const [effort, setEffort] = useControllableState({
    prop: effortProp,
    defaultProp: defaultEffort,
    onChange: onEffortChange,
  });
  const [open, setOpen] = useControllableState({
    prop: openProp,
    defaultProp: defaultOpen ?? false,
    onChange: onOpenChange,
  });

  const selectedModel = models.find((m) => m.id === value);
  const efforts = getModelEfforts(selectedModel);
  const activeEffort = resolveEffort(efforts, effort);
  const contextValue = useMemo(
    () => ({
      models,
      value,
      setValue,
      selectedModel,
      efforts,
      effort: activeEffort,
      setEffort,
      setOpen,
    }),
    [
      models,
      value,
      setValue,
      selectedModel,
      efforts,
      activeEffort,
      setEffort,
      setOpen,
    ],
  );

  return (
    <ModelSelectorContext.Provider value={contextValue}>
      {/* `?? false` narrows away undefined for exactOptionalPropertyTypes consumers. */}
      <Popover open={open ?? false} onOpenChange={setOpen}>
        {children}
      </Popover>
    </ModelSelectorContext.Provider>
  );
}

export const modelSelectorTriggerVariants = cva(
  "focus-visible:ring-ring/50 flex w-fit items-center justify-between gap-2 overflow-hidden rounded-md text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        outline:
          "border-input hover:bg-accent hover:text-accent-foreground border bg-transparent",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        muted: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 px-2.5 py-1.5 text-xs",
        lg: "h-10 px-4 py-2.5",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  },
);

export type ModelSelectorTriggerProps = ComponentPropsWithoutRef<
  typeof PopoverTrigger
> &
  VariantProps<typeof modelSelectorTriggerVariants>;

function ModelSelectorTrigger({
  className,
  variant,
  size,
  children,
  ...props
}: ModelSelectorTriggerProps) {
  return (
    <PopoverTrigger
      data-slot="model-selector-trigger"
      data-variant={variant ?? "outline"}
      data-size={size ?? "default"}
      role="combobox"
      className={cn(modelSelectorTriggerVariants({ variant, size }), className)}
      {...props}
    >
      {children ?? <ModelSelectorValue />}
      <ChevronDownIcon className="size-4 opacity-50" />
    </PopoverTrigger>
  );
}

export type ModelSelectorValueProps = {
  placeholder?: ReactNode;
  /** Show the active effort level next to the model name. */
  showEffort?: boolean;
  className?: string;
};

function ModelIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
      {children}
    </span>
  );
}

function ModelSelectorValue({
  placeholder = "Select model",
  showEffort = true,
  className,
}: ModelSelectorValueProps) {
  const { selectedModel, efforts, effort } = useModelSelectorContext();

  if (!selectedModel) {
    return (
      <span
        data-slot="model-selector-value"
        className={cn("text-muted-foreground", className)}
      >
        {placeholder}
      </span>
    );
  }

  const effortName =
    showEffort && effort !== undefined
      ? efforts?.find((e) => e.id === effort)?.name
      : undefined;

  return (
    <span
      data-slot="model-selector-value"
      className={cn("flex min-w-0 items-center gap-2", className)}
    >
      {selectedModel.icon && <ModelIcon>{selectedModel.icon}</ModelIcon>}
      <span className="flex min-w-0 items-baseline gap-1">
        <span className="truncate font-medium">{selectedModel.name}</span>
        {selectedModel.version && (
          <span className="text-muted-foreground shrink-0 truncate">
            {selectedModel.version}
          </span>
        )}
      </span>
      {effortName && (
        <span className="text-muted-foreground truncate">{effortName}</span>
      )}
    </span>
  );
}

export type ModelSelectorContentProps = ComponentPropsWithoutRef<
  typeof PopoverContent
>;

function ModelSelectorContent({
  className,
  align = "start",
  sideOffset = 6,
  children,
  ...props
}: ModelSelectorContentProps) {
  const { value } = useModelSelectorContext();

  return (
    <PopoverContent
      data-slot="model-selector-content"
      align={align}
      sideOffset={sideOffset}
      className={cn(
        "bg-popover/95 w-fit min-w-(--radix-popover-trigger-width) max-w-[calc(100vw-1rem)] overflow-visible rounded-xl p-0 shadow-lg backdrop-blur-sm",
        className,
      )}
      onInteractOutside={(event) => {
        const target = event.target;
        if (
          target instanceof Element &&
          target.closest('[data-slot="model-selector-version-panel"]')
        ) {
          event.preventDefault();
        }
      }}
      {...props}
    >
      {/* Seeding cmdk with the selected id makes it the active item, which
          cmdk scrolls into view when the popover opens. */}
      <Command
        className="overflow-visible bg-transparent"
        {...(value !== undefined ? { defaultValue: value } : {})}
      >
        {children ?? (
          <>
            <ModelSelectorList />
            <ModelSelectorEffort />
          </>
        )}
      </Command>
    </PopoverContent>
  );
}

export type ModelSelectorSearchProps = ComponentPropsWithoutRef<
  typeof CommandInput
>;

function ModelSelectorSearch({
  placeholder = "Search models...",
  ...props
}: ModelSelectorSearchProps) {
  return (
    <CommandInput
      data-slot="model-selector-search"
      placeholder={placeholder}
      {...props}
    />
  );
}

export type ModelSelectorListProps = ComponentPropsWithoutRef<
  typeof CommandList
>;

function ModelSelectorList({
  className,
  children,
  ...props
}: ModelSelectorListProps) {
  const { models } = useModelSelectorContext();
  const entries = useMemo(() => getModelListEntries(models), [models]);

  return (
    <CommandList
      data-slot="model-selector-list"
      className={cn(
        "max-h-[320px] overflow-x-visible overflow-y-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <ModelSelectorEmpty />
          <div data-slot="model-selector-flyout" className="min-w-56">
            <CommandGroup
              data-slot="model-selector-family-list"
              className="min-w-0 overflow-visible"
            >
              {entries.map((entry) =>
                entry.type === "group" ? (
                  <ModelSelectorFamilySubmenu
                    key={entry.name}
                    name={entry.name}
                    models={entry.models}
                  />
                ) : (
                  <ModelSelectorItem key={entry.model.id} model={entry.model} />
                ),
              )}
            </CommandGroup>
          </div>
        </>
      )}
    </CommandList>
  );
}

type ModelListEntry =
  | { type: "group"; name: string; models: readonly ModelOption[] }
  | { type: "model"; model: ModelOption };

function getModelListEntries(models: readonly ModelOption[]): ModelListEntry[] {
  const grouped = new Map<string, ModelOption[]>();
  for (const model of models) {
    const group = grouped.get(model.name) ?? [];
    group.push(model);
    grouped.set(model.name, group);
  }

  const emittedGroups = new Set<string>();
  const entries: ModelListEntry[] = [];
  for (const model of models) {
    const group = grouped.get(model.name);
    if (!group || group.length === 1) {
      entries.push({ type: "model", model });
      continue;
    }
    if (emittedGroups.has(model.name)) continue;
    emittedGroups.add(model.name);
    entries.push({ type: "group", name: model.name, models: group });
  }
  return entries;
}

export type ModelSelectorEmptyProps = ComponentPropsWithoutRef<
  typeof CommandEmpty
>;

function ModelSelectorEmpty({ children, ...props }: ModelSelectorEmptyProps) {
  return (
    <CommandEmpty data-slot="model-selector-empty" {...props}>
      {children ?? "No models found."}
    </CommandEmpty>
  );
}

export type ModelSelectorGroupProps = ComponentPropsWithoutRef<
  typeof CommandGroup
>;

function ModelSelectorGroup(props: ModelSelectorGroupProps) {
  return <CommandGroup data-slot="model-selector-group" {...props} />;
}

export type ModelSelectorSeparatorProps = ComponentPropsWithoutRef<
  typeof CommandSeparator
>;

function ModelSelectorSeparator(props: ModelSelectorSeparatorProps) {
  return <CommandSeparator data-slot="model-selector-separator" {...props} />;
}

export type ModelSelectorItemProps = Omit<
  ComponentPropsWithoutRef<typeof CommandItem>,
  "value"
> & {
  model: ModelOption;
};

function ModelSelectorItem({
  model,
  className,
  children,
  onSelect,
  ...props
}: ModelSelectorItemProps) {
  const { value, setValue, setOpen } = useModelSelectorContext();
  const isSelected = value === model.id;

  return (
    <CommandItem
      data-slot="model-selector-item"
      value={model.id}
      keywords={[model.name, model.version ?? "", ...(model.keywords ?? [])]}
      {...(model.disabled ? { disabled: true } : undefined)}
      onSelect={(selectedValue) => {
        setValue(model.id);
        setOpen(false);
        onSelect?.(selectedValue);
      }}
      className={cn("relative gap-2 rounded-lg py-2 ps-3 pe-9", className)}
      {...props}
    >
      {children ?? (
        <>
          {model.icon && <ModelIcon>{model.icon}</ModelIcon>}
          <span className="flex min-w-0 flex-col">
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="truncate font-medium">{model.name}</span>
              {model.version && (
                <span className="text-muted-foreground shrink-0 truncate">
                  {model.version}
                </span>
              )}
            </span>
            {model.description && (
              <span className="text-muted-foreground truncate text-xs">
                {model.description}
              </span>
            )}
          </span>
        </>
      )}
      {isSelected && (
        <span className="absolute end-3 flex size-4 items-center justify-center">
          <CheckIcon className="size-4" />
        </span>
      )}
    </CommandItem>
  );
}

type ModelSelectorFamilySubmenuProps = {
  name: string;
  models: readonly ModelOption[];
};

function ModelSelectorFamilySubmenu({
  name,
  models,
}: ModelSelectorFamilySubmenuProps) {
  const [open, setOpen] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const { value } = useModelSelectorContext();
  const isSelected = models.some((model) => model.id === value);

  const updatePanelPosition = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 4;
    const hoverBridge = 6;

    const panelWidth = panel?.offsetWidth ?? 192;
    const panelHeight =
      panel?.offsetHeight ?? Math.min(models.length * 52 + 8, 240);

    let left = triggerRect.right + gap - hoverBridge;
    if (left + panelWidth > window.innerWidth - viewportPadding) {
      left = triggerRect.left - panelWidth - gap + hoverBridge;
    }
    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - panelWidth - viewportPadding),
    );

    let top = triggerRect.top;
    const overflowBottom =
      top + panelHeight > window.innerHeight - viewportPadding;
    if (overflowBottom) {
      top = triggerRect.bottom - panelHeight;
    }
    top = Math.max(
      viewportPadding,
      Math.min(top, window.innerHeight - panelHeight - viewportPadding),
    );

    setPanelPosition({ top, left });
  }, [models.length]);

  const openSubmenu = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
    setOpen(true);
  }, []);

  const scheduleCloseSubmenu = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setOpen(false), 200);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    const frame = requestAnimationFrame(updatePanelPosition);
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, updatePanelPosition]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const versionPanel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            data-slot="model-selector-version-panel"
            data-model-selector-version-group={name}
            className="bg-popover text-popover-foreground fixed z-[200] max-h-[min(240px,calc(100vh-1rem))] min-w-48 overflow-y-auto rounded-lg border py-1 ps-2 pe-1 shadow-md before:absolute before:-left-2 before:top-0 before:h-full before:w-2 before:content-['']"
            style={{
              top: panelPosition.top,
              left: panelPosition.left,
            }}
            onPointerEnter={openSubmenu}
            onPointerLeave={scheduleCloseSubmenu}
          >
            {models.map((model) => (
              <ModelSelectorItem
                key={model.id}
                data-slot="model-selector-version-item"
                model={model}
              />
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={triggerRef}
        className="relative"
        onPointerEnter={() => {
          updatePanelPosition();
          openSubmenu();
        }}
        onPointerLeave={scheduleCloseSubmenu}
      >
        <CommandItem
          data-slot="model-selector-family-item"
          value={`${name} ${models.map((model) => model.version).join(" ")}`}
          keywords={models.flatMap((model) => [
            model.name,
            model.version ?? "",
            ...(model.keywords ?? []),
          ])}
          onPointerEnter={() => {
            updatePanelPosition();
            openSubmenu();
          }}
          onFocus={() => {
            updatePanelPosition();
            openSubmenu();
          }}
          onSelect={() => {
            updatePanelPosition();
            setOpen((prev) => !prev);
          }}
          className={cn(
            "relative gap-2 rounded-lg py-2 ps-3 pe-9",
            (isSelected || open) && "bg-accent/60",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{name}</span>
            <span className="text-muted-foreground truncate text-xs">
              {models.map((model) => model.version).filter(Boolean).join(" · ")}
            </span>
          </span>
          <ChevronRightIcon className="absolute end-3 size-4" />
        </CommandItem>
      </div>
      {versionPanel}
    </>
  );
}

export type ModelSelectorEffortProps = ComponentPropsWithoutRef<"div"> & {
  label?: ReactNode;
};

function ModelSelectorEffort({
  label = "Thinking",
  className,
  onKeyDown,
  ...props
}: ModelSelectorEffortProps) {
  const { efforts, effort, setEffort } = useModelSelectorEfforts();

  if (!efforts?.length) return null;

  return (
    <div
      data-slot="model-selector-effort"
      className={cn(
        "flex items-center justify-between gap-3 border-t px-3 py-2",
        className,
      )}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        // cmdk's root keydown handler claims Enter to select the highlighted
        // model; stop it from seeing Enter so the focused toggle activates.
        if (e.key === "Enter") e.stopPropagation();
        onKeyDown?.(e);
      }}
      {...props}
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <div
        role="group"
        aria-label={typeof label === "string" ? label : "Reasoning effort"}
        className="flex items-center gap-0.5"
      >
        {efforts.map((option) => {
          const isActive = option.id === effort;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              data-state={isActive ? "on" : "off"}
              onClick={() => setEffort(option.id)}
              className={cn(
                "focus-visible:ring-ring/50 rounded-md px-2 py-1 text-xs transition-colors outline-none focus-visible:ring-2",
                isActive
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type ModelSelectorProps = Omit<ModelSelectorRootProps, "children"> &
  VariantProps<typeof modelSelectorTriggerVariants> & {
    provider?: string;
    /** Render a search input above the model list. */
    searchable?: boolean;
    /** Render the built-in reasoning effort controls inside the model popover. */
    showEffortSelector?: boolean;
    /** Show the active reasoning effort next to the selected model name. */
    showEffortValue?: boolean;
    className?: string;
    contentClassName?: string;
  };

/** Registers the selection with assistant-ui's ModelContext system. The
 * context's effort is already resolved against the selected model. */
function ModelSelectorModelContext({ provider }: { provider?: string }) {
  const { value, effort } = useModelSelectorContext();
  const api = useAui();

  useEffect(() => {
    if (value === undefined) return;
    const config = {
      config: {
        ...(provider !== undefined ? { provider } : undefined),
        modelName: value,
        ...(effort !== undefined ? { reasoningEffort: effort } : undefined),
      },
    };
    return api.modelContext().register({
      getModelContext: () => config,
    });
  }, [api, provider, value, effort]);

  return null;
}

const ModelSelectorImpl = ({
  provider,
  searchable,
  showEffortSelector = true,
  showEffortValue = true,
  variant,
  size,
  className,
  contentClassName,
  ...rootProps
}: ModelSelectorProps) => {
  return (
    <ModelSelectorRoot {...rootProps}>
      <ModelSelectorModelContext provider={provider} />
      <ModelSelectorTrigger
        variant={variant}
        size={size}
        className={className}
      >
        <ModelSelectorValue showEffort={showEffortValue} />
      </ModelSelectorTrigger>
      <ModelSelectorContent className={contentClassName}>
        {searchable && <ModelSelectorSearch />}
        <ModelSelectorList />
        {showEffortSelector && <ModelSelectorEffort />}
      </ModelSelectorContent>
    </ModelSelectorRoot>
  );
};

type ModelSelectorComponent = typeof ModelSelectorImpl & {
  displayName?: string;
  Root: typeof ModelSelectorRoot;
  Trigger: typeof ModelSelectorTrigger;
  Value: typeof ModelSelectorValue;
  Content: typeof ModelSelectorContent;
  Search: typeof ModelSelectorSearch;
  List: typeof ModelSelectorList;
  Empty: typeof ModelSelectorEmpty;
  Group: typeof ModelSelectorGroup;
  Separator: typeof ModelSelectorSeparator;
  Item: typeof ModelSelectorItem;
  Effort: typeof ModelSelectorEffort;
};

const ModelSelector = memo(
  ModelSelectorImpl,
) as unknown as ModelSelectorComponent;

ModelSelector.displayName = "ModelSelector";
ModelSelector.Root = ModelSelectorRoot;
ModelSelector.Trigger = ModelSelectorTrigger;
ModelSelector.Value = ModelSelectorValue;
ModelSelector.Content = ModelSelectorContent;
ModelSelector.Search = ModelSelectorSearch;
ModelSelector.List = ModelSelectorList;
ModelSelector.Empty = ModelSelectorEmpty;
ModelSelector.Group = ModelSelectorGroup;
ModelSelector.Separator = ModelSelectorSeparator;
ModelSelector.Item = ModelSelectorItem;
ModelSelector.Effort = ModelSelectorEffort;

export {
  ModelSelector,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorValue,
  ModelSelectorContent,
  ModelSelectorSearch,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorSeparator,
  ModelSelectorItem,
  ModelSelectorEffort,
};
