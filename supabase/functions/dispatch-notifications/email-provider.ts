// EmailProvider: adaptador aislado (~20 líneas). La lógica de negocio nunca
// importa el SDK de Resend directamente — solo conoce NotificationService,
// que a su vez solo conoce esta función. Cambiar de proveedor implica
// reemplazar únicamente este archivo. Ver docs/ARCHITECTURE.md,
// "Notificaciones".
export type SendResult = { ok: true; providerId: string } | { ok: false; error: string };

export async function sendEmail(to: string, from: string, subject: string, html: string): Promise<SendResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY is not configured" };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `Resend ${res.status}: ${text.slice(0, 300)}` };
  }
  const data = await res.json();
  return { ok: true, providerId: data.id };
}
