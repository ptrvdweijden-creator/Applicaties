import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article, articleTitle } from "@/src/types";

export type LineArticle = { id: string; article_number: string; title: string; unit: string; available_stock?: number };
export type EditLine = { key: string; line_id?: string; article: LineArticle; quantity: string; min?: number };

export const toLineArticle = (a: Article): LineArticle => ({
  id: a.id,
  article_number: a.article_number,
  title: articleTitle(a),
  unit: a.unit,
  available_stock: a.available_stock,
});

/** Lijst van artikelen + aantallen met artikelkiezer. mode 'reserve' toont beschikbare voorraad en waarschuwt. */
export function ArticleLinesEditor({ lines, onChange, mode }: { lines: EditLine[]; onChange: (l: EditLine[]) => void; mode: "reserve" | "order" }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [picker, setPicker] = useState(false);

  const setQty = (key: string, q: string) => onChange(lines.map((l) => (l.key === key ? { ...l, quantity: q.replace(/[^0-9]/g, "") } : l)));

  return (
    <View style={{ gap: spacing.sm }}>
      {lines.length === 0 && <Text style={styles.hint}>Nog geen artikelen toegevoegd.</Text>}
      {lines.map((l) => {
        const n = parseInt(l.quantity || "0", 10);
        const over = mode === "reserve" && l.article.available_stock !== undefined && n > l.article.available_stock;
        const below = l.min !== undefined && n < l.min;
        return (
          <View key={l.key} style={[styles.line, (over || below) && { borderColor: colors.error }]} testID={`line-${l.article.article_number}`}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.sku}>{l.article.article_number}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {l.article.title}
              </Text>
              {mode === "reserve" && l.article.available_stock !== undefined && (
                <Text style={[styles.hint, over && { color: colors.error, fontWeight: "600" }]}>
                  {over ? `Onvoldoende: ${l.article.available_stock} beschikbaar` : `${l.article.available_stock} ${l.article.unit} beschikbaar`}
                </Text>
              )}
              {below && <Text style={[styles.hint, { color: colors.error }]}>Minimaal {l.min} (al ontvangen)</Text>}
            </View>
            <TextInput
              testID={`line-qty-${l.article.article_number}`}
              value={l.quantity}
              onChangeText={(t) => setQty(l.key, t)}
              keyboardType="number-pad"
              style={styles.qty}
              selectTextOnFocus
              maxLength={7}
            />
            <Pressable
              testID={`line-remove-${l.article.article_number}`}
              disabled={!!l.min}
              onPress={() => onChange(lines.filter((x) => x.key !== l.key))}
              style={[styles.remove, !!l.min && { opacity: 0.3 }]}
              hitSlop={6}
            >
              <Ionicons name="trash-outline" size={18} color={colors.error} />
            </Pressable>
          </View>
        );
      })}
      <Pressable testID="lines-add-article" onPress={() => setPicker(true)} style={styles.add}>
        <Ionicons name="add-circle-outline" size={20} color={colors.brandPrimary} />
        <Text style={styles.addText}>Artikel toevoegen</Text>
      </Pressable>
      <ArticlePicker
        visible={picker}
        exclude={lines.map((l) => l.article.id)}
        onClose={() => setPicker(false)}
        onPick={(a) => {
          onChange([...lines, { key: `${a.id}-${Date.now()}`, article: toLineArticle(a), quantity: "1" }]);
          setPicker(false);
        }}
      />
    </View>
  );
}

export function ArticlePicker({ visible, onClose, onPick, exclude }: { visible: boolean; onClose: () => void; onPick: (a: Article) => void; exclude: string[] }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["articles", "line-picker", q],
    queryFn: () => api<Article[]>(`/articles?q=${encodeURIComponent(q)}&limit=50`),
    enabled: visible,
  });
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]} testID="article-picker">
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>Artikel kiezen</Text>
          <Pressable onPress={onClose} hitSlop={12} testID="article-picker-close">
            <Ionicons name="close" size={24} color={colors.onSurfaceTertiary} />
          </Pressable>
        </View>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="article-picker-search"
            value={q}
            onChangeText={setQ}
            placeholder="Artikelcode of naam"
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
          />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: spacing.sm }}>
          {list.isLoading && <ActivityIndicator style={{ margin: spacing.lg }} color={colors.brandPrimary} />}
          {(list.data ?? [])
            .filter((a) => !exclude.includes(a.id))
            .map((a) => (
              <Pressable key={a.id} testID={`article-picker-${a.article_number}`} onPress={() => onPick(a)} style={styles.pickRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sku}>{a.article_number}</Text>
                  <Text style={styles.title} numberOfLines={1}>
                    {articleTitle(a)}
                  </Text>
                </View>
                <Text style={styles.hint}>
                  {a.physical_stock} fysiek · {a.available_stock} besch.
                </Text>
              </Pressable>
            ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  line: { flexDirection: "row", alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.md, backgroundColor: c.surfaceSecondary },
  sku: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  title: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  hint: { fontSize: fontSize.sm, color: c.muted },
  qty: { width: 72, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: c.borderStrong, textAlign: "center", fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface, backgroundColor: c.surface },
  remove: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  add: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.borderStrong },
  addText: { color: c.brandPrimary, fontWeight: "600", fontSize: fontSize.base },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, height: "80%", width: "100%", maxWidth: 640, alignSelf: "center" },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  search: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: c.surfaceTertiary, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44 },
  searchInput: { flex: 1, fontSize: fontSize.base, color: c.onSurface, outlineStyle: "none" } as any,
  pickRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider, minHeight: 56 },
}));
