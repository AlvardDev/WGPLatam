"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldDescription } from "@/components/ui/field";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/image/compress-image";
import { PRODUCT_PHOTOS_BUCKET, productPhotoUrl } from "@/lib/image/product-photos";

export function ProductPhotoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo después
    if (!file) return;

    setIsUploading(true);
    try {
      const compressed = await compressImage(file);
      const path = `${crypto.randomUUID()}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage.from(PRODUCT_PHOTOS_BUCKET).upload(path, compressed, {
        contentType: "image/jpeg",
        upsert: false,
      });
      if (error) throw new Error(error.message);
      onChange(path);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir la foto.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={productPhotoUrl(value)}
            alt="Foto del producto"
            className="size-20 rounded-md border object-cover"
          />
        ) : (
          <div className="flex size-20 items-center justify-center rounded-md border border-dashed text-muted-foreground">
            <ImageIcon className="size-6" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? <Loader2 className="size-4 animate-spin" /> : null}
            {isUploading ? "Subiendo..." : value ? "Cambiar foto" : "Subir foto"}
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={isUploading}
            >
              <X className="size-4" />
              Quitar foto
            </Button>
          )}
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <FieldDescription>Se comprime automáticamente antes de subirse.</FieldDescription>
    </div>
  );
}
