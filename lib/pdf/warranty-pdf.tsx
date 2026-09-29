import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

// Documento puro: no toca la base de datos ni Supabase. Toma exactamente el
// snapshot histórico de la garantía (nunca datos vigentes de producto/lote),
// para que el PDF sea reproducible a partir de lo que ya está congelado en
// "warranties" — ver docs/ARCHITECTURE.md, "PDF".
//
// Logo: el de la app (public/wgp-logo.png) sobre una placa blanca en la franja azul
// noche). El logo propio de cada empresa (app_settings.logo_path, bucket
// "branding") sigue sin implementarse — ver docs/PHASE-6-REVIEW.md, DEFERRED.
export type WarrantyPdfData = {
  folio: string;
  /** data: URI del PNG (más portable que un Buffer entre entornos). */
  logo: string | null;
  status: { label: string; tone: "ok" | "warn" | "bad" | "muted" };
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
  barcode: string | null;
  lotCode: string;
  activatedAt: string;
  expiresAt: string;
  duration: string;
  storeAttentionDays: number;
  conditions: string;
  exclusions: string[];
  customer: { name: string; nationalId: string; whatsapp: string };
  voidedAt: string | null;
  voidedReason: string | null;
  issuedAt: string;
};

const NAVY = "#0a1128";
const BLUE = "#2563eb";
const INK = "#1e293b";
const MUTED = "#64748b";
const SOFT = "#f1f5f9";

const TONE = {
  ok: { bg: "#dcfce7", fg: "#166534" },
  warn: { bg: "#fef3c7", fg: "#92400e" },
  bad: { bg: "#fee2e2", fg: "#991b1b" },
  muted: { bg: "#e2e8f0", fg: "#475569" },
} as const;

const styles = StyleSheet.create({
  page: { paddingBottom: 56, fontSize: 9.5, fontFamily: "Helvetica", color: INK },
  band: {
    backgroundColor: NAVY,
    paddingHorizontal: 36,
    paddingVertical: 22,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logoChip: { backgroundColor: "#ffffff", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  logo: { height: 30, width: 47 },
  bandRight: { alignItems: "flex-end" },
  bandTitle: { color: "#ffffff", fontSize: 15, fontFamily: "Helvetica-Bold" },
  bandSub: { color: "#93c5fd", fontSize: 8.5, marginTop: 3, letterSpacing: 1 },
  body: { paddingHorizontal: 36, paddingTop: 22 },
  voidedBanner: {
    backgroundColor: TONE.bad.bg,
    color: TONE.bad.fg,
    padding: 9,
    marginBottom: 14,
    borderRadius: 6,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  productName: { fontSize: 17, fontFamily: "Helvetica-Bold", color: INK },
  productCode: { fontSize: 9, color: MUTED, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, fontSize: 9, fontFamily: "Helvetica-Bold" },
  facts: { flexDirection: "row", gap: 8, marginBottom: 18 },
  fact: { flex: 1, backgroundColor: SOFT, borderRadius: 8, padding: 10 },
  factLabel: { fontSize: 7.5, color: MUTED, textTransform: "uppercase", letterSpacing: 0.8 },
  factValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 3, color: INK },
  cols: { flexDirection: "row", gap: 14, marginBottom: 14 },
  card: { flex: 1, border: "1 solid #e2e8f0", borderRadius: 8, padding: 12 },
  cardFull: { border: "1 solid #e2e8f0", borderRadius: 8, padding: 12, marginBottom: 14 },
  sectionTitle: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: BLUE,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: { flexDirection: "row", marginBottom: 5 },
  label: { width: 88, color: MUTED },
  value: { flex: 1, fontFamily: "Helvetica-Bold" },
  block: { marginBottom: 14 },
  paragraph: { lineHeight: 1.45, color: "#334155" },
  bullet: { flexDirection: "row", marginBottom: 1 },
  bulletDot: { width: 10, color: BLUE },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    borderTop: "1 solid #e2e8f0",
    paddingTop: 8,
    fontSize: 7.5,
    color: MUTED,
    flexDirection: "row",
    justifyContent: "space-between",
  },
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export function WarrantyPdfDocument(data: WarrantyPdfData) {
  const tone = TONE[data.status.tone];
  const support = [data.support.email, data.support.phone, data.support.whatsapp].filter(Boolean).join(" · ");
  const companyLine = [data.company.legalName, data.company.legalId].filter(Boolean).join(" · ");

  return (
    <Document title={`Garantía ${data.serial}`} author={data.company.name}>
      <Page size="A4" style={styles.page}>
        <View style={styles.band}>
          {data.logo ? (
            <View style={styles.logoChip}>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf, no <img> */}
              <Image src={data.logo} style={styles.logo} />
            </View>
          ) : (
            <Text style={styles.bandTitle}>{data.company.name}</Text>
          )}
          <View style={styles.bandRight}>
            <Text style={styles.bandTitle}>Comprobante de garantía</Text>
            <Text style={styles.bandSub}>FOLIO {data.folio}</Text>
          </View>
        </View>

        <View style={styles.body}>
          {data.voidedAt && (
            <Text style={styles.voidedBanner}>
              GARANTÍA ANULADA el {data.voidedAt}
              {data.voidedReason ? ` — Motivo: ${data.voidedReason}` : ""}
            </Text>
          )}

          <View style={styles.topRow}>
            <View>
              <Text style={styles.productName}>{data.product.name}</Text>
              <Text style={styles.productCode}>Código {data.product.code}</Text>
            </View>
            <Text style={[styles.pill, { backgroundColor: tone.bg, color: tone.fg }]}>{data.status.label}</Text>
          </View>

          <View style={styles.facts}>
            <Fact label="Activación" value={data.activatedAt} />
            <Fact label="Duración" value={data.duration} />
            <Fact label="Vence" value={data.expiresAt} />
          </View>

          <View style={styles.cols}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Producto</Text>
              <Row label="Serial" value={data.serial} />
              <Row label="Código de barras" value={data.barcode ?? "—"} />
              <Row label="Lote" value={data.lotCode} />
              <Row label="Tienda" value={`${data.store.name} (${data.store.code})`} />
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Cliente</Text>
              <Row label="Nombre" value={data.customer.name} />
              <Row label="Identificación" value={data.customer.nationalId} />
              <Row label="WhatsApp" value={data.customer.whatsapp} />
            </View>
          </View>

          <View style={styles.cardFull}>
            <Text style={styles.sectionTitle}>Atención</Text>
            <Text style={styles.paragraph}>
              Durante los primeros {data.storeAttentionDays} días desde la activación, la atención es directamente en la
              tienda. Después, contacta a soporte{support ? `: ${support}` : "."}
            </Text>
          </View>

          {data.conditions ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>Condiciones</Text>
              <Text style={styles.paragraph}>{data.conditions}</Text>
            </View>
          ) : null}

          {data.exclusions.length > 0 ? (
            <View style={styles.block}>
              <Text style={styles.sectionTitle}>No cubre</Text>
              {data.exclusions.map((e) => (
                <View key={e} style={styles.bullet}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={[styles.paragraph, { flex: 1 }]}>{e}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.footer} fixed>
          <Text>
            {data.company.name}
            {companyLine ? ` · ${companyLine}` : ""}
            {data.company.address ? ` · ${data.company.address}` : ""}
          </Text>
          <Text>Emitido el {data.issuedAt} · Contiene datos personales: consérvalo seguro.</Text>
        </View>
      </Page>
    </Document>
  );
}
