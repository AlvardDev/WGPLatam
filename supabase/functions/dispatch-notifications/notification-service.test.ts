import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEmail, processPending, type NotificationRow, type WarrantySummary } from "./notification-service.ts";

Deno.test("buildEmail: warranty_activated includes product and serial", () => {
  const warranty: WarrantySummary = {
    product_name: "Producto X",
    serial: "SER-1",
    customer_name: "Ana",
    activated_at: "hoy",
    store_name: "Tienda A",
  };
  const { subject, html } = buildEmail("warranty_activated", warranty);
  assertEquals(subject.includes("SER-1"), true);
  assertEquals(html.includes("Producto X"), true);
});

Deno.test("buildEmail: unknown type without warranty data still returns something sendable", () => {
  const { subject, html } = buildEmail("something_else", null);
  assertEquals(subject.includes("something_else"), true);
  assertEquals(html.length > 0, true);
});

Deno.test("processPending: sends each claimed notification and marks the real outcome (sent/failed)", async () => {
  const notifications: NotificationRow[] = [
    { id: 1, type: "warranty_activated", recipient: "a@test.local", payload: { warranty_id: "w1" } },
    { id: 2, type: "warranty_activated", recipient: "b@test.local", payload: { warranty_id: "w2" } },
  ];
  const completed: { id: number; ok: boolean; error: string | null }[] = [];

  const result = await processPending({
    claim: () => Promise.resolve(notifications),
    complete: (id, ok, error) => {
      completed.push({ id, ok, error });
      return Promise.resolve();
    },
    getWarranty: (id) =>
      Promise.resolve({ product_name: "P", serial: id, customer_name: "C", activated_at: "hoy", store_name: "T" }),
    getFrom: () => Promise.resolve({ from: "no-reply@test.local" }),
    // El segundo envío falla a propósito, para ejercitar el camino FAILED
    // sin marcar nunca SENT sin confirmación real del proveedor.
    send: (to) =>
      Promise.resolve(to === "b@test.local" ? { ok: false, error: "boom" } : { ok: true, providerId: "x" }),
  });

  assertEquals(result, { processed: 2, sent: 1, failed: 1 });
  assertEquals(completed, [
    { id: 1, ok: true, error: null },
    { id: 2, ok: false, error: "boom" },
  ]);
});

Deno.test("processPending: an empty claim never calls send", async () => {
  let sendCalls = 0;
  const result = await processPending({
    claim: () => Promise.resolve([]),
    complete: () => Promise.resolve(),
    getWarranty: () => Promise.resolve(null),
    getFrom: () => Promise.resolve({ from: "no-reply@test.local" }),
    send: () => {
      sendCalls++;
      return Promise.resolve({ ok: true, providerId: "x" });
    },
  });
  assertEquals(result, { processed: 0, sent: 0, failed: 0 });
  assertEquals(sendCalls, 0);
});
