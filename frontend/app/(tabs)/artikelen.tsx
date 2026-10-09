import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ArticleRow, Button, Chip, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Article } from "@/src/types";

export default function ArtikelenScreen() {
  const params = useLocalSearchParams<{ q?: string; below?: string; t?: string }>();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [search, setSearch] = useState(params.q ?? "");
  const [debounced, setDebounced] = useState(params.q ?? "");
  const [category, setCategory] = useState("");
  const [belowMin, setBelowMin] = useState(params.below === "1");
  const [inactive, setInactive] = useState(false);

  useEffect(() => {
    if (params.t) {
      setSearch(params.q ?? "");
      setDebounced(params.q ?? "");
      setBelowMin(params.below === "1");
      setCategory("");
    }
  }, [params.t, params.q, params.below]);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(h);
  }, [search]);

  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<string[]>("/categories") });
  const qs = new URLSearchParams({ q: debounced, category, status: inactive ? "inactief" : "actief", below_min: String(belowMin) }).toString();
  const list = useQuery({ queryKey: ["articles", qs], queryFn: () => api<Article[]>(`/articles?${qs}`) });

  useFocusEffect(
    useCallback(() => {
      list.refetch();
      cats.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.inner}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Artikelen</Text>
            {isAdmin && (
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable testID="articles-import-button" onPress={() => router.push("/import")} style={[styles.addBtn, styles.importBtn]}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.onBrandTertiary} />
                  <Text style={[styles.addText, { color: colors.onBrandTertiary }]}>Import</Text>
                </Pressable>
                <Pressable testID="articles-add-button" onPress={() => router.push("/artikel-form")} style={styles.addBtn}>
                  <Ionicons name="add" size={20} color={colors.onBrandPrimary} />
                  <Text style={styles.addText}>Nieuw</Text>
                </Pressable>
              </View>
            )}
          </View>
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              testID="articles-search-input"
              placeholder="Artikelnummer, omschrijving of barcode"
              placeholderTextColor={colors.muted}
              value={search}
              onChangeText={setSearch}
              returnKeyType="search"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {!!search && (
              <Pressable testID="articles-search-clear" onPress={() => setSearch("")} hitSlop={10}>
                <Ionicons name="close-circle" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
            <Chip testID="chip-all" label="Alle" selected={!category && !belowMin} onPress={() => { setCategory(""); setBelowMin(false); }} />
            <Chip testID="chip-below-min" label="Onder minimum" selected={belowMin} onPress={() => setBelowMin(!belowMin)} />
            {(cats.data ?? []).map((c) => (
              <Chip key={c} testID={`chip-category-${c}`} label={c} selected={category === c} onPress={() => setCategory(category === c ? "" : c)} />
            ))}
            {isAdmin && <Chip testID="chip-inactive" label="Inactief" selected={inactive} onPress={() => setInactive(!inactive)} />}
          </ScrollView>
        </View>
      </View>

      <FlatList
        data={list.data ?? []}
        keyExtractor={(a) => a.id}
        renderItem={({ item }) => <ArticleRow article={item} onPress={() => router.push(`/artikel/${item.id}`)} />}
        contentContainerStyle={[styles.inner, { paddingBottom: bottomChrome + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
        ListHeaderComponent={
          list.data ? (
            <Text style={styles.count} testID="articles-count">
              {list.data.length} {list.data.length === 1 ? "artikel" : "artikelen"}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
          ) : list.isError ? (
            <StateView
              testID="articles-error"
              icon="cloud-offline-outline"
              title="Kon artikelen niet laden"
              text={errorMessage(list.error)}
              action={<Button title="Opnieuw proberen" variant="secondary" onPress={() => list.refetch()} />}
            />
          ) : (
            <StateView testID="articles-empty" icon="search-outline" title="Geen artikelen gevonden" text="Probeer een andere zoekterm of filter." />
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  header: { backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandPrimary, paddingHorizontal: spacing.md, height: 40, borderRadius: radius.pill },
  addText: { color: c.onBrandPrimary, fontWeight: "600", fontSize: fontSize.base },
  importBtn: { backgroundColor: c.brandTertiary },
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
  chipRow: { height: 56, flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
  count: { fontSize: fontSize.sm, color: c.muted, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontWeight: "500" },
}));
