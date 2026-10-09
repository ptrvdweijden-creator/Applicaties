import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ArticleRow, Badge, Button, MutationRow, SectionTitle, StateView } from "@/src/components/ui";
import { hapticLight } from "@/src/haptics";
import { usesNativeTabs } from "@/src/navigation";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Dashboard, ROLE_LABELS } from "@/src/types";

export default function DashboardScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [search, setSearch] = useState("");

  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
  useFocusEffect(
    useCallback(() => {
      q.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const doSearch = () => {
    router.push({ pathname: "/artikelen", params: { q: search.trim(), t: String(Date.now()) } });
    setSearch("");
  };

  const d = q.data;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.inner}>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greet}>Goedendag,</Text>
              <Text style={styles.name} numberOfLines={1} testID="dashboard-user-name">
                {user?.name}
              </Text>
            </View>
            <Badge label={user ? ROLE_LABELS[user.role] : ""} tone="neutral" testID="dashboard-role-badge" />
            <Pressable testID="dashboard-profile-button" onPress={() => router.push("/profiel")} style={styles.avatar}>
              <Ionicons name="person" size={20} color={colors.onBrandPrimary} />
            </Pressable>
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="dashboard-search-input"
              placeholder="Zoek op artikelnummer of omschrijving"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={doSearch}
              returnKeyType="search"
              style={styles.searchInput}
            />
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomChrome + spacing.xl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.inner}>
          {q.isLoading ? (
            <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
          ) : q.isError ? (
            <StateView
              testID="dashboard-error"
              icon="cloud-offline-outline"
              title="Kon gegevens niet laden"
              text={errorMessage(q.error)}
              action={<Button title="Opnieuw proberen" variant="secondary" onPress={() => q.refetch()} />}
            />
          ) : d ? (
            <>
              <Animated.View entering={FadeInDown.duration(300)}>
                <Pressable
                  testID="dashboard-scan-button"
                  onPress={() => {
                    hapticLight();
                    router.push("/scannen");
                  }}
                  style={({ pressed }) => [styles.scanCard, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}
                >
                  <View style={styles.scanIcon}>
                    <Ionicons name="barcode-outline" size={30} color={colors.brandPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scanTitle}>Barcode scannen</Text>
                    <Text style={styles.scanText}>Open direct een artikel met de camera</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={22} color={colors.onBrandPrimary} />
                </Pressable>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(80).duration(300)} style={styles.metrics}>
                <Pressable testID="metric-active-articles" style={styles.metric} onPress={() => router.push("/artikelen")}>
                  <Ionicons name="cube-outline" size={20} color={colors.brandSecondary} />
                  <Text style={styles.metricNum}>{d.active_articles}</Text>
                  <Text style={styles.metricLabel}>Actieve artikelen</Text>
                </Pressable>
                <Pressable
                  testID="metric-below-min"
                  style={[styles.metric, d.below_min_count > 0 && { borderColor: colors.warning, backgroundColor: colors.warningSoft }]}
                  onPress={() => router.push({ pathname: "/artikelen", params: { below: "1", t: String(Date.now()) } })}
                >
                  <Ionicons name="warning-outline" size={20} color={d.below_min_count > 0 ? colors.onWarningSoft : colors.brandSecondary} />
                  <Text style={[styles.metricNum, d.below_min_count > 0 && { color: colors.onWarningSoft }]}>{d.below_min_count}</Text>
                  <Text style={[styles.metricLabel, d.below_min_count > 0 && { color: colors.onWarningSoft }]}>Onder minimum</Text>
                </Pressable>
                <Pressable testID="metric-mutations-24h" style={styles.metric} onPress={() => router.push("/mutaties")}>
                  <Ionicons name="swap-horizontal-outline" size={20} color={colors.brandSecondary} />
                  <Text style={styles.metricNum}>{d.mutations_24h}</Text>
                  <Text style={styles.metricLabel}>Mutaties 24 uur</Text>
                </Pressable>
              </Animated.View>

              {d.below_min.length > 0 && (
                <Animated.View entering={FadeInDown.delay(160).duration(300)}>
                  <SectionTitle
                    title="Onder minimumvoorraad"
                    action={
                      <Pressable testID="dashboard-below-min-all" onPress={() => router.push({ pathname: "/artikelen", params: { below: "1", t: String(Date.now()) } })}>
                        <Text style={styles.link}>Alles tonen</Text>
                      </Pressable>
                    }
                  />
                  <View style={styles.listCard}>
                    {d.below_min.map((a) => (
                      <ArticleRow key={a.id} article={a} onPress={() => router.push(`/artikel/${a.id}`)} />
                    ))}
                  </View>
                </Animated.View>
              )}

              <Animated.View entering={FadeInDown.delay(240).duration(300)}>
                <SectionTitle
                  title="Recente mutaties"
                  action={
                    <Pressable testID="dashboard-mutations-all" onPress={() => router.push("/mutaties")}>
                      <Text style={styles.link}>Alles tonen</Text>
                    </Pressable>
                  }
                />
                <View style={styles.listCard}>
                  {d.recent_mutations.length === 0 ? (
                    <StateView icon="time-outline" title="Geen recente activiteit" />
                  ) : (
                    d.recent_mutations.map((m) => <MutationRow key={m.id} m={m} onPress={() => router.push(`/artikel/${m.article_id}`)} />)
                  )}
                </View>
              </Animated.View>
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  header: { backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border, paddingBottom: spacing.md },
  headRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  greet: { fontSize: fontSize.base, color: c.muted },
  name: { fontSize: fontSize["2xl"], fontWeight: "700", color: c.onSurface, letterSpacing: -0.3 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  search: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: c.surfaceTertiary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: fontSize.base, color: c.onSurface, outlineStyle: "none" } as any,
  scanCard: {
    margin: spacing.lg,
    marginBottom: 0,
    backgroundColor: c.brandPrimary,
    borderRadius: radius.lg,
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    shadowColor: c.brand,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  scanIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  scanTitle: { fontSize: fontSize.lg, fontWeight: "700", color: c.onBrandPrimary },
  scanText: { fontSize: fontSize.base, color: c.brandTertiary, marginTop: 2 },
  metrics: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  metric: {
    flex: 1,
    backgroundColor: c.surfaceSecondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metricNum: { fontFamily: mono, fontSize: 26, fontWeight: "700", color: c.onSurface },
  metricLabel: { fontSize: fontSize.sm, color: c.muted, fontWeight: "500" },
  link: { fontSize: fontSize.base, color: c.brandPrimary, fontWeight: "600" },
  listCard: { marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
}));
