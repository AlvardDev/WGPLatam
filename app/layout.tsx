import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// La CSP usa un nonce distinto por request (ver proxy.ts), lo que exige
// renderizado dinámico en toda la app — de lo contrario una página estática
// serviría un nonce viejo que no coincide con el de la respuesta real. Ver
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md,
// "Static vs Dynamic Rendering with CSP".
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "Gestión de Garantías",
    template: "%s · Gestión de Garantías",
  },
  description: "Sistema de gestión de garantías, seriales y activaciones.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
