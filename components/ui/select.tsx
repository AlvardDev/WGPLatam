"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "cn";

export type SelectOption = { value: string; label: string };

/**
 * Dropdown con el estilo de WGP en vez del <select> del sistema operativo.
 * Misma API que un select nativo: `name` + `defaultValue` funciona dentro de un
 * <form> GET/POST (base-ui renderiza un input oculto), y `value` +
 * `onValueChange` sirve para react-hook-form (vía Controller). "" = sin
 * elegir, y se muestra `placeholder` (que también es una opción elegible,
 * como "Todas las acciones" en los filtros).
 */
export function Select({
  options,
  placeholder,
  name,
  id,
  value,
  defaultValue,
  onValueChange,
  onBlur,
  disabled,
  invalid,
  className,
  "aria-label": ariaLabel,
}: {
  options: SelectOption[];
  placeholder: string;
  name?: string;
  id?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const items = [{ value: null as string | null, label: placeholder }, ...options];
  const toInner = (v: string | undefined) => (v === undefined ? undefined : v || null);

  return (
    <SelectPrimitive.Root
      items={items}
      name={name}
      value={toInner(value)}
      defaultValue={toInner(defaultValue)}
      onValueChange={(v) => onValueChange?.((v as string | null) ?? "")}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        onBlur={onBlur}
        className={cn(
          "flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-input bg-muted/40 px-3 text-left text-sm transition-colors outline-none select-none",
          "hover:bg-muted/70 focus-visible:border-ring focus-visible:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring data-[popup-open]:bg-background",
          "disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
          className,
        )}
      >
        <SelectPrimitive.Value className="truncate data-[placeholder]:text-muted-foreground" />
        <SelectPrimitive.Icon className="shrink-0 text-muted-foreground transition-transform duration-200 in-data-[popup-open]:rotate-180">
          <ChevronDown className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
          <SelectPrimitive.Popup
            className={cn(
              "max-h-(--available-height) min-w-(--anchor-width) origin-(--transform-origin) overflow-y-auto rounded-xl bg-popover p-1.5 text-sm text-popover-foreground shadow-xl shadow-slate-900/10 outline-none",
              "duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            <SelectPrimitive.List>
              {items.map((item) => (
                <SelectPrimitive.Item
                  key={item.value ?? "__empty"}
                  value={item.value}
                  className={cn(
                    "flex cursor-default items-center justify-between gap-3 rounded-lg px-2.5 py-2 outline-none select-none",
                    "data-highlighted:bg-accent data-selected:font-medium data-selected:text-primary",
                    item.value === null && "text-muted-foreground",
                  )}
                >
                  <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-4 text-primary" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
