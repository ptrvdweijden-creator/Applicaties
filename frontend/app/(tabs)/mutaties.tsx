import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ReservationRow, ReservationSheet } from "@/src/components/Reservations";
import { Button, Chip, MutationRow, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Mutation, MUTATION_LABELS, MutationType, Reservation } from "@/src/types";

const TYPES: MutationType[] = ["ontvangst", "afboeken", "retour", "correctie"];

export default function MutatiesScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [type, setType] = useState<MutationType | "">("");
  const [limit, setLimit] = useState(100);
  const { isAdmin } = useAuth();
  const [view, setView] = useState<"mutaties" | "reserveringen">("mutaties");
  const [resStatus, setResStatus] = useState<"actief" | "afgesloten" | "alle">("actief");
  const [sheet, setSheet] = useState<{ open: boolean; id: string | null }>({ open: false, id: null });

  const reservations = useQuery({
    queryKey: ["reservations", "all", resStatus],
    queryFn: () => api<Reservation[]>(`/reservations?status=${resStatus}`),
    enabled: view === "reserveringen",
  });

  const list = useQuery({
    queryKey: ["mutations", type, limit],
    queryFn: () => api<Mutation[]>(`/mutations?limit=${limit}${type ? `&type=${type}` : ""}`),
  });
  const data = list.data ?? [];

  useFocusEffect(
    useCallback(() => {
      list.refetch();
      if (view === "reserveringen") reservations.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.inner}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Mutaties</Text>
            {isAdmin && view === "reserveringen" && (
              <Pressable testID="reservations-add-button" onPress={() => setSheet({ open: true, id: null })} style={styles.addBtn}>
                <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
                <Text style={styles.addText}>Reserveren</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.segment}>
            {(["mutaties", "reserveringen"] as const).map((v) => (
              <Pressable key={v} testID={`mutations-view-${v}`} onPress={() => setView(v)} style={[styles.segItem, view === v && styles.segActive]}>
                <Text style={[styles.segText, view === v && { color: colors.brandPrimary }]}>{v === "mutaties" ? "Voorraadmutaties" : "Reserveringen"}</Text>
              </Pressable>
            ))}
          </View>
          {view === "mutaties" ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
              <Chip testID="mutations-chip-all" label="Alle" selected={!type} onPress={() => setType("")} />
              {TYPES.map((t) => (
                <Chip key={t} testID={`mutations-chip-${t}`} label={MUTATION_LABELS[t]} selected={type === t} onPress={() => setType(type === t ? "" : t)} />
              ))}
            </ScrollView>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
              <Chip testID="reservations-chip-actief" label="Actief" selected={resStatus === "actief"} onPress={() => setResStatus("actief")} />
              <Chip testID="reservations-chip-afgesloten" label="Afgesloten" selected={resStatus === "afgesloten"} onPress={() => setResStatus("afgesloten")} />
              <Chip testID="reservations-chip-alle" label="Alle" selected={resStatus === "alle"} onPress={() => setResStatus("alle")} />
            </ScrollView>
          )}
        </View>
      </View>
      {view === "reserveringen" ? (
        <FlatList
          data={reservations.data ?? []}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => <ReservationRow r={item} onPress={() => setSheet({ open: true, id: item.id })} />}
          contentContainerStyle={[styles.inner, { paddingBottom: bottomChrome + spacing.xl }]}
          refreshControl={<RefreshControl refreshing={reservations.isRefetching} onRefresh={reservations.refetch} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={
            reservations.isLoading ? (
              <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
            ) : reservations.isError ? (
              <StateView icon="cloud-offline-outline" title="Kon reserveringen niet laden" text={errorMessage(reservations.error)} />
            ) : (
              <StateView testID="reservations-empty" icon="bookmark-outline" title="Geen reserveringen" text={isAdmin ? "Reserveer beslag voor een project met de knop Reserveren." : undefined} />
            )
          }
        />
      ) : (
      <FlatList
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MutationRow m={item} onPress={() => router.push(`/artikel/${item.article_id}`)} />}
        contentContainerStyle={[styles.inner, { paddingBottom: bottomChrome + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
        ListFooterComponent={
          data.length >= limit && limit < 500 ? (
            <View style={{ padding: spacing.lg }}>
              <Button testID="mutations-load-more" title="Meer laden" variant="secondary" onPress={() => setLimit(500)} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
          ) : list.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Kon mutaties niet laden"
              text={errorMessage(list.error)}
              action={<Button title="Opnieuw proberen" variant="secondary" onPress={() => list.refetch()} />}
            />
          ) : (
            <StateView testID="mutations-empty" icon="time-outline" title="Geen mutaties gevonden" />
          )
        }
      />
      )}
      <ReservationSheet visible={sheet.open} reservationId={sheet.id} onClose={() => setSheet({ open: false, id: null })} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  header: { backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, minHeight: 40 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill },
  addText: { color: c.onBrandPrimary, fontWeight: "600", fontSize: fontSize.base },
  segment: { flexDirection: "row", marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  segActive: { backgroundColor: c.surfaceSecondary },
  segText: { fontSize: fontSize.base, fontWeight: "600", color: c.muted },
  chipRow: { height: 56, flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
}));
