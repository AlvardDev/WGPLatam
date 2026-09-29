"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Alterna claro/oscuro. Los íconos se muestran por CSS (clase .dark), sin esperar a montar. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Cambiar modo claro/oscuro"
      title="Modo claro/oscuro"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="text-muted-foreground hover:text-foreground"
    >
      <Sun className="size-5 transition-transform duration-300 dark:hidden" />
      <Moon className="hidden size-5 transition-transform duration-300 dark:block" />
    </Button>
  );
}
