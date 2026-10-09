import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Chip, OrderStatusBadge, formatDate, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Project, SupplierOrder } from "@/src/types";

type View_ = "projecten" | "bestellingen";

export default function PlanningScreen() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [view, setView] = useState<View_>("projecten");
  const [pStatus, setPStatus] = useState<"actief" | "vervallen" | "alle">("actief");
  const [oStatus, setOStatus] = useState<"open" | "volledig_ontvangen" | "alle">("open");

  const projects = useQuery({ queryKey: ["projects", pStatus], queryFn: () => api<Project[]>(`/projects?status=${pStatus}`), enabled: view === "projecten" });
  const orders = useQuery({ queryKey: ["supplier-orders", oStatus], queryFn: () => api<SupplierOrder[]>(`/supplier-orders?status=${oStatus}`), enabled: view === "bestellingen" });
  const active = view === "projecten" ? projects : orders;

  useFocusEffect(
    useCallback(() => {
      projects.refetch();
      orders.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const empty = active.isLoading ? (
    <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
  ) : active.isError ? (
    <StateView icon="cloud-offline-outline" title="Kon gegevens niet laden" text={errorMessage(active.error)} />
  ) : view === "projecten" ? (
    <StateView testID="projects-empty" icon="folder-open-outline" title="Geen projecten" text={isAdmin ? "Maak een project aan om beslag te reserveren." : undefined} />
  ) : (
    <StateView testID="orders-empty" icon="boat-outline" title="Geen bestellingen" text={isAdmin ? "Registreer een bestelling bij de leverancier." : undefined} />
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.inner}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Planning</Text>
            {isAdmin && (
              <Pressable
                testID={view === "projecten" ? "planning-new-project" : "planning-new-order"}
                onPress={() => router.push(view === "projecten" ? "/project-form" : "/bestelling-form")}
                style={styles.addBtn}
              >
                <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.addText}>{view === "projecten" ? "Project" : "Bestelling"}</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.segment}>
            {(["projecten", "bestellingen"] as const).map((v) => (
              <Pressable key={v} testID={`planning-view-${v}`} onPress={() => setView(v)} style={[styles.segItem, view === v && styles.segActive]}>
                <Text style={[styles.segText, view === v && { color: colors.brandPrimary }]} numberOfLines={1}>
                  {v === "projecten" ? "Projectreserveringen" : "Leveranciersbestellingen"}
                </Text>
              </Pressable>
            ))}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
            {view === "projecten" ? (
              <>
                <Chip testID="projects-chip-actief" label="Actief" selected={pStatus === "actief"} onPress={() => setPStatus("actief")} />
                <Chip testID="projects-chip-vervallen" label="Vervallen" selected={pStatus === "vervallen"} onPress={() => setPStatus("vervallen")} />
                <Chip testID="projects-chip-alle" label="Alle" selected={pStatus === "alle"} onPress={() => setPStatus("alle")} />
              </>
            ) : (
              <>
                <Chip testID="orders-chip-open" label="Openstaand" selected={oStatus === "open"} onPress={() => setOStatus("open")} />
                <Chip testID="orders-chip-volledig" label="Volledig ontvangen" selected={oStatus === "volledig_ontvangen"} onPress={() => setOStatus("volledig_ontvangen")} />
                <Chip testID="orders-chip-alle" label="Alle" selected={oStatus === "alle"} onPress={() => setOStatus("alle")} />
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {view === "projecten" ? (
        <FlatList
          data={projects.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={[styles.inner, { paddingBottom: bottomChrome + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={projects.isRefetching} onRefresh={projects.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={empty}
          renderItem={({ item }) => (
            <Pressable testID={`project-row-${item.name}`} onPress={() => router.push(`/project/${item.id}`)} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
              <View style={[styles.icon, { backgroundColor: colors.infoSoft }]}>
                <Ionicons name="folder" size={18} color={colors.onInfoSoft} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta}>
                  {item.line_count} {item.line_count === 1 ? "artikel" : "artikelen"} · {item.created_by}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={styles.num}>{item.total_reserved}</Text>
                {item.status === "vervallen" ? <Badge label="Vervallen" /> : <Text style={styles.meta}>gereserveerd</Text>}
              </View>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={orders.data ?? []}
          keyExtractor={(o) => o.id}
          contentContainerStyle={[styles.inner, { paddingBottom: bottomChrome + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={orders.isRefetching} onRefresh={orders.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={empty}
          renderItem={({ item }) => <OrderRow o={item} onPress={() => router.push(`/bestelling/${item.id}`)} />}
        />
      )}
    </View>
  );
}

function OrderRow({ o, onPress }: { o: SupplierOrder; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const pct = o.total_ordered ? Math.round((o.total_received / o.total_ordered) * 100) : 0;
  return (
    <Pressable testID={`order-row-${o.order_number}`} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      <View style={[styles.icon, { backgroundColor: colors.brandTertiary }]}>
        <Ionicons name="boat" size={18} color={colors.brandPrimary} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {o.order_number}
        </Text>
        <Text style={styles.meta}>
          Besteld {formatDate(o.order_date)}
          {o.expected_date ? ` · verwacht ${formatDate(o.expected_date)}` : ""}
        </Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.meta}>
          {o.total_received} / {o.total_ordered} ontvangen · {o.lines.length} regels
        </Text>
      </View>
      <OrderStatusBadge status={o.status} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  header: { backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, minHeight: 40 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill },
  addText: { color: c.onBrandPrimary, fontWeight: "600", fontSize: fontSize.base },
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, paddingHorizontal: 4 },
  segActive: { backgroundColor: c.surfaceSecondary },
  segText: { fontSize: 13, fontWeight: "600", color: c.muted },
  chipRow: { height: 56, flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 64 },
  icon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  meta: { fontSize: fontSize.sm, color: c.muted },
  num: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onInfoSoft },
  bar: { height: 6, borderRadius: 3, backgroundColor: c.surfaceTertiary, overflow: "hidden" },
  barFill: { height: 6, backgroundColor: c.success },
}));
