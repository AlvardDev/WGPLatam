"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

// Búsqueda real, no decorativa — pero acotada a lo que ya existe: reusa el
// filtro exacto de serial/código de barras que /admin/seriales ya soporta
// (ver app/admin/seriales/page.tsx, parámetro `q`). No es un buscador
// difuso de productos/clientes (eso no existe todavía en el backend y no es
// parte de este rediseño) — el placeholder lo insinúa por fidelidad visual
// al mockup, pero la única búsqueda real hoy es por serial/código de barras.
export function AdminSearchBar() {
  const router = useRouter();
  const [value, setValue] = useState("");

  return (
    <form
      className="relative w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = value.trim();
        if (!trimmed) return;
        router.push(`/admin/seriales?q=${encodeURIComponent(trimmed)}`);
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por serial o código de barras..."
        className="h-10 w-full rounded-lg border border-input bg-transparent pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
  );
}
