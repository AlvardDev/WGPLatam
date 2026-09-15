import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Reporte de errores bajo demanda, con la sesión del usuario (RLS decide):
// mismo patrón que el futuro comprobante PDF de Fase 6, no un archivo
// generado y guardado. Pagina por keyset (row_number) en vez de cargar todo
// en memoria — un archivo con cientos de miles de errores no debería tumbar
// el servidor al generarlo.
const PAGE_SIZE = 2000;

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: imp } = await supabase.from("serial_imports").select("id, file_name").eq("id", id).single();
  if (!imp) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let cursor = 0;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("fila,serial,codigo_barras,estado,motivo\n"));
    },
    async pull(controller) {
      const { data, error } = await supabase
        .from("serial_import_rows")
        .select("row_number, serial, barcode, status, error_code")
        .eq("import_id", id)
        .neq("status", "VALID")
        .neq("status", "COMMITTED")
        .gt("row_number", cursor)
        .order("row_number", { ascending: true })
        .limit(PAGE_SIZE);

      if (error || !data || data.length === 0) {
        controller.close();
        return;
      }

      const lines = data
        .map(
          (r) =>
            `${r.row_number},${csvEscape(r.serial)},${csvEscape(r.barcode)},${r.status},${csvEscape(r.error_code ?? "")}`,
        )
        .join("\n");
      controller.enqueue(encoder.encode(lines + "\n"));
      cursor = data[data.length - 1].row_number;
      if (data.length < PAGE_SIZE) controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="errores-${imp.file_name}.csv"`,
    },
  });
}
