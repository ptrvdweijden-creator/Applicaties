import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ArticleLinesEditor, EditLine } from "@/src/components/ArticleLinesEditor";
import { Button, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { SupplierOrder } from "@/src/types";

const today = () => new Date().toISOString().slice(0, 10);
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export default function OrderForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const { isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [num, setNum] = useState("");
  const [supplier, setSupplier] = useState("China");
  const [orderDate, setOrderDate] = useState(today());
  const [expected, setExpected] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const existing = useQuery({ queryKey: ["supplier-order", id], queryFn: () => api<SupplierOrder>(`/supplier-orders/${id}`), enabled: editing });
  useEffect(() => {
    const o = existing.data;
    if (o) {
      setNum(o.order_number);
      setSupplier(o.supplier);
      setOrderDate(o.order_date);
      setExpected(o.expected_date ?? "");
      setNote(o.note);
      setLines(
        o.lines.map((l) => ({
          key: l.line_id,
          line_id: l.line_id,
          article: { id: l.article_id, article_number: l.article_number, title: l.article_description, unit: l.unit },
          quantity: String(l.ordered),
          min: l.received > 0 ? l.received : undefined,
        })),
      );
    }
  }, [existing.data]);

  if (!isAdmin) return <Redirect href="/" />;

  const save = async () => {
    setError(null);
    if (!num.trim()) return setError("Vul een bestelnummer of referentie in");
    if (!DATE_RX.test(orderDate)) return setError("Besteldatum moet het formaat JJJJ-MM-DD hebben");
    if (expected && !DATE_RX.test(expected)) return setError("Verwachte leverdatum moet het formaat JJJJ-MM-DD hebben");
    if (lines.length === 0) return setError("Voeg minimaal één artikel toe");
    const bad = lines.find((l) => !/^\d+$/.test(l.quantity) || parseInt(l.quantity, 10) < Math.max(1, l.min ?? 0));
    if (bad) return setError(`Ongeldig aantal voor ${bad.article.article_number}`);
    const body = {
      order_number: num,
      supplier,
      order_date: orderDate,
      expected_date: expected,
      note,
      lines: lines.map((l) => ({ line_id: l.line_id, article_id: l.article.id, quantity: parseInt(l.quantity, 10) })),
    };
    setSaving(true);
    try {
      const o = editing
        ? await api<SupplierOrder>(`/supplier-orders/${id}`, { method: "PATCH", body: { ...body, version: existing.data!.version } })
        : await api<SupplierOrder>("/supplier-orders", { method: "POST", body });
      toast(editing ? "Bestelling bijgewerkt" : `Bestelling ${o.order_number} geregistreerd`);
      await qc.invalidateQueries();
      if (editing) router.back();
      else router.replace(`/bestelling/${o.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (editing && existing.isLoading) return <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: editing ? "Bestelling bewerken" : "Nieuwe bestelling" }} />
      <KeyboardAwareScrollView contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={styles.section}>
          <Input testID="order-number-input" label="Bestelnummer / referentie" value={num} onChangeText={setNum} placeholder="Bijv. CN-2026-031" autoCapitalize="characters" />
          <Input testID="order-supplier-input" label="Leverancier" value={supplier} onChangeText={setSupplier} />
          <View style={{ flexDirection: "row", gap: spacing.md }}>
            <View style={{ flex: 1 }}>
              <Input testID="order-date-input" label="Besteldatum" value={orderDate} onChangeText={setOrderDate} placeholder="JJJJ-MM-DD" maxLength={10} />
            </View>
            <View style={{ flex: 1 }}>
              <Input testID="order-expected-input" label="Verwacht (optioneel)" value={expected} onChangeText={setExpected} placeholder="JJJJ-MM-DD" maxLength={10} />
            </View>
          </View>
          <Input testID="order-note-input" label="Opmerking (optioneel)" value={note} onChangeText={setNote} />
        </View>
        <Text style={styles.sectionTitle}>Bestelde artikelen</Text>
        <View style={styles.section}>
          <ArticleLinesEditor lines={lines} onChange={setLines} mode="order" />
          <Text style={styles.hint}>Bestelde aantallen tellen pas mee in de voorraad nadat ze zijn binnengeboekt.</Text>
        </View>
        {error && (
          <Text style={styles.error} testID="order-form-error">
            {error}
          </Text>
        )}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Button testID="order-save-button" title={editing ? "Opslaan" : "Bestelling registreren"} icon="checkmark" loading={saving} onPress={save} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 720, alignSelf: "center", paddingTop: spacing.lg, gap: spacing.md },
  section: { marginHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.lg },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  hint: { fontSize: fontSize.sm, color: c.muted },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500", paddingHorizontal: spacing.lg },
}));
