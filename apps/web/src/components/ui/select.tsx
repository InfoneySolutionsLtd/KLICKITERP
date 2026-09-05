"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
// `MultiSelect` (bottom of this file) is built on `@radix-ui/react-dropdown-menu`'s primitives,
// not `SelectPrimitive` — Radix's Select is genuinely single-value-only (its `Root` has no
// multi-value mode), so there is no way to build a real multi-select by composing
// `SelectPrimitive` alone. Reusing the already-installed `@radix-ui/react-dropdown-menu`
// dependency (via its `CheckboxItem`, which supports `onSelect={(e) => e.preventDefault()}` to
// stay open across multiple picks) avoids adding a new package for this one component, while
// still matching this file's own token classes/shape (`rounded-lg`/`rounded-xl` trigger+content,
// `focus-visible:ring-ring`, etc.) so it reads as the same design system, not a bolted-on one.
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Hand-written in the exact shadcn-CLI-output shape (see `dropdown-menu.tsx`'s
 * own doc comment for why every `components/ui/*` primitive in this app is
 * authored by hand rather than via `pnpm dlx shadcn@latest add` — same
 * `forwardRef` pattern, same `rounded-xl border border-border bg-popover
 * shadow-md` token classes, same Portal wrapping). Pure infrastructure with
 * zero Students-specific logic — introduced this slice (Phase 6 Slice 2) so
 * `<ClassStreamSelect>`/`<StudentFilters>`/`status-change-dialog.tsx` have a
 * real dropdown primitive; every future module's forms reuse this unchanged.
 */
const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 shrink-0 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
    <ChevronUp className="size-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton ref={ref} className={cn("flex cursor-default items-center justify-center py-1", className)} {...props}>
    <ChevronDown className="size-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/**
 * `searchable` (Phase 6 — dropdown search UX pass) opts a `<SelectContent>`
 * into a live-filter search box pinned above its option list. Deliberately
 * NOT a data-driven `options`/`onFilter` API (unlike `<MultiSelect>` above)
 * — every existing call site in this app composes `<SelectContent>` via
 * `<SelectItem>` children mapped from its own query data, and rewriting
 * 100+ call sites into a new props shape just to add search was both far
 * riskier and unnecessary. Instead this filters the ALREADY-RENDERED DOM:
 * Radix stamps every `SelectItem` with `role="option"` and every
 * `SelectGroup` with `role="group"`, so a plain `useEffect` keyed on the
 * query can hide/show real elements by their own rendered text content —
 * works unchanged for flat lists, grouped lists, and lists inside a
 * `<SelectLabel>` group, with zero changes to any existing call site's
 * children.
 *
 * Only opt a `<SelectContent>` into this where its item list is genuinely
 * dynamic/can grow long (classes, students, GL accounts, suppliers,
 * employees, items, cost centers, departments, banks, etc.) — a short,
 * hardcoded enum list (status, yes/no, boarding type, day-of-week) should
 * NOT get a search box; it adds visual noise for a list a user can already
 * scan in one glance.
 */
const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { searchable?: boolean; searchPlaceholder?: string }
>(({ className, children, position = "popper", searchable, searchPlaceholder, ...props }, ref) => {
  const [query, setQuery] = React.useState("");
  const viewportRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    // Radix moves focus to the selected/first item as soon as Content
    // mounts — stealing it back on the next frame (rather than a plain
    // `autoFocus`, which loses this exact race) is the standard workaround
    // for adding a real input into a Radix Select's content.
    if (searchable) requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchable]);

  React.useEffect(() => {
    if (!searchable) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const q = query.trim().toLowerCase();

    const options = viewport.querySelectorAll<HTMLElement>('[role="option"]');
    options.forEach((option) => {
      const matches = q === "" || (option.textContent ?? "").toLowerCase().includes(q);
      option.style.display = matches ? "" : "none";
    });

    const groups = viewport.querySelectorAll<HTMLElement>('[role="group"]');
    groups.forEach((group) => {
      const hasVisibleOption = Array.from(group.querySelectorAll<HTMLElement>('[role="option"]')).some((o) => o.style.display !== "none");
      group.style.display = hasVisibleOption ? "" : "none";
    });
  });

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        <SelectScrollUpButton />
        {searchable && (
          <div className="sticky top-0 z-10 border-b border-border bg-popover p-1.5" onPointerDown={(e) => e.stopPropagation()}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Radix's Content has its own keydown handling (arrow-key
                // navigation, single-letter typeahead) that would otherwise
                // intercept normal typing in this input — stopping
                // propagation for everything except Escape (which should
                // still close the whole Select as usual) hands real
                // keyboard control back to this field.
                onKeyDown={(e) => {
                  if (e.key !== "Escape") e.stopPropagation();
                }}
                placeholder={searchPlaceholder}
                autoComplete="off"
                className="h-8 w-full rounded-md border border-input bg-background pl-7 pr-2 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        )}
        <SelectPrimitive.Viewport
          ref={viewportRef}
          className={cn("p-1", position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]")}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => <SelectPrimitive.Label ref={ref} className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)} {...props} />);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-border", className)} {...props} />);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * Phase 6 Slice 3b — the fee-structure create dialog's multi-grade picker
 * (create one DRAFT structure per selected class). Value/onChange props,
 * not children-composed (multi-select's usage shape — a flat option list +
 * a selected-values array — doesn't benefit from `<Select>`'s
 * Trigger/Content/Item composition the way a single-value picker does), but
 * still exposes real sub-parts as named exports below for anything that
 * wants to build its own trigger, matching this file's spirit rather than
 * being a single opaque black box.
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  disabled,
  className,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const labelsById = React.useMemo(() => new Map(options.map((o) => [o.value, o.label])), [options]);

  function toggle(value: string) {
    if (selectedSet.has(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  const summary =
    selected.length === 0
      ? (placeholder ?? "")
      : selected.length === 1
        ? (labelsById.get(selected[0]) ?? selected[0])
        : `${selected.length} selected`;

  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="line-clamp-1 text-left">{summary}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 max-h-72 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-md",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        >
          {options.length === 0 ? (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">—</div>
          ) : (
            options.map((option) => (
              <DropdownMenuPrimitive.CheckboxItem
                key={option.value}
                checked={selectedSet.has(option.value)}
                // Keeps the menu open across multiple picks — Radix's default `onSelect`
                // behavior closes the whole menu, which single-value Select wants but
                // multi-select explicitly does not.
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={() => toggle(option.value)}
                className="relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-muted data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 flex size-3.5 items-center justify-center">
                  <DropdownMenuPrimitive.ItemIndicator>
                    <Check className="size-4" />
                  </DropdownMenuPrimitive.ItemIndicator>
                </span>
                {option.label}
              </DropdownMenuPrimitive.CheckboxItem>
            ))
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
