import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Button, Chip, formatDateTime, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { hapticError, hapticSuccess } from "@/src/haptics";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article, articleTitle, newRequestId, Reservation, ReservationEvent, RESERVATION_STATUS_LABELS } from "@/src/types";

export function ReservationRow({ r, onPress, showArticle = true }: { r: Reservation; onPress: () => void; showArticle?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={`reservation-row-${r.id}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      <View style={[styles.rowIcon, { backgroundColor: r.status === "actief" ? colors.infoSoft : colors.surfaceTertiary }]}>
        <Ionicons name="bookmark" size={18} color={r.status === "actief" ? colors.onInfoSoft : colors.muted} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {r.project}
        </Text>
        {showArticle && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            <Text style={styles.sku}>{r.article_number}</Text> · {r.article_description}
          </Text>
        )}
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatDateTime(r.created_at)} · {r.created_by}
          {r.consumed_quantity ? ` · ${r.consumed_quantity} afgeboekt` : ""}
        </Text>
        {!!r.note && (
          <Text style={styles.note} numberOfLines={1}>
            “{r.note}”
          </Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={styles.qty}>{r.quantity}</Text>
        {r.status !== "actief" && <Badge label={RESERVATION_STATUS_LABELS[r.status]} />}
      </View>
    </Pressable>
  );
}

type SheetProps = {
  visible: boolean;
  onClose: () => void;
  article?: Article | null; // vooraf gekozen artikel (aanmaken vanuit artikel)
  reservationId?: string | null; // bestaande reservering bekijken/wijzigen
};

export function ReservationSheet({ visible, onClose, article: presetArticle, reservationId }: SheetProps) {
  const { isAdmin } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const editing = !!reservationId;

  const [article, setArticle] = useState<Article | null>(presetArticle ?? null);
  const [search, setSearch] = useState("");
  const [project, setProject] = useState("");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"release" | "complete" | null>(null);
  const [requestId, setRequestId] = useState(newRequestId());

  const detail = useQuery({
    queryKey: ["reservation", reservationId],
    queryFn: () => api<Reservation & { events: ReservationEvent[] }>(`/reservations/${reservationId}`),
    enabled: visible && editing,
  });
  const r = detail.data;
  const articleId = article?.id ?? r?.article_id;
  const art = useQuery({ queryKey: ["article", articleId], queryFn: () => api<Article>(`/articles/${articleId}`), enabled: visible && !!articleId });
  const searchRes = useQuery({
    queryKey: ["articles", "reserve-pick", search],
    queryFn: () => api<Article[]>(`/articles?q=${encodeURIComponent(search)}&limit=20`),
    enabled: visible && !editing && !article,
  });
  const projects = useQuery({ queryKey: ["reservation-projects"], queryFn: () => api<string[]>("/reservations/projects"), enabled: visible && isAdmin });

  useEffect(() => {
    if (!visible) return;
    setArticle(presetArticle ?? null);
    setSearch("");
    setError(null);
    setConfirm(null);
    setRequestId(newRequestId());
    if (!editing) {
      setProject("");
      setQty("1");
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (r) {
      setProject(r.project);
      setQty(String(r.quantity));
      setNote(r.note);
    }
  }, [r]);

  const a = art.data;
  const n = /^\d+$/.test(qty) ? parseInt(qty, 10) : NaN;
  const own = editing && r ? r.quantity : 0; // eigen reservering telt mee in "gereserveerd"
  const availableForThis = a ? a.available_stock + own : 0;
  const insufficient = !!a && !isNaN(n) && n > availableForThis;
  const canEdit = isAdmin && (!editing || r?.status === "actief");

  const refresh = async () => {
    await qc.invalidateQueries();
  };

  const save = async () => {
    if (!articleId) return setError("Kies eerst een artikel");
    if (!project.trim()) return setError("Vul de projectnaam of het projectnummer in");
    if (isNaN(n) || n < 1) return setError("Voer een geldig aantal in (minimaal 1)");
    if (insufficient) {
      hapticError();
      return setError(`Onvoldoende beschikbare voorraad: er zijn ${Math.max(availableForThis, 0)} ${a?.unit} beschikbaar voor deze reservering`);
    }
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api(`/reservations/${reservationId}`, { method: "PATCH", body: { project, quantity: n, note } });
        toast("Reservering gewijzigd");
      } else {
        await api("/reservations", { method: "POST", body: { client_request_id: requestId, article_id: articleId, project, quantity: n, note } });
        toast(`${n} gereserveerd voor ${project.trim()}`);
      }
      hapticSuccess();
      await refresh();
      onClose();
    } catch (e) {
      hapticError();
      setError(errorMessage(e));
      setRequestId(newRequestId());
    } finally {
      setSaving(false);
    }
  };

  const close = async (kind: "release" | "complete") => {
    setSaving(true);
    setError(null);
    try {
      await api(`/reservations/${reservationId}/${kind}`, { method: "POST", body: { note: "" } });
      hapticSuccess();
      toast(kind === "release" ? "Reservering opgeheven" : "Reservering voltooid");
      await refresh();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
      setConfirm(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={onClose} testID="reservation-sheet-backdrop" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="reservation-sheet">
          <View style={styles.handle} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{editing ? (canEdit ? "Reservering wijzigen" : "Reservering") : "Nieuwe reservering"}</Text>
              {editing && r && (
                <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: 4 }}>
                  <Badge label={RESERVATION_STATUS_LABELS[r.status]} tone={r.status === "actief" ? "info" : "neutral"} testID="reservation-status" />
                </View>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={12} testID="reservation-sheet-close" style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>

          {editing && detail.isLoading ? (
            <ActivityIndicator style={{ margin: spacing.xl }} color={colors.brandPrimary} />
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
              {/* Artikel */}
              {!articleId ? (
                <View style={{ gap: spacing.sm }}>
                  <Text style={styles.label}>Artikel</Text>
                  <View style={styles.search}>
                    <Ionicons name="search" size={18} color={colors.muted} />
                    <TextInput
                      testID="reservation-article-search"
                      placeholder="Zoek artikelnummer of naam"
                      placeholderTextColor={colors.muted}
                      value={search}
                      onChangeText={setSearch}
                      style={styles.searchInput}
                      autoCorrect={false}
                    />
                  </View>
                  <View style={styles.pickList}>
                    {(searchRes.data ?? []).map((x) => (
                      <Pressable key={x.id} testID={`reservation-pick-${x.article_number}`} onPress={() => setArticle(x)} style={styles.pickRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sku}>{x.article_number}</Text>
                          <Text style={styles.rowTitle} numberOfLines={1}>
                            {articleTitle(x)}
                          </Text>
                        </View>
                        <Text style={styles.rowMeta}>{x.available_stock} beschikbaar</Text>
                      </Pressable>
                    ))}
                    {searchRes.isLoading && <ActivityIndicator style={{ margin: spacing.md }} color={colors.brandPrimary} />}
                  </View>
                </View>
              ) : (
                <View style={styles.artBox} testID="reservation-article">
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sku}>{a?.article_number ?? r?.article_number}</Text>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {a ? articleTitle(a) : r?.article_description}
                    </Text>
                  </View>
                  {!editing && !presetArticle && (
                    <Pressable testID="reservation-change-article" onPress={() => setArticle(null)}>
                      <Text style={styles.link}>Wijzig</Text>
                    </Pressable>
                  )}
                </View>
              )}

              {a && (
                <View style={styles.stocks} testID="reservation-stock-overview">
                  <Stock label="Fysiek" value={a.physical_stock} testID="reservation-physical" />
                  <Stock label="Gereserveerd" value={a.reserved_stock} testID="reservation-reserved" />
                  <Stock label="Beschikbaar" value={a.available_stock} testID="reservation-available" danger={a.available_stock <= 0} />
                </View>
              )}

              {canEdit ? (
                <>
                  <Input testID="reservation-project-input" label="Project (naam of nummer)" value={project} onChangeText={(t) => { setProject(t); setError(null); }} placeholder="Bijv. P-2026-014 Jansen badkamer" />
                  {(projects.data ?? []).length > 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 44, flexGrow: 0, marginTop: -spacing.sm }} contentContainerStyle={{ gap: spacing.sm, alignItems: "center" }} keyboardShouldPersistTaps="handled">
                      {projects.data!.map((p) => (
                        <Chip key={p} testID={`reservation-project-chip-${p}`} label={p} selected={project === p} onPress={() => setProject(p)} />
                      ))}
                    </ScrollView>
                  )}
                  <View style={{ gap: spacing.sm }}>
                    <Text style={styles.label}>Aantal te reserveren{a ? ` (${a.unit})` : ""}</Text>
                    <View style={styles.stepper}>
                      <Pressable testID="reservation-qty-minus" onPress={() => setQty(String(Math.max(1, (isNaN(n) ? 1 : n) - 1)))} style={styles.stepBtn}>
                        <Ionicons name="remove" size={24} color={colors.brandPrimary} />
                      </Pressable>
                      <TextInput
                        testID="reservation-qty-input"
                        value={qty}
                        onChangeText={(t) => { setQty(t.replace(/[^0-9]/g, "")); setError(null); }}
                        keyboardType="number-pad"
                        style={styles.qtyInput}
                        selectTextOnFocus
                        maxLength={6}
                      />
                      <Pressable testID="reservation-qty-plus" onPress={() => setQty(String((isNaN(n) ? 0 : n) + 1))} style={styles.stepBtn}>
                        <Ionicons name="add" size={24} color={colors.brandPrimary} />
                      </Pressable>
                    </View>
                    {a && !isNaN(n) && (
                      <Text style={[styles.rowMeta, insufficient && { color: colors.error, fontWeight: "600" }]} testID="reservation-availability-hint">
                        {insufficient
                          ? `Onvoldoende beschikbaar: maximaal ${Math.max(availableForThis, 0)} ${a.unit} te reserveren`
                          : `Beschikbaar na reservering: ${availableForThis - n} ${a.unit} (fysieke voorraad blijft ${a.physical_stock})`}
                      </Text>
                    )}
                  </View>
                  <Input testID="reservation-note-input" label="Opmerking (optioneel)" value={note} onChangeText={setNote} placeholder="Bijv. leverdatum, adres" maxLength={500} />
                </>
              ) : (
                r && (
                  <View style={styles.readBox}>
                    <ReadRow label="Project" value={r.project} />
                    <ReadRow label="Gereserveerd" value={`${r.quantity} (oorspronkelijk ${r.original_quantity})`} />
                    <ReadRow label="Afgeboekt" value={String(r.consumed_quantity)} />
                    <ReadRow label="Opmerking" value={r.note || "—"} />
                  </View>
                )
              )}

              {error && (
                <View style={styles.errorBox} testID="reservation-error">
                  <Ionicons name="alert-circle" size={18} color={colors.onErrorSoft} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {canEdit && (
                <Button testID="reservation-save-button" title={editing ? "Wijzigingen opslaan" : "Reserveren"} icon="bookmark" loading={saving && !confirm} disabled={!articleId} onPress={save} />
              )}

              {editing && canEdit && (
                confirm ? (
                  <View style={styles.confirm} testID="reservation-confirm">
                    <Text style={styles.confirmText}>
                      {confirm === "release"
                        ? "Reservering opheffen? Het gereserveerde aantal komt terug in de beschikbare voorraad."
                        : "Reservering voltooien? Het nog openstaande aantal wordt vrijgegeven."}
                    </Text>
                    <View style={{ flexDirection: "row", gap: spacing.sm }}>
                      <Button testID="reservation-confirm-cancel" title="Annuleren" variant="ghost" compact style={{ flex: 1 }} onPress={() => setConfirm(null)} />
                      <Button testID="reservation-confirm-button" title="Bevestigen" variant={confirm === "release" ? "danger" : "primary"} compact style={{ flex: 1 }} loading={saving} onPress={() => close(confirm)} />
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: "row", gap: spacing.sm }}>
                    <Button testID="reservation-complete-button" title="Voltooien" icon="checkmark-done" variant="secondary" compact style={{ flex: 1 }} onPress={() => setConfirm("complete")} />
                    <Button testID="reservation-release-button" title="Opheffen" icon="close-circle-outline" variant="ghost" compact style={{ flex: 1 }} onPress={() => setConfirm("release")} />
                  </View>
                )
              )}

              {editing && r && (
                <View style={{ gap: spacing.sm }}>
                  <Text style={styles.label}>Historie</Text>
                  <View style={styles.readBox} testID="reservation-history">
                    {r.events.map((e) => (
                      <View key={e.id} style={styles.event}>
                        <Text style={styles.eventTitle}>
                          {e.action.charAt(0).toUpperCase() + e.action.slice(1)} · <Text style={{ fontFamily: mono }}>{e.quantity_before} → {e.quantity_after}</Text>
                        </Text>
                        {!!e.changes && <Text style={styles.rowMeta}>{e.changes}</Text>}
                        <Text style={styles.rowMeta}>
                          {formatDateTime(e.created_at)} · {e.user_name}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Stock({ label, value, danger, testID }: { label: string; value: number; danger?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.stock} testID={testID}>
      <Text style={styles.stockLabel} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Text>
      <Text style={[styles.stockNum, danger && { color: colors.error }]}>{value}</Text>
    </View>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.readRow}>
      <Text style={styles.readLabel}>{label}</Text>
      <Text style={styles.readValue}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 64 },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  rowMeta: { fontSize: fontSize.sm, color: c.muted },
  note: { fontSize: fontSize.sm, color: c.onSurfaceTertiary, fontStyle: "italic" },
  sku: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  qty: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onInfoSoft },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, maxHeight: "92%", width: "100%", maxWidth: 640, alignSelf: "center" },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  head: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.lg },
  title: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center" },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: c.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44 },
  searchInput: { flex: 1, fontSize: fontSize.base, color: c.onSurface, outlineStyle: "none" } as any,
  pickList: { borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 52 },
  artBox: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md },
  link: { fontSize: fontSize.base, color: c.brandPrimary, fontWeight: "600" },
  stocks: { flexDirection: "row", gap: spacing.sm },
  stock: { flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  stockLabel: { fontSize: 10, fontWeight: "700", color: c.muted, textTransform: "uppercase" },
  stockNum: { fontFamily: mono, fontSize: 22, fontWeight: "700", color: c.onSurface },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  stepBtn: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  qtyInput: { flex: 1, minWidth: 0, width: "100%", height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.surfaceSecondary, textAlign: "center", fontSize: 24, fontWeight: "700", fontFamily: mono, color: c.onSurface },
  errorBox: { flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: c.errorSoft, padding: spacing.md, borderRadius: radius.md },
  errorText: { color: c.onErrorSoft, fontSize: fontSize.base, flex: 1, fontWeight: "500" },
  confirm: { gap: spacing.sm, backgroundColor: c.warningSoft, padding: spacing.md, borderRadius: radius.md },
  confirmText: { fontSize: fontSize.base, color: c.onWarningSoft },
  readBox: { borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary, overflow: "hidden" },
  readRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider },
  readLabel: { width: 110, fontSize: fontSize.base, color: c.muted },
  readValue: { flex: 1, fontSize: fontSize.base, color: c.onSurface, fontWeight: "500" },
  event: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: c.divider, gap: 2 },
  eventTitle: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
}));
