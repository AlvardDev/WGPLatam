export const PRODUCT_PHOTOS_BUCKET = "product-photos";

// El bucket es público de lectura (ver la migración product_photos), así
// que la URL se arma directo con las mismas env vars públicas que ya usa
// lib/supabase/client.ts — no hace falta instanciar un cliente de Supabase
// ni hacer una llamada de red solo para esto. Sirve igual en Server y en
// Client Components.
export function productPhotoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_PHOTOS_BUCKET}/${path}`;
}
