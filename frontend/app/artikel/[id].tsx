import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { MutationSheet } from "@/src/components/MutationSheet";
import { Badge, Button, MutationRow, SectionTitle, StateView } from "@/src/components/ui";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article, Mutation } from "@/src/types";

export default function ArticleDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdmin, canMutate } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState(false);

  const art = useQuery({ queryKey: ["article", id], queryFn: () => api<Article>(`/articles/${id}`) });
  const hist = useQuery({ queryKey: ["mutations", "article", id], queryFn: () => api<Mutation[]>(`/mutations?article_id=${id}&limit=30`) });
  const a = art.data;
  const mayMutate = canMutate("afboeken") || canMutate("ontvangst");

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: a?.article_number ?? "Artikel",
          headerRight: () =>
            isAdmin && a ? (
              <Pressable testID="article-edit-button" onPress={() => router.push({ pathname: "/artikel-form", params: { id: a.id } })} hitSlop={10} style={{ paddingHorizontal: spacing.sm }}>
                <Text style={{ color: colors.brandPrimary, fontWeight: "600", fontSize: fontSize.lg }}>Bewerken</Text>
              </Pressable>
            ) : null,
        }}
      />
      {art.isLoading ? (
        <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
      ) : art.isError || !a ? (
        <StateView
          testID="article-error"
          icon="alert-circle-outline"
          title="Kon artikel niet laden"
          text={errorMessage(art.error)}
          action={<Button title="Opnieuw proberen" variant="secondary" onPress={() => art.refetch()} />}
        />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={[styles.inner, { paddingBottom: spacing.xl }]}
            refreshControl={<RefreshControl refreshing={art.isRefetching} onRefresh={() => { art.refetch(); hist.refetch(); }} tintColor={colors.brandPrimary} />}
          >
            <Animated.View entering={FadeInDown.duration(250)} style={styles.top}>
              <View style={styles.tags}>
                <Badge label={a.category} tone="neutral" testID="article-category" />
                {a.active ? <Badge label="Actief" tone="success" testID="article-status" /> : <Badge label="Inactief" tone="error" testID="article-status" />}
                {a.below_min && a.active && <Badge label="Onder minimum" tone="warning" testID="article-below-min-badge" />}
              </View>
              <Text style={styles.title} testID="article-description">
                {a.description}
              </Text>
              <Text style={styles.sku} testID="article-number">
                {a.article_number}
              </Text>
            </Animated.View>

            <Animated.View entering={FadeInDown.delay(60).duration(250)} style={styles.stocks}>
              <View style={[styles.stock, styles.stockMain]} testID="article-physical-stock">
                <Text style={[styles.stockLabel, { color: colors.brandTertiary }]}>Fysiek</Text>
                <Text style={[styles.stockNum, { color: colors.onBrandPrimary }]}>{a.physical_stock}</Text>
                <Text style={[styles.stockUnit, { color: colors.brandTertiary }]}>{a.unit}</Text>
              </View>
              <View style={styles.stock} testID="article-reserved-stock">
                <Text style={styles.stockLabel} numberOfLines={1} adjustsFontSizeToFit>Gereserveerd</Text>
                <Text style={styles.stockNum}>{a.reserved_stock}</Text>
                <Text style={styles.stockUnit}>{a.unit}</Text>
              </View>
              <View style={styles.stock} testID="article-available-stock">
                <Text style={styles.stockLabel}>Beschikbaar</Text>
                <Text style={[styles.stockNum, a.available_stock <= 0 && { color: colors.error }]}>{a.available_stock}</Text>
                <Text style={styles.stockUnit}>{a.unit}</Text>
              </View>
            </Animated.View>
            <Text style={styles.reserveNote}>Reserveringen voor projecten volgen in een latere fase.</Text>

            <SectionTitle title="Gegevens" />
            <View style={styles.card}>
              <Meta label="Artikelnummer" value={a.article_number} monoValue testID="meta-article-number" />
              <Meta label="Barcode(s)" value={a.barcodes.length ? a.barcodes.join("\n") : "Geen barcode gekoppeld"} monoValue={a.barcodes.length > 0} testID="meta-barcodes" />
              <Meta label="Eenheid" value={a.unit} testID="meta-unit" />
              <Meta label="Minimumvoorraad" value={`${a.min_stock} ${a.unit}`} testID="meta-min-stock" />
              <Meta label="Opmerkingen" value={a.notes || "—"} testID="meta-notes" last />
            </View>

            <SectionTitle title="Mutatiehistorie" />
            <View style={styles.card}>
              {hist.isLoading ? (
                <ActivityIndicator style={{ margin: spacing.xl }} color={colors.brandPrimary} />
              ) : (hist.data ?? []).length === 0 ? (
                <StateView icon="time-outline" title="Nog geen mutaties" />
              ) : (
                hist.data!.map((m) => <MutationRow key={m.id} m={m} showArticle={false} />)
              )}
            </View>
          </ScrollView>

          {mayMutate && (
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <View style={styles.footerInner}>
                {!a.active && <Text style={styles.inactiveNote}>Inactief artikel: mutaties zijn niet mogelijk</Text>}
                <Button testID="article-open-mutation-button" title="Mutatie boeken" icon="swap-vertical" disabled={!a.active} onPress={() => setSheet(true)} />
              </View>
            </View>
          )}
          <MutationSheet article={a} visible={sheet} onClose={() => setSheet(false)} />
        </>
      )}
    </View>
  );
}

function Meta({ label, value, monoValue, last, testID }: { label: string; value: string; monoValue?: boolean; last?: boolean; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.meta, last && { borderBottomWidth: 0 }]} testID={testID}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, monoValue && { fontFamily: mono }]}>{value}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  top: { padding: spacing.lg, gap: spacing.sm },
  tags: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  title: { fontSize: fontSize["2xl"], fontWeight: "700", color: c.onSurface, letterSpacing: -0.3 },
  sku: { fontFamily: mono, fontSize: fontSize.lg, color: c.brandSecondary, fontWeight: "600" },
  stocks: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
  stock: { flex: 1, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  stockMain: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  stockLabel: { fontSize: 10, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0 },
  stockNum: { fontFamily: mono, fontSize: 28, fontWeight: "700", color: c.onSurface },
  stockUnit: { fontSize: fontSize.sm, color: c.muted },
  reserveNote: { fontSize: fontSize.sm, color: c.muted, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  card: { marginHorizontal: spacing.lg, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceSecondary },
  meta: { flexDirection: "row", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider, gap: spacing.lg },
  metaLabel: { width: 130, fontSize: fontSize.base, color: c.muted },
  metaValue: { flex: 1, fontSize: fontSize.base, color: c.onSurface, fontWeight: "500" },
  footer: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  footerInner: { width: "100%", maxWidth: 640, alignSelf: "center", gap: spacing.sm },
  inactiveNote: { fontSize: fontSize.sm, color: c.error, textAlign: "center" },
}));
