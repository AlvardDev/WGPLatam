import { describe, expect, it } from "vitest";
import { areaForPath, roleHomePath } from "./role-path";

describe("roleHomePath", () => {
  it("sends admin to /admin", () => {
    expect(roleHomePath("admin")).toBe("/admin");
  });

  it("sends seller to /tienda", () => {
    expect(roleHomePath("seller")).toBe("/tienda");
  });

  it("sends a user without role to /login", () => {
    expect(roleHomePath(null)).toBe("/login");
    expect(roleHomePath(undefined)).toBe("/login");
  });
});

describe("areaForPath", () => {
  it("recognizes the admin area", () => {
    expect(areaForPath("/admin")).toBe("admin");
    expect(areaForPath("/admin/ajustes")).toBe("admin");
  });

  it("recognizes the seller area", () => {
    expect(areaForPath("/tienda")).toBe("seller");
    expect(areaForPath("/tienda/activar")).toBe("seller");
  });

  it("returns null for public/auth routes", () => {
    expect(areaForPath("/login")).toBeNull();
    expect(areaForPath("/")).toBeNull();
  });
});
