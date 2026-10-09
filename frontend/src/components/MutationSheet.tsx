import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, IconName, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { hapticError, hapticLight, hapticSuccess } from "@/src/haptics";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article, articleTitle, MUTATION_ICONS, MUTATION_LABELS, MutationType, newRequestId } from "@/src/types";

const TYPES: MutationType[] = ["afboeken", "ontvangst", "retour", "correctie"];
const HINTS: Record<MutationType, string> = {
  afboeken: "Beslag meegenomen door monteur of verbruikt",
  ontvangst: "Levering ontvangen van leverancier",
  retour: "Beslag komt terug in het magazijn",
  correctie: "Voer de getelde voorraad in na een fysieke telling",
};

export function MutationSheet({ article, visible, onClose }: { article: Article; visible: boolean; onClose: () => void }) {
  const { canMutate } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const qc = useQueryClient();
  const allowed = TYPES.filter(canMutate);

  const [type, setType] = useState<MutationType>(allowed[0] ?? "afboeken");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());

  useEffect(() => {
    if (visible) {
      setType(allowed[0] ?? "afboeken");
      setQty("1");
      setNote("");
      setError(null);
      setRequestId(newRequestId());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectType = (t: MutationType) => {
    hapticLight();
    setType(t);
    setError(null);
    setQty(t === "correctie" ? String(article.physical_stock) : "1");
    setRequestId(newRequestId());
  };

  const n = /^\d+$/.test(qty) ? parseInt(qty, 10) : NaN;
  const newStock = isNaN(n)
    ? null
    : type === "correctie"
      ? n
      : type === "afboeken"
        ? article.physical_stock - n
        : article.physical_stock + n;

  const step = (d: number) => {
    hapticLight();
    const cur = isNaN(n) ? 0 : n;
    setQty(String(Math.max(type === "correctie" ? 0 : 1, cur + d)));
    setError(null);
  };

  const submit = async () => {
    if (isNaN(n) || (type !== "correctie" && n <= 0)) {
      setError(type === "correctie" ? "Voer een geldig aantal in (0 of hoger)" : "Voer een geldig aantal in (minimaal 1)");
      return;
    }
    if (newStock !== null && newStock < 0) {
      setError(`Onvoldoende voorraad: er zijn ${article.physical_stock} ${article.unit} op voorraad`);
      hapticError();
      return;
    }
    if (type === "correctie" && n === article.physical_stock) {
      setError("Getelde voorraad is gelijk aan de huidige voorraad; geen correctie nodig");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api("/mutations", {
        method: "POST",
        body: { client_request_id: requestId, article_id: article.id, type, quantity: n, note },
      });
      hapticSuccess();
      toast(`${MUTATION_LABELS[type]} geboekt voor ${article.article_number}`);
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      hapticError();
      setError(errorMessage(e));
      // Na een afwijzing is een nieuwe poging een nieuwe boeking
      setRequestId(newRequestId());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} testID="mutation-sheet-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="mutation-sheet">
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Mutatie boeken</Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                <Text style={{ fontFamily: mono }}>{article.article_number}</Text> · {articleTitle(article)}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} testID="mutation-sheet-close" style={styles.close}>
              <Ionicons name="close" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg }}>
            <View style={styles.segment}>
              {allowed.map((t) => {
                const sel = t === type;
                return (
                  <Pressable
                    key={t}
                    testID={`mutation-type-${t}`}
                    onPress={() => selectType(t)}
                    style={[styles.segItem, sel && { backgroundColor: colors.surfaceSecondary, borderColor: colors.brandPrimary }]}
                  >
                    <Ionicons name={MUTATION_ICONS[t] as IconName} size={18} color={sel ? colors.brandPrimary : colors.muted} />
                    <Text style={[styles.segText, { color: sel ? colors.brandPrimary : colors.muted }]}>{MUTATION_LABELS[t]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.hint}>{HINTS[type]}</Text>

            <View style={{ gap: spacing.sm }}>
              <Text style={styles.label}>{type === "correctie" ? "Getelde voorraad" : "Aantal"} ({article.unit})</Text>
              <View style={styles.stepper}>
                <Pressable testID="mutation-qty-minus" onPress={() => step(-1)} style={styles.stepBtn}>
                  <Ionicons name="remove" size={26} color={colors.brandPrimary} />
                </Pressable>
                <TextInput
                  testID="mutation-qty-input"
                  value={qty}
                  onChangeText={(t) => {
                    setQty(t.replace(/[^0-9]/g, ""));
                    setError(null);
                  }}
                  keyboardType="number-pad"
                  style={styles.qtyInput}
                  selectTextOnFocus
                  maxLength={6}
                />
                <Pressable testID="mutation-qty-plus" onPress={() => step(1)} style={styles.stepBtn}>
                  <Ionicons name="add" size={26} color={colors.brandPrimary} />
                </Pressable>
              </View>
              <View style={styles.preview} testID="mutation-preview">
                <Text style={styles.previewLabel}>Huidig</Text>
                <Text style={styles.previewNum}>{article.physical_stock}</Text>
                <Ionicons name="arrow-forward" size={16} color={colors.muted} />
                <Text style={styles.previewLabel}>Nieuw</Text>
                <Text style={[styles.previewNum, newStock !== null && newStock < 0 && { color: colors.error }]}>{newStock ?? "–"}</Text>
              </View>
            </View>

            <Input
              testID="mutation-note-input"
              label="Toelichting (optioneel)"
              placeholder={type === "afboeken" ? "Bijv. project / adres klant" : "Bijv. pakbonnummer"}
              value={note}
              onChangeText={setNote}
              maxLength={500}
            />

            {error && (
              <View style={styles.errorBox} testID="mutation-error">
                <Ionicons name="alert-circle" size={18} color={colors.onErrorSoft} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Button testID="mutation-submit-button" title={`${MUTATION_LABELS[type]} bevestigen`} icon="checkmark" loading={saving} onPress={submit} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: {
    backgroundColor: c.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    maxHeight: "90%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  header: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  subtitle: { fontSize: fontSize.base, color: c.muted, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  segment: { flexDirection: "row", gap: spacing.xs, backgroundColor: c.surfaceTertiary, padding: spacing.xs, borderRadius: radius.md },
  segItem: { flex: 1, minHeight: 56, alignItems: "center", justifyContent: "center", gap: 2, borderRadius: radius.sm, borderWidth: 1.5, borderColor: "transparent" },
  segText: { fontSize: 12, fontWeight: "600" },
  hint: { fontSize: fontSize.base, color: c.onSurfaceTertiary, marginTop: -spacing.sm },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: c.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  qtyInput: {
    flex: 1,
    minWidth: 0,
    width: "100%",
    height: 60,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surfaceSecondary,
    textAlign: "center",
    fontSize: 28,
    fontWeight: "700",
    fontFamily: mono,
    color: c.onSurface,
  },
  preview: { flexDirection: "row", alignItems: "center", gap: spacing.sm, justifyContent: "center", paddingVertical: spacing.sm },
  previewLabel: { fontSize: fontSize.sm, color: c.muted },
  previewNum: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface, marginRight: spacing.sm },
  errorBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: c.errorSoft, padding: spacing.md, borderRadius: radius.md },
  errorText: { color: c.onErrorSoft, fontSize: fontSize.base, flex: 1, fontWeight: "500" },
}));
