"use client";

import { updateProduct } from "@/lib/actions/products";
import type { ProductUpdateInput } from "@/lib/validation/products";
import { ProductForm } from "../product-form";

export function ProductEditForm({
  id,
  productCode,
  defaultValues,
}: {
  id: string;
  productCode: string;
  defaultValues: ProductUpdateInput;
}) {
  return (
    <ProductForm
      mode="edit"
      productCode={productCode}
      defaultValues={defaultValues}
      onSubmit={(values) => updateProduct(id, values)}
      onSuccess={() => {}}
    />
  );
}
