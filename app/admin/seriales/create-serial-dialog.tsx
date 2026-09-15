"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createSerialAction } from "@/lib/actions/serials";
import { createSerialSchema, type CreateSerialInput } from "@/lib/validation/serials";

type Product = { id: string; code: string; name: string };
type Lot = { id: string; code: string; product_id: string };

export function CreateSerialDialog({ products, lots }: { products: Product[]; lots: Lot[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateSerialInput>({
    resolver: zodResolver(createSerialSchema),
    defaultValues: { productId: "", lotId: "", serial: "", barcode: "" },
  });
  const [isPending, startTransition] = useTransition();
  const selectedProductId = useWatch({ control, name: "productId" });
  const availableLots = useMemo(
    () => lots.filter((l) => l.product_id === selectedProductId),
    [lots, selectedProductId],
  );

  const onValid = (values: CreateSerialInput) => {
    startTransition(async () => {
      const result = await createSerialAction(values);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("Serial creado.");
        reset();
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button disabled={products.length === 0}>
            <Plus className="size-4" />
            Crear serial
          </Button>
        }
      />
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Crear serial</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onValid)} noValidate>
          <FieldGroup>
            <Field data-invalid={!!errors.productId}>
              <FieldLabel htmlFor="productId">Producto</FieldLabel>
              <select
                id="productId"
                className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                {...register("productId")}
              >
                <option value="">Selecciona un producto</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
              <FieldError errors={[errors.productId]} />
            </Field>
            <Field data-invalid={!!errors.lotId}>
              <FieldLabel htmlFor="lotId">Lote</FieldLabel>
              <select
                id="lotId"
                disabled={!selectedProductId}
                className="h-8 w-full rounded-md border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                {...register("lotId")}
              >
                <option value="">
                  {selectedProductId ? "Selecciona un lote" : "Elige primero un producto"}
                </option>
                {availableLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
              </select>
              <FieldError errors={[errors.lotId]} />
            </Field>
            <Field data-invalid={!!errors.serial}>
              <FieldLabel htmlFor="serial">Serial</FieldLabel>
              <Input id="serial" {...register("serial")} />
              <FieldError errors={[errors.serial]} />
            </Field>
            <Field data-invalid={!!errors.barcode}>
              <FieldLabel htmlFor="barcode">Código de barras</FieldLabel>
              <Input id="barcode" {...register("barcode")} />
              <FieldError errors={[errors.barcode]} />
            </Field>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creando..." : "Crear serial"}
            </Button>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}
