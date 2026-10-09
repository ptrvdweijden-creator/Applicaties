import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Platform, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, API_BASE, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, StateView } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";

type Row = {
  row: number;
  Artikelcode: string;
  Artikelnaam: string;
  Artikelbeschrijving: string;
  Hoeveelheid: number | null;
  Categorie: string;
  Minimumhoeveelheid: number | null;
  errors: string[];
  valid: boolean;
};
type Preview = { filename: string; rows: Row[]; valid_count: number; invalid_count: number };
type Result = { added_count: number; skipped: { row: number; article_number: string; reason: string }[] };

const COLUMNS = ["Artikelnaam", "Artikelcode", "Artikelbeschrijving", "Hoeveelheid", "Categorie", "Minimumhoeveelheid"];
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function ImportScreen() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isAdmin) return <Redirect href="/" />;

  const template = () => Linking.openURL(`${API_BASE}/import/articles/template`);

  const pick = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: [XLSX, ".xlsx"], copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (!asset.name.toLowerCase().endsWith(".xlsx")) return setError("Kies een Excelbestand met extensie .xlsx");
    setBusy(true);
    try {
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
        form.append("file", blob, asset.name);
      } else {
        form.append("file", { uri: asset.uri, name: asset.name, type: XLSX } as any);
      }
      setPreview(await api<Preview>("/import/articles/preview", { form }));
      setResult(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const rows = preview.rows.filter((r) => r.valid).map(({ errors, valid, ...r }) => r);
      const res = await api<Result>("/import/articles/commit", { method: "POST", body: { filename: preview.filename, rows } });
      const previewSkipped = preview.rows
        .filter((r) => !r.valid)
        .map((r) => ({ row: r.row, article_number: r.Artikelcode, reason: r.errors.join("; ") }));
      setResult({ added_count: res.added_count, skipped: [...previewSkipped, ...res.skipped].sort((a, b) => a.row - b.row) });
      setPreview(null);
      await qc.invalidateQueries();
      toast(`${res.added_count} artikelen geïmporteerd`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setPreview(null);
    setResult(null);
    setError(null);
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={[styles.inner, { paddingBottom: spacing.xl }]}>
        {result ? (
          <View style={{ gap: spacing.lg }} testID="import-result">
            <View style={[styles.card, styles.successCard]}>
              <Ionicons name="checkmark-circle" size={32} color={colors.onSuccessSoft} />
              <Text style={styles.bigNum} testID="import-added-count">
                {result.added_count}
              </Text>
              <Text style={styles.successText}>{result.added_count === 1 ? "artikel succesvol toegevoegd" : "artikelen succesvol toegevoegd"}</Text>
            </View>
            {result.skipped.length > 0 && (
              <View style={styles.card} testID="import-skipped">
                <Text style={styles.cardTitle}>{result.skipped.length} regel(s) overgeslagen</Text>
                {result.skipped.map((s) => (
                  <View key={`${s.row}-${s.article_number}`} style={styles.errRow}>
                    <Text style={styles.rowNo}>Regel {s.row}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.code}>{s.article_number || "(geen code)"}</Text>
                      <Text style={styles.errText}>{s.reason}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : preview ? (
          <View style={{ gap: spacing.lg }} testID="import-preview">
            <View style={styles.card}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {preview.filename}
              </Text>
              <View style={styles.counts}>
                <View style={[styles.count, { backgroundColor: colors.successSoft }]} testID="import-valid-count">
                  <Text style={[styles.countNum, { color: colors.onSuccessSoft }]}>{preview.valid_count}</Text>
                  <Text style={[styles.countLabel, { color: colors.onSuccessSoft }]}>Klaar voor import</Text>
                </View>
                <View style={[styles.count, { backgroundColor: preview.invalid_count ? colors.errorSoft : colors.surfaceTertiary }]} testID="import-invalid-count">
                  <Text style={[styles.countNum, { color: preview.invalid_count ? colors.onErrorSoft : colors.muted }]}>{preview.invalid_count}</Text>
                  <Text style={[styles.countLabel, { color: preview.invalid_count ? colors.onErrorSoft : colors.muted }]}>Met fouten (overslaan)</Text>
                </View>
              </View>
              <Text style={styles.hint}>Er is nog niets opgeslagen. Controleer de regels en bevestig de import. Hoeveelheid wordt de beginvoorraad.</Text>
            </View>

            {preview.rows.map((r) => (
              <View key={r.row} style={[styles.prow, !r.valid && { borderColor: colors.error }]} testID={`import-row-${r.row}`}>
                <View style={styles.prowHead}>
                  <Text style={styles.rowNo}>Regel {r.row}</Text>
                  <Ionicons name={r.valid ? "checkmark-circle" : "close-circle"} size={18} color={r.valid ? colors.success : colors.error} />
                </View>
                <Text style={styles.code}>{r.Artikelcode || "—"}</Text>
                <Text style={styles.pname}>{r.Artikelnaam || "—"}</Text>
                {!!r.Artikelbeschrijving && <Text style={styles.hint}>{r.Artikelbeschrijving}</Text>}
                <Text style={styles.meta}>
                  {r.Categorie || "—"} · Beginvoorraad {r.Hoeveelheid ?? "—"} · Min. {r.Minimumhoeveelheid ?? "—"}
                </Text>
                {r.errors.map((e) => (
                  <Text key={e} style={styles.errText}>
                    • {e}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        ) : (
          <View style={{ gap: spacing.lg }}>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Artikelen importeren uit Excel</Text>
              <Text style={styles.step}>1. Download het voorbeeldbestand en vul per regel één artikel in.</Text>
              <Text style={styles.step}>2. Upload het ingevulde .xlsx-bestand.</Text>
              <Text style={styles.step}>3. Controleer het voorbeeld en bevestig. Pas dan wordt er opgeslagen.</Text>
              <View style={styles.colBox}>
                {COLUMNS.map((c) => (
                  <Text key={c} style={styles.colName}>
                    {c}
                    {c === "Artikelbeschrijving" ? " (optioneel)" : ""}
                  </Text>
                ))}
              </View>
              <Text style={styles.hint}>
                Hoeveelheid wordt de beginvoorraad. Bestaande artikelcodes worden niet overschreven. Categorieën (bijv. Chroom, Inox, Black Edition) zijn vrij in te vullen.
              </Text>
            </View>
            <Button testID="import-template-button" title="Download voorbeeldbestand" icon="download-outline" variant="secondary" onPress={template} />
            <Button testID="import-pick-button" title="Kies Excelbestand (.xlsx)" icon="document-attach-outline" loading={busy} onPress={pick} />
          </View>
        )}
        {error && (
          <View style={styles.errorBox} testID="import-error">
            <Ionicons name="alert-circle" size={18} color={colors.onErrorSoft} />
            <Text style={styles.errorBoxText}>{error}</Text>
          </View>
        )}
        {preview && preview.rows.length === 0 && <StateView icon="document-outline" title="Geen regels gevonden" />}
      </ScrollView>

      {(preview || result) && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.footerInner}>
            {preview ? (
              <>
                <Button testID="import-cancel-button" title="Annuleren" variant="ghost" style={{ flex: 1 }} onPress={reset} />
                <Button
                  testID="import-confirm-button"
                  title={`Importeer ${preview.valid_count}`}
                  icon="checkmark"
                  style={{ flex: 2 }}
                  disabled={preview.valid_count === 0}
                  loading={busy}
                  onPress={commit}
                />
              </>
            ) : (
              <>
                <Button testID="import-again-button" title="Nog een bestand" variant="ghost" style={{ flex: 1 }} onPress={reset} />
                <Button testID="import-to-articles-button" title="Naar artikelen" style={{ flex: 1 }} onPress={() => router.replace("/artikelen")} />
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 720, alignSelf: "center", padding: spacing.lg, gap: spacing.lg },
  card: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.sm },
  cardTitle: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface },
  step: { fontSize: fontSize.base, color: c.onSurfaceTertiary },
  colBox: { backgroundColor: c.surfaceTertiary, borderRadius: radius.sm, padding: spacing.md, gap: 4, marginVertical: spacing.xs },
  colName: { fontFamily: mono, fontSize: fontSize.sm, color: c.onSurface },
  hint: { fontSize: fontSize.sm, color: c.muted },
  counts: { flexDirection: "row", gap: spacing.sm, marginVertical: spacing.xs },
  count: { flex: 1, borderRadius: radius.md, padding: spacing.md },
  countNum: { fontFamily: mono, fontSize: 24, fontWeight: "700" },
  countLabel: { fontSize: fontSize.sm, fontWeight: "600" },
  prow: { backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  prowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowNo: { fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase" },
  code: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  pname: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  meta: { fontSize: fontSize.sm, color: c.onSurfaceTertiary },
  errText: { fontSize: fontSize.sm, color: c.error, fontWeight: "500" },
  errRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: c.divider },
  successCard: { backgroundColor: c.successSoft, borderColor: c.successSoft, alignItems: "center" },
  bigNum: { fontFamily: mono, fontSize: 40, fontWeight: "700", color: c.onSuccessSoft },
  successText: { fontSize: fontSize.lg, color: c.onSuccessSoft, fontWeight: "600" },
  errorBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: c.errorSoft, padding: spacing.md, borderRadius: radius.md },
  errorBoxText: { color: c.onErrorSoft, fontSize: fontSize.base, flex: 1, fontWeight: "500" },
  footer: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  footerInner: { width: "100%", maxWidth: 640, alignSelf: "center", flexDirection: "row", gap: spacing.sm },
}));
