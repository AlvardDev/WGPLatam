import { describe, expect, it } from "vitest";
import { listParams, withParams } from "./list-params";

const sortable = { nombre: "name", fecha: "created_at" };

describe("listParams", () => {
  it("defaults to page 1 and the fallback sort", () => {
    expect(listParams({}, sortable, { key: "fecha", asc: false })).toMatchObject({
      page: 1, from: 0, to: 24, column: "created_at", asc: false,
    });
  });
  it("reads page and a whitelisted sort", () => {
    expect(listParams({ pagina: "3", orden: "nombre", dir: "asc" }, sortable, { key: "fecha", asc: false })).toMatchObject({
      page: 3, from: 50, to: 74, column: "name", asc: true,
    });
  });
  it("ignores unknown columns and bad pages", () => {
    expect(listParams({ orden: "constructor" }, sortable, { key: "fecha", asc: false }).column).toBe("created_at");
    expect(listParams({ pagina: "-4", orden: "password" }, sortable, { key: "fecha", asc: false })).toMatchObject({
      page: 1, column: "created_at", asc: false,
    });
  });
});

describe("withParams", () => {
  it("keeps filters and replaces/removes keys", () => {
    expect(withParams("/x", { q: "abc", pagina: "2" }, { pagina: undefined, orden: "nombre" })).toBe("/x?q=abc&orden=nombre");
  });
});
