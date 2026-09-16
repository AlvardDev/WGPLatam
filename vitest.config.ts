import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    // supabase/functions: Deno (Edge Function), tiene su propio test file
    // pero se corre con "deno test", no con Vitest/Node.
    exclude: ["node_modules", "tests/e2e", ".next", "supabase/functions"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
