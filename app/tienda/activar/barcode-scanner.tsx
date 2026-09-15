"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Progresivo, no obligatorio: si el navegador no tiene BarcodeDetector
// (Safari/iOS, por ejemplo), este componente ni se muestra un botón útil —
// la entrada manual (ya en ActivationFlow) sigue funcionando siempre. No se
// agrega el ponyfill de zxing-wasm mencionado en docs/ARCHITECTURE.md: es
// una dependencia grande para lo que pide esta fase (cámara "cuando sea
// razonable", con fallback manual garantizado) — queda documentado como
// diferido, no como olvidado.
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
    };
  }
}

export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (value: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "BarcodeDetector" in window;
  const message = supported
    ? error
    : "Este navegador no soporta escaneo por cámara. Usa la entrada manual.";

  useEffect(() => {
    if (!supported) return;

    let stream: MediaStream | null = null;
    let stopped = false;
    let frame: number;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        const detector = new window.BarcodeDetector!({
          formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
        });

        const tick = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const results = await detector.detect(videoRef.current);
            if (results.length > 0) {
              onDetected(results[0].rawValue);
              return;
            }
          } catch {
            // Un frame fallido no es un error real; se sigue intentando.
          }
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch {
        setError("No se pudo acceder a la cámara. Usa la entrada manual.");
      }
    }

    start();

    return () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [supported, onDetected]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Escanear</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {message ? (
          <p className="text-sm text-muted-foreground">{message}</p>
        ) : (
          <video ref={videoRef} muted playsInline className="aspect-video w-full rounded-md bg-black object-cover" />
        )}
      </CardContent>
    </Card>
  );
}
