import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgXml } from "react-native-svg";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Chip, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article } from "@/src/types";

const MAX_BYTES = 512 * 1024;

/** Leest de leesbare tekst(en) uit een barcode-SVG als suggestie. Wordt nooit automatisch overgenomen. */
function textSuggestions(svg: string): string[] {
  const out: string[] = [];
  for (const m of svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/gi)) {
    const t = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, "").trim();
    if (t && t.length <= 100 && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 4);
}

function SvgPreview({ xml, testID }: { xml: string; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.preview} testID={testID}>
      <SvgXml xml={xml} width="100%" height="100%" />
    </View>
  );
}

export function BarcodeSvgSection({ article }: { article: Article }) {
  const { isAdmin } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const qc = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const meta = article.barcode_svg;

  const svg = useQuery({
    queryKey: ["barcode-svg", article.id, meta?.version],
    queryFn: () => api<{ svg: string; barcode_value: string }>(`/articles/${article.id}/barcode-svg`),
    enabled: !!meta,
    staleTime: Infinity,
  });

  const remove = async () => {
    setDeleting(true);
    try {
      await api(`/articles/${article.id}/barcode-svg`, { method: "DELETE" });
      await qc.invalidateQueries({ queryKey: ["article", article.id] });
      toast("SVG-barcode verwijderd");
      setConfirmDelete(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <View style={styles.card} testID="barcode-svg-section">
      {meta ? (
        <>
          {svg.isLoading ? (
            <View style={[styles.preview, { alignItems: "center", justifyContent: "center" }]}>
              <ActivityIndicator color={colors.brandPrimary} />
            </View>
          ) : svg.isError ? (
            <Text style={styles.error}>{errorMessage(svg.error)}</Text>
          ) : (
            <SvgPreview xml={svg.data!.svg} testID="barcode-svg-image" />
          )}
          <View style={styles.valueRow}>
            <Text style={styles.valueLabel}>Gecodeerde waarde</Text>
            <Text style={styles.value} testID="barcode-svg-value">
              {meta.barcode_value}
            </Text>
          </View>
          <Text style={styles.hint} numberOfLines={1}>
            Bestand: {meta.filename}
          </Text>
          {isAdmin &&
            (confirmDelete ? (
              <View style={styles.confirm} testID="barcode-svg-delete-confirm">
                <Text style={styles.confirmText}>SVG-afbeelding verwijderen? De barcodewaarde blijft bij het artikel, zodat scannen blijft werken.</Text>
                <View style={styles.actions}>
                  <Button testID="barcode-svg-delete-cancel" title="Annuleren" variant="ghost" compact style={{ flex: 1 }} onPress={() => setConfirmDelete(false)} />
                  <Button testID="barcode-svg-delete-confirm-button" title="Verwijderen" variant="danger" compact style={{ flex: 1 }} loading={deleting} onPress={remove} />
                </View>
              </View>
            ) : (
              <View style={styles.actions}>
                <Button testID="barcode-svg-replace-button" title="Vervangen" icon="swap-horizontal" variant="secondary" compact style={{ flex: 1 }} onPress={() => setSheet(true)} />
                <Button testID="barcode-svg-delete-button" title="Verwijderen" icon="trash-outline" variant="ghost" compact style={{ flex: 1 }} onPress={() => setConfirmDelete(true)} />
              </View>
            ))}
        </>
      ) : (
        <View style={{ gap: spacing.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
            <Ionicons name="image-outline" size={20} color={colors.muted} />
            <Text style={styles.hint}>Geen SVG-barcode gekoppeld.</Text>
          </View>
          {isAdmin && <Button testID="barcode-svg-upload-button" title="SVG-barcode uploaden" icon="cloud-upload-outline" variant="secondary" onPress={() => setSheet(true)} />}
        </View>
      )}
      {isAdmin && <UploadSheet article={article} visible={sheet} onClose={() => setSheet(false)} />}
    </View>
  );
}

function UploadSheet({ article, visible, onClose }: { article: Article; visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [file, setFile] = useState<{ name: string; svg: string } | null>(null);
  const [value, setValue] = useState(article.barcode_svg?.barcode_value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const suggestions = file ? textSuggestions(file.svg).filter((s) => !article.barcodes.includes(s)) : [];

  const close = () => {
    setFile(null);
    setError(null);
    setValue(article.barcode_svg?.barcode_value ?? "");
    onClose();
  };

  const pick = async () => {
    setError(null);
    const res = await DocumentPicker.getDocumentAsync({ type: ["image/svg+xml", ".svg"], copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    if (!asset.name.toLowerCase().endsWith(".svg")) return setError("Kies een SVG-bestand (.svg)");
    if (asset.size && asset.size > MAX_BYTES) return setError("SVG-bestand is groter dan 512 KB");
    try {
      const text = await (await fetch(asset.uri)).text();
      if (!/<svg[\s>]/i.test(text)) return setError("Dit bestand is geen geldige SVG-afbeelding");
      setFile({ name: asset.name, svg: text });
    } catch {
      setError("Bestand kon niet worden gelezen");
    }
  };

  const save = async () => {
    if (!file) return setError("Kies eerst een SVG-bestand");
    if (!value.trim()) return setError("Vul de barcodewaarde in die in deze barcode is gecodeerd");
    setSaving(true);
    setError(null);
    try {
      await api(`/articles/${article.id}/barcode-svg`, { method: "PUT", body: { filename: file.name, svg: file.svg, barcode_value: value.trim() } });
      await qc.invalidateQueries({ queryKey: ["article", article.id] });
      await qc.invalidateQueries({ queryKey: ["articles"] });
      toast("SVG-barcode gekoppeld");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="barcode-svg-sheet">
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sheetTitle}>SVG-barcode koppelen</Text>
              <Text style={styles.hint}>
                <Text style={{ fontFamily: mono }}>{article.article_number}</Text>
              </Text>
            </View>
            <Pressable testID="barcode-svg-sheet-close" onPress={close} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg }}>
            {file ? (
              <View style={{ gap: spacing.sm }}>
                <SvgPreview xml={file.svg} testID="barcode-svg-sheet-preview" />
                <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                  <Text style={[styles.hint, { flex: 1 }]} numberOfLines={1} testID="barcode-svg-filename">
                    {file.name}
                  </Text>
                  <Pressable testID="barcode-svg-pick-other" onPress={pick}>
                    <Text style={styles.link}>Ander bestand</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Button testID="barcode-svg-pick-button" title="Kies SVG-bestand" icon="document-outline" variant="secondary" onPress={pick} />
            )}

            <Input
              testID="barcode-svg-value-input"
              label="Barcodewaarde (gecodeerd in de barcode)"
              value={value}
              onChangeText={(t) => {
                setValue(t);
                setError(null);
              }}
              placeholder="Bijv. 8712345000011"
              autoCapitalize="none"
              autoCorrect={false}
              style={{ fontFamily: mono }}
              hint="Dit is de waarde die de scanner uitleest. Deze kan afwijken van de artikelcode."
            />
            {article.barcodes.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={styles.valueLabel}>Bestaande barcodes van dit artikel</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
                  {article.barcodes.map((b) => (
                    <Chip key={b} testID={`barcode-svg-existing-${b}`} label={b} selected={value === b} onPress={() => setValue(b)} />
                  ))}
                </ScrollView>
              </View>
            )}
            {suggestions.length > 0 && (
              <View style={{ gap: 6 }}>
                <Text style={styles.valueLabel}>Tekst gevonden in SVG (controleer zelf)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm }} keyboardShouldPersistTaps="handled">
                  {suggestions.map((b) => (
                    <Chip key={b} testID={`barcode-svg-suggestion-${b}`} label={b} selected={value === b} onPress={() => setValue(b)} />
                  ))}
                </ScrollView>
              </View>
            )}
            {error && (
              <Text style={styles.error} testID="barcode-svg-error">
                {error}
              </Text>
            )}
            <Button testID="barcode-svg-save-button" title="Opslaan" icon="checkmark" loading={saving} disabled={!file} onPress={save} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  card: { marginHorizontal: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, padding: spacing.lg, gap: spacing.md },
  preview: { height: 120, width: "100%", backgroundColor: "#FFFFFF", borderRadius: radius.sm, borderWidth: 1, borderColor: c.border, padding: spacing.sm, overflow: "hidden" },
  valueRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  valueLabel: { fontSize: fontSize.sm, fontWeight: "600", color: c.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  value: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface, flexShrink: 1 },
  hint: { fontSize: fontSize.sm, color: c.muted },
  link: { fontSize: fontSize.base, color: c.brandPrimary, fontWeight: "600" },
  actions: { flexDirection: "row", gap: spacing.sm },
  confirm: { gap: spacing.sm, backgroundColor: c.errorSoft, padding: spacing.md, borderRadius: radius.md },
  confirmText: { fontSize: fontSize.base, color: c.onErrorSoft },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500" },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, maxHeight: "90%", width: "100%", maxWidth: 640, alignSelf: "center" },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", marginBottom: spacing.lg },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
}));
