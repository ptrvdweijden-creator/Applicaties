import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ArticlePicker } from "@/src/components/ArticleLinesEditor";
import { ReservationSheet } from "@/src/components/Reservations";
import { Badge, Button, SectionTitle, StateView } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article, articleTitle, newRequestId, Project, RESERVATION_STATUS_LABELS } from "@/src/types";

export default function ProjectDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [resId, setResId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [adding, setAdding] = useState<Article | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const q = useQuery({ queryKey: ["project", id], queryFn: () => api<Project>(`/projects/${id}`) });
  const p = q.data;
  const activeLines = (p?.lines ?? []).filter((l) => l.status === "actief");
  const closedLines = (p?.lines ?? []).filter((l) => l.status !== "actief");
  const canManage = isAdmin && p?.status === "actief";

  const release = async () => {
    setBusy(true);
    try {
      await api(`/projects/${id}/release`, { method: "POST", body: { note: "" } });
      toast("Project vervallen; reserveringen vrijgegeven");
      await qc.invalidateQueries();
      setConfirm(false);
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: p?.name ?? "Project",
          headerRight: () =>
            canManage ? (
              <Pressable testID="project-edit-button" onPress={() => router.push({ pathname: "/project-form", params: { id } })} hitSlop={10} style={{ paddingHorizontal: spacing.sm }}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "600", fontSize: fontSize.lg }}>Bewerken</Text>
              </Pressable>
            ) : null,
        }}
      />
      {q.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
      ) : !p ? (
        <StateView icon="alert-circle-outline" title="Project niet gevonden" text={errorMessage(q.error)} />
      ) : (
        <ScrollView
          contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
        >
          <View style={styles.top}>
            <Badge label={p.status === "actief" ? "Actief" : "Vervallen"} tone={p.status === "actief" ? "info" : "neutral"} testID="project-status" />
            <Text style={styles.title} testID="project-name">
              {p.name}
            </Text>
            {!!p.note && <Text style={styles.note}>{p.note}</Text>}
            <Text style={styles.meta} testID="project-total">
              {p.line_count} artikelen · {p.total_reserved} stuks gereserveerd · aangemaakt door {p.created_by}
            </Text>
          </View>

          <SectionTitle
            title="Gereserveerde artikelen"
            action={
              canManage ? (
                <Pressable testID="project-add-line-button" onPress={() => setPicker(true)} hitSlop={8}>
                  <Text style={styles.link}>+ Artikel</Text>
                </Pressable>
              ) : null
            }
          />
          <View style={styles.card}>
            {activeLines.length === 0 ? (
              <StateView icon="bookmark-outline" title="Geen actieve reserveringen" />
            ) : (
              activeLines.map((l) => (
                <Pressable key={l.id} testID={`project-line-${l.article_number}`} onPress={() => setResId(l.id)} style={({ pressed }) => [styles.line, pressed && { backgroundColor: colors.surfaceTertiary }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.sku}>{l.article_number}</Text>
                    <Text style={styles.lineTitle} numberOfLines={1}>
                      {l.article_description}
                    </Text>
                    <Text style={styles.meta}>
                      Fysiek {l.article_physical_stock ?? "–"} · beschikbaar {l.article_available_stock ?? "–"}
                      {l.consumed_quantity ? ` · ${l.consumed_quantity} afgeboekt` : ""}
                    </Text>
                  </View>
                  <Text style={styles.qty} testID={`project-line-qty-${l.article_number}`}>
                    {l.quantity}×
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
                </Pressable>
              ))
            )}
          </View>

          {closedLines.length > 0 && (
            <>
              <SectionTitle title="Afgesloten regels" />
              <View style={styles.card}>
                {closedLines.map((l) => (
                  <Pressable key={l.id} onPress={() => setResId(l.id)} style={styles.line} testID={`project-closed-line-${l.article_number}`}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.sku}>{l.article_number}</Text>
                      <Text style={styles.meta}>
                        {RESERVATION_STATUS_LABELS[l.status]} · {l.consumed_quantity} afgeboekt van {l.original_quantity}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {canManage && (
            <View style={{ padding: spacing.lg, gap: spacing.sm }}>
              {confirm ? (
                <View style={styles.confirm} testID="project-release-confirm">
                  <Text style={styles.confirmText}>Project laten vervallen? Alle {p.total_reserved} gereserveerde stuks komen terug in de beschikbare voorraad.</Text>
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Button testID="project-release-cancel" title="Annuleren" variant="ghost" compact style={{ flex: 1 }} onPress={() => setConfirm(false)} />
                    <Button testID="project-release-confirm-button" title="Vrijgeven" variant="danger" compact style={{ flex: 1 }} loading={busy} onPress={release} />
                  </View>
                </View>
              ) : (
                <Button testID="project-release-button" title="Project vervallen / alles vrijgeven" icon="close-circle-outline" variant="ghost" onPress={() => setConfirm(true)} />
              )}
            </View>
          )}
        </ScrollView>
      )}
      <ReservationSheet visible={!!resId} reservationId={resId} onClose={() => setResId(null)} />
      <ArticlePicker
        visible={picker}
        exclude={activeLines.map((l) => l.article_id)}
        onClose={() => setPicker(false)}
        onPick={(a) => {
          setPicker(false);
          setAdding(a);
        }}
      />
      {adding && <AddLineSheet projectId={id} article={adding} onClose={() => setAdding(null)} />}
    </View>
  );
}

function AddLineSheet({ projectId, article, onClose }: { projectId: string; article: Article; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [qty, setQty] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId());
  const n = /^\d+$/.test(qty) ? parseInt(qty, 10) : 0;
  const over = n > article.available_stock;

  const save = async () => {
    if (n < 1) return setError("Voer een geldig aantal in (minimaal 1)");
    if (over) return setError(`Onvoldoende beschikbare voorraad: ${Math.max(article.available_stock, 0)} ${article.unit} beschikbaar`);
    setSaving(true);
    setError(null);
    try {
      await api(`/projects/${projectId}/lines`, { method: "POST", body: { client_request_id: requestId, article_id: article.id, quantity: n } });
      toast(`${n} × ${article.article_number} gereserveerd`);
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setRequestId(newRequestId());
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="project-add-line-sheet">
          <Text style={styles.sheetTitle}>Artikel reserveren</Text>
          <Text style={styles.sku}>{article.article_number}</Text>
          <Text style={styles.lineTitle}>{articleTitle(article)}</Text>
          <Text style={styles.meta}>
            Fysiek {article.physical_stock} · gereserveerd {article.reserved_stock} · beschikbaar {article.available_stock}
          </Text>
          <TextInput
            testID="project-add-line-qty"
            value={qty}
            onChangeText={(t) => {
              setQty(t.replace(/[^0-9]/g, ""));
              setError(null);
            }}
            keyboardType="number-pad"
            style={[styles.qtyInput, over && { borderColor: colors.error }]}
            selectTextOnFocus
            autoFocus
          />
          {error && (
            <Text style={styles.error} testID="project-add-line-error">
              {error}
            </Text>
          )}
          <Button testID="project-add-line-save" title="Reserveren" icon="bookmark" loading={saving} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  top: { padding: spacing.lg, gap: spacing.sm },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: c.onSurface },
  note: { fontSize: fontSize.base, color: c.onSurfaceTertiary },
  meta: { fontSize: fontSize.sm, color: c.muted },
  link: { color: c.brandPrimary, fontWeight: "600", fontSize: fontSize.base },
  card: { marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 64 },
  sku: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  lineTitle: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  qty: { fontFamily: mono, fontSize: fontSize.xl, fontWeight: "700", color: c.onInfoSoft },
  confirm: { gap: spacing.sm, backgroundColor: c.warningSoft, padding: spacing.md, borderRadius: radius.md },
  confirmText: { fontSize: fontSize.base, color: c.onWarningSoft },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, width: "100%", maxWidth: 640, alignSelf: "center" },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface, marginBottom: spacing.sm },
  qtyInput: { height: 56, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, textAlign: "center", fontFamily: mono, fontSize: 24, fontWeight: "700", color: c.onSurface, backgroundColor: c.surfaceSecondary, marginVertical: spacing.sm },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500" },
}));
