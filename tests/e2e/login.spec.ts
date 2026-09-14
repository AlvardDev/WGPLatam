import { test, expect } from "@playwright/test";

test("la página de login muestra el formulario", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible();
  await expect(page.getByLabel("Correo")).toBeVisible();
  await expect(page.getByLabel("Contraseña")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ingresar" })).toBeVisible();
});

test("un vendedor no autenticado que visita /admin es redirigido a /login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login/);
});

test("un vendedor no autenticado que visita /tienda es redirigido a /login", async ({ page }) => {
  await page.goto("/tienda");
  await expect(page).toHaveURL(/\/login/);
});

test("la ruta raíz redirige a /login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
});
