import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, StateView } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article } from "@/src/types";

export default function LinkBarcode() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Article | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(h);
  }, [search]);

  const list = useQuery({
    queryKey: ["articles", "link", debounced],
    queryFn: () => api<Article[]>(`/articles?q=${encodeURIComponent(debounced)}&limit=50`),
  });

  if (!isAdmin) return <Redirect href="/" />;

  const link = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const a = await api<Article>(`/articles/${selected.id}/barcodes`, { method: "POST", body: { barcode: code } });
      await qc.invalidateQueries();
      toast(`Barcode gekoppeld aan ${a.article_number}`);
      router.replace(`/artikel/${a.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <View style={styles.codeBox} testID="link-barcode-code">
          <Ionicons name="barcode-outline" size={22} color={colors.brandPrimary} />
          <Text style={styles.code}>{code}</Text>
        </View>
        <Text style={styles.help}>Kies het artikel waaraan deze barcode gekoppeld moet worden.</Text>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="link-search-input"
            placeholder="Zoek artikel"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
      </View>
      <FlatList
        data={list.data ?? []}
        keyExtractor={(a) => a.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.inner}
        renderItem={({ item }) => {
          const sel = selected?.id === item.id;
          return (
            <Pressable testID={`link-article-${item.article_number}`} onPress={() => setSelected(item)} style={[styles.row, sel && { backgroundColor: colors.brandTertiary }]}>
              <Ionicons name={sel ? "radio-button-on" : "radio-button-off"} size={22} color={sel ? colors.brandPrimary : colors.borderStrong} />
              <View style={{ flex: 1 }}>
                <Text style={styles.sku}>{item.article_number}</Text>
                <Text style={styles.desc} numberOfLines={1}>
                  {item.description}
                </Text>
                {item.barcodes.length > 0 && (
                  <Text style={styles.meta} numberOfLines={1}>
                    Huidig: {item.barcodes.join(", ")}
                  </Text>
                )}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          list.isLoading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brandPrimary} /> : <StateView icon="search-outline" title="Geen artikelen gevonden" />
        }
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={{ width: "100%", maxWidth: 640, alignSelf: "center", gap: spacing.sm }}>
          {error && (
            <Text style={styles.error} testID="link-error">
              {error}
            </Text>
          )}
          <Button
            testID="link-confirm-button"
            title={selected ? `Koppelen aan ${selected.article_number}` : "Selecteer een artikel"}
            icon="link"
            disabled={!selected}
            loading={saving}
            onPress={link}
          />
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  head: { padding: spacing.lg, gap: spacing.md, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  codeBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.brandTertiary, padding: spacing.md, borderRadius: radius.md },
  code: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onBrandTertiary },
  help: { fontSize: fontSize.base, color: c.onSurfaceTertiary },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44 },
  searchInput: { flex: 1, fontSize: fontSize.base, color: c.onSurface, outlineStyle: "none" } as any,
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surfaceSecondary },
  sku: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  desc: { fontSize: fontSize.base, color: c.onSurface, fontWeight: "600" },
  meta: { fontSize: fontSize.sm, color: c.muted },
  footer: { backgroundColor: c.surfaceSecondary, borderTopWidth: 1, borderTopColor: c.border, paddingTop: spacing.md, paddingHorizontal: spacing.lg },
  error: { color: c.error, fontSize: fontSize.base, textAlign: "center" },
}));
