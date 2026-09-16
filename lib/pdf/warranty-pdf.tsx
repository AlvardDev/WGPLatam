import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Documento puro: no toca la base de datos ni Supabase. Toma exactamente el
// snapshot histórico de la garantía (nunca datos vigentes de producto/lote),
// para que el PDF sea reproducible a partir de lo que ya está congelado en
// "warranties" — ver docs/ARCHITECTURE.md, "PDF".
//
// Sin logo embebido: app_settings.logo_path apunta al bucket de Storage
// "branding", pero ningún proyecto real todavía tiene un logo cargado para
// probar el embed contra datos reales — se deja fuera para no afirmar que
// funciona sin haberlo verificado. Agregar cuando haya un logo real que
// probar (ver docs/PHASE-6-REVIEW.md, DEFERRED).
export type WarrantyPdfData = {
  company: {
    name: string;
    legalName: string;
    legalId: string;
    address: string | null;
    phone: string | null;
    email: string | null;
  };
  support: {
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
  store: { name: string; code: string };
  product: { name: string; code: string };
  serial: string;
  barcode: string;
  lotCode: string;
  activatedAt: string;
  expiresAt: string;
  durationDays: number;
  storeAttentionDays: number;
  conditions: string;
  exclusions: string[];
  customer: { name: string; nationalId: string; whatsapp: string };
  voidedAt: string | null;
  voidedReason: string | null;
  issuedAt: string;
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  voidedBanner: {
    backgroundColor: "#fee2e2",
    color: "#991b1b",
    padding: 8,
    marginBottom: 16,
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  header: { marginBottom: 16, borderBottom: "1 solid #ccc", paddingBottom: 8 },
  companyName: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  small: { fontSize: 9, color: "#555" },
  title: { fontSize: 14, fontFamily: "Helvetica-Bold", marginBottom: 10 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 6, color: "#333" },
  row: { flexDirection: "row", marginBottom: 4 },
  label: { width: 140, color: "#555" },
  value: { flex: 1, fontFamily: "Helvetica-Bold" },
  paragraph: { marginBottom: 4, lineHeight: 1.4 },
  footer: { marginTop: 24, paddingTop: 8, borderTop: "1 solid #ccc", fontSize: 8, color: "#777" },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export function WarrantyPdfDocument(data: WarrantyPdfData) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {data.voidedAt && (
          <Text style={styles.voidedBanner}>
            GARANTÍA ANULADA el {data.voidedAt}
            {data.voidedReason ? ` — Motivo: ${data.voidedReason}` : ""}
          </Text>
        )}

        <View style={styles.header}>
          <Text style={styles.companyName}>{data.company.name}</Text>
          <Text style={styles.small}>
            {data.company.legalName} {data.company.legalId ? `· ${data.company.legalId}` : ""}
          </Text>
          {data.company.address && <Text style={styles.small}>{data.company.address}</Text>}
          <Text style={styles.small}>
            {[data.company.phone, data.company.email].filter(Boolean).join(" · ")}
          </Text>
        </View>

        <Text style={styles.title}>Comprobante de garantía</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Producto</Text>
          <Row label="Producto" value={`${data.product.name} (${data.product.code})`} />
          <Row label="Serial" value={data.serial} />
          <Row label="Código de barras" value={data.barcode} />
          <Row label="Lote" value={data.lotCode} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Garantía</Text>
          <Row label="Tienda" value={`${data.store.name} (${data.store.code})`} />
          <Row label="Fecha de activación" value={data.activatedAt} />
          <Row label="Duración" value={`${data.durationDays} días`} />
          <Row label="Vence" value={data.expiresAt} />
          <Row label="Atención en tienda" value={`Primeros ${data.storeAttentionDays} días desde la activación`} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cliente</Text>
          <Row label="Nombre" value={data.customer.name} />
          <Row label="Identificación" value={data.customer.nationalId} />
          <Row label="WhatsApp" value={data.customer.whatsapp} />
        </View>

        {data.conditions && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Condiciones</Text>
            <Text style={styles.paragraph}>{data.conditions}</Text>
          </View>
        )}

        {data.exclusions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Exclusiones</Text>
            {data.exclusions.map((e) => (
              <Text key={e} style={styles.paragraph}>
                • {e}
              </Text>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Soporte</Text>
          <Text style={styles.paragraph}>
            {[data.support.email, data.support.phone, data.support.whatsapp].filter(Boolean).join(" · ") || "—"}
          </Text>
        </View>

        <Text style={styles.footer}>
          Este documento contiene datos personales del cliente; consérvalo de forma segura. Emitido el {data.issuedAt}.
        </Text>
      </Page>
    </Document>
  );
}
