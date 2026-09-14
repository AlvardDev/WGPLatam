import type { NextConfig } from "next";

// La Content-Security-Policy (con nonce por request) se aplica en proxy.ts.
// Aquí van los headers que no dependen del request. Ver docs/SECURITY.md,
// "Riesgos y mitigaciones" (fila "Headers").
const staticSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders }];
  },
  // Solo desarrollo: la extensión de automatización de Chrome usada para
  // verificar la Fase 1 no puede interactuar con "localhost" pero sí con
  // "127.0.0.1" — Next.js, por defecto, solo permite recursos de dev
  // (HMR, Server Actions) desde "localhost". Sin esto, la página carga
  // pero React nunca termina de hidratar (ver docs/PROGRESS.md, bug
  // encontrado al verificar login E2E). No afecta producción.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
