import { cn } from "cn";
import { Input } from "./input";

/** Campo corto para días de garantía: solo dígitos, máximo 4, con sufijo "días". */
export function DaysInput({ className, onChange, ...props }: React.ComponentProps<"input">) {
  return (
    <div className="flex items-center gap-2">
      <Input
        inputMode="numeric"
        maxLength={4}
        autoComplete="off"
        placeholder="365"
        className={cn("w-24 text-right tabular-nums", className)}
        onChange={(e) => {
          e.target.value = e.target.value.replace(/\D/g, "");
          onChange?.(e);
        }}
        {...props}
      />
      <span className="text-sm text-muted-foreground">días</span>
    </div>
  );
}
