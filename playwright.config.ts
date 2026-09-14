import { defineConfig, devices } from "@playwright/test";

/**
 * Configuración mínima de Fase 1. Los flujos E2E reales (login con
 * credenciales válidas, RLS desde el navegador, etc.) necesitan un proyecto
 * Supabase — BLOQUEADO en esta sesión (sin Docker, sin proyecto). Lo que sí
 * corre aquí no depende de Supabase: solo verifica que las páginas públicas
 * renderizan lo que deben. Ver tests/e2e/README.md.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npm run start -- -p 3100",
    url: "http://localhost:3100/login",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
