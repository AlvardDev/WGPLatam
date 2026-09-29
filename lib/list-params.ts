export const PAGE_SIZE = 25;

export type SearchParams = Record<string, string | string[] | undefined>;

/**
 * Página y orden de un listado a partir de la URL (?pagina=2&orden=nombre&dir=asc).
 * `sortable` es la lista blanca clave-de-URL → columna real: una clave
 * desconocida cae al orden por defecto (nunca se pasa texto libre a .order()).
 */
export function listParams<K extends string>(
  sp: SearchParams,
  sortable: Record<K, string>,
  fallback: { key: NoInfer<K>; asc: boolean },
) {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const page = Math.max(1, Number.parseInt(one(sp.pagina) ?? "1", 10) || 1);
  const rawKey = one(sp.orden);
  const key = rawKey && Object.hasOwn(sortable, rawKey) ? (rawKey as K) : fallback.key;
  const dir = one(sp.dir);
  const asc = key === rawKey ? dir === "asc" : fallback.asc;
  return {
    page,
    from: (page - 1) * PAGE_SIZE,
    to: page * PAGE_SIZE - 1,
    sortKey: key,
    column: sortable[key],
    asc,
  };
}

/** Misma URL con algunos parámetros cambiados (undefined = quitar). */
export function withParams(basePath: string, sp: SearchParams, changes: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val) params.set(k, val);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined || v === "") params.delete(k);
    else params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
