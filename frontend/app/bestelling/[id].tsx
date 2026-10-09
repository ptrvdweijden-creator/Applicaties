import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Input, MutationRow, OrderStatusBadge, SectionTitle, StateView } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { hapticSuccess } from "@/src/haptics";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { newRequestId, SupplierOrder } from "@/src/types";

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [receiving, setReceiving] = useState(false);
  const q = useQuery({ queryKey: ["supplier-order", id], queryFn: () => api<SupplierOrder>(`/supplier-orders/${id}`) });
  const o = q.data;
  const hasOpen = !!o && o.lines.some((l) => l.open > 0);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: o?.order_number ?? "Bestelling",
          headerRight: () =>
            isAdmin && o ? (
              <Pressable testID="order-edit-button" onPress={() => router.push({ pathname: "/bestelling-form", params: { id } })} hitSlop={10} style={{ paddingHorizontal: spacing.sm }}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "600", fontSize: fontSize.lg }}>Bewerken</Text>
              </Pressable>
            ) : null,
        }}
      />
      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
      ) : !o ? (
        <StateView icon="alert-circle-outline" title="Bestelling niet gevonden" text={errorMessage(q.error)} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.inner, { paddingBottom: spacing.xl }]}
            refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
          >
            <View style={styles.top}>
              <OrderStatusBadge status={o.status} />
              <Text style={styles.title} testID="order-number">
                {o.order_number}
              </Text>
              <Text style={styles.meta}>
                {o.supplier} · besteld {o.order_date}
                {o.expected_date ? ` · verwacht ${o.expected_date}` : ""}
              </Text>
              {!!o.note && <Text style={styles.note}>{o.note}</Text>}
              <Text style={styles.meta} testID="order-totals">
                {o.total_received} van {o.total_ordered} ontvangen
              </Text>
            </View>

            <SectionTitle title="Bestelregels" />
            <View style={styles.card}>
              <View style={[styles.line, styles.headRow]}>
                <Text style={[styles.colHead, { flex: 1 }]}>Artikel</Text>
                <Text style={styles.colHead}>Best.</Text>
                <Text style={styles.colHead}>Ontv.</Text>
                <Text style={styles.colHead}>Open</Text>
              </View>
              {o.lines.map((l) => (
                <Pressable key={l.line_id} testID={`order-line-${l.article_number}`} onPress={() => router.push(`/artikel/${l.article_id}`)} style={styles.line}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sku}>{l.article_number}</Text>
                    <Text style={styles.lineTitle} numberOfLines={1}>
                      {l.article_description}
                    </Text>
                  </View>
                  <Text style={styles.col} testID={`order-line-ordered-${l.article_number}`}>
                    {l.ordered}
                  </Text>
                  <Text style={[styles.col, { color: colors.success }]} testID={`order-line-received-${l.article_number}`}>
                    {l.received}
                  </Text>
                  <Text style={[styles.col, l.open > 0 && { color: colors.warning }]} testID={`order-line-open-${l.article_number}`}>
                    {l.open}
                  </Text>
                </Pressable>
              ))}
            </View>

            <SectionTitle title="Ontvangsten (mutatiehistorie)" />
            <View style={styles.card}>
              {(o.receipts ?? []).length === 0 ? (
                <StateView icon="cube-outline" title="Nog niets ontvangen" />
              ) : (
                o.receipts!.map((m) => <MutationRow key={m.id} m={m} />)
              )}
            </View>
          </ScrollView>
          {isAdmin && hasOpen && (
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={{ width: "100%", maxWidth: 640, alignSelf: "center" }}>
                <Button testID="order-receive-button" title="Ontvangst binnenboeken" icon="download-outline" onPress={() => setReceiving(true)} />
              </View>
            </View>
          )}
          {receiving && <ReceiveSheet order={o} onClose={() => setReceiving(false)} />}
        </>
      )}
    </View>
  );
}

function ReceiveSheet({ order, onClose }: { order: SupplierOrder; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const open = order.lines.filter((l) => l.open > 0);
  const [qty, setQty] = useState<Record<string, string>>(Object.fromEntries(open.map((l) => [l.line_id, "0"])));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(newRequestId()); // zelfde id bij dubbel tikken = geen dubbele boeking

  const total = open.reduce((s, l) => s + (parseInt(qty[l.line_id] || "0", 10) || 0), 0);

  const save = async () => {
    const over = open.find((l) => parseInt(qty[l.line_id] || "0", 10) > l.open);
    if (over) return setError(`${over.article_number}: maximaal ${over.open} te ontvangen`);
    if (total === 0) return setError("Vul bij minimaal één regel een ontvangen aantal in");
    setSaving(true);
    setError(null);
    try {
      const res = await api<SupplierOrder>(`/supplier-orders/${order.id}/receive`, {
        method: "POST",
        body: { client_request_id: requestId, note, lines: open.map((l) => ({ line_id: l.line_id, quantity: parseInt(qty[l.line_id] || "0", 10) || 0 })) },
      });
      await qc.invalidateQueries();
      if (res.errors?.length) {
        toast(`Deels geboekt: ${res.errors.join("; ")}`, "error");
      } else {
        hapticSuccess();
        toast(`${total} stuks binnengeboekt`);
      }
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="order-receive-sheet">
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Ontvangst boeken</Text>
            <Pressable onPress={onClose} hitSlop={12} testID="order-receive-close">
              <Ionicons name="close" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <Text style={styles.meta}>Vul per regel het daadwerkelijk ontvangen aantal in. Alleen dit aantal verhoogt de fysieke voorraad.</Text>
          <Pressable testID="order-receive-all" onPress={() => setQty(Object.fromEntries(open.map((l) => [l.line_id, String(l.open)])))}>
            <Text style={styles.link}>Alles volledig ontvangen</Text>
          </Pressable>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
            {open.map((l) => {
              const n = parseInt(qty[l.line_id] || "0", 10) || 0;
              return (
                <View key={l.line_id} style={[styles.recvRow, n > l.open && { borderColor: colors.error }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sku}>{l.article_number}</Text>
                    <Text style={styles.meta}>
                      Nog te ontvangen: {l.open} {l.unit}
                    </Text>
                  </View>
                  <TextInput
                    testID={`order-receive-qty-${l.article_number}`}
                    value={qty[l.line_id]}
                    onChangeText={(t) => {
                      setQty({ ...qty, [l.line_id]: t.replace(/[^0-9]/g, "") });
                      setError(null);
                    }}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    style={styles.qtyInput}
                  />
                </View>
              );
            })}
            <Input testID="order-receive-note" label="Opmerking (optioneel)" value={note} onChangeText={setNote} placeholder="Bijv. pakbon / container" />
            {error && (
              <Text style={styles.error} testID="order-receive-error">
                {error}
              </Text>
            )}
            <Button testID="order-receive-confirm" title={`${total} stuks binnenboeken`} icon="checkmark" loading={saving} disabled={total === 0} onPress={save} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  top: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: c.onSurface, fontFamily: mono },
  meta: { fontSize: fontSize.sm, color: c.muted },
  note: { fontSize: fontSize.base, color: c.onSurfaceTertiary },
  link: { color: c.brandPrimary, fontWeight: "600", fontSize: fontSize.base, marginVertical: spacing.sm },
  card: { marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  headRow: { paddingVertical: spacing.sm, backgroundColor: c.surfaceTertiary },
  colHead: { width: 48, fontSize: 11, fontWeight: "700", color: c.muted, textTransform: "uppercase", textAlign: "right" },
  col: { width: 48, fontFamily: mono, fontSize: fontSize.base, fontWeight: "700", color: c.onSurface, textAlign: "right" },
  sku: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  lineTitle: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  footer: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, maxHeight: "90%", width: "100%", maxWidth: 640, alignSelf: "center" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  recvRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surfaceSecondary },
  qtyInput: { width: 80, height: 48, borderRadius: radius.sm, borderWidth: 1, borderColor: c.borderStrong, textAlign: "center", fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface, backgroundColor: c.surface },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500" },
}));
