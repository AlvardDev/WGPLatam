import { createClient } from "npm:@supabase/supabase-js@2";
import { sendEmail } from "./email-provider.ts";
import { processPending, type NotificationRow, type WarrantySummary } from "./notification-service.ts";

// Invocada por pg_cron + pg_net cada minuto (ver docs/ARCHITECTURE.md,
// "Notificaciones") con la clave de servicio del proyecto. El runtime de
// Edge Functions exige un JWT válido por defecto (verify_jwt); no hace
// falta una comprobación manual adicional aquí. claim_notifications/
// complete_notification están otorgadas únicamente a service_role — esta es
// la única pieza del sistema con esa clave (además de lib/supabase/admin.ts
// en Next, que nunca la usa para esto).
Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const result = await processPending({
    claim: async (batchSize) => {
      const { data, error } = await supabase.rpc("claim_notifications", { p_batch_size: batchSize });
      if (error) throw error;
      return (data ?? []) as NotificationRow[];
    },
    complete: async (id, ok, error) => {
      const { error: rpcError } = await supabase.rpc("complete_notification", { p_id: id, p_ok: ok, p_error: error });
      if (rpcError) throw rpcError;
    },
    getWarranty: async (warrantyId): Promise<WarrantySummary | null> => {
      const { data } = await supabase
        .from("warranties")
        .select("product_name, serial, customer_name, activated_at, stores(name)")
        .eq("id", warrantyId)
        .single();
      if (!data) return null;
      const store = data.stores as { name: string } | null;
      return {
        product_name: data.product_name,
        serial: data.serial,
        customer_name: data.customer_name,
        activated_at: new Date(data.activated_at).toLocaleString("es"),
        store_name: store?.name ?? "—",
      };
    },
    getFrom: async () => {
      const { data } = await supabase
        .from("notification_settings")
        .select("from_email, from_name")
        .eq("id", true)
        .single();
      const email = data?.from_email || "onboarding@resend.dev";
      return { from: data?.from_name ? `${data.from_name} <${email}>` : email };
    },
    send: sendEmail,
  });

  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
