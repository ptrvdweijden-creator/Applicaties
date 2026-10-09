import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { Button, Chip, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article } from "@/src/types";

type Errors = Partial<Record<"article_number" | "description" | "category" | "unit" | "min_stock" | "initial_stock", string>>;

export default function ArticleForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const existing = useQuery({ queryKey: ["article", id], queryFn: () => api<Article>(`/articles/${id}`), enabled: editing });
  const cats = useQuery({ queryKey: ["categories"], queryFn: () => api<string[]>("/categories") });

  const [num, setNum] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [unit, setUnit] = useState("stuks");
  const [minStock, setMinStock] = useState("0");
  const [initial, setInitial] = useState("0");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [barcodes, setBarcodes] = useState<string[]>([]);
  const [newCode, setNewCode] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const a = existing.data;
    if (a) {
      setNum(a.article_number);
      setDesc(a.description);
      setCat(a.category);
      setUnit(a.unit);
      setMinStock(String(a.min_stock));
      setNotes(a.notes);
      setActive(a.active);
      setBarcodes(a.barcodes);
    }
  }, [existing.data]);

  const addCode = () => {
    const c = newCode.trim();
    if (!c) return;
    if (barcodes.includes(c)) {
      setFormError("Deze barcode staat al in de lijst");
      return;
    }
    setBarcodes([...barcodes, c]);
    setNewCode("");
    setFormError(null);
  };

  const validate = () => {
    const e: Errors = {};
    if (!num.trim()) e.article_number = "Artikelnummer is verplicht";
    if (!desc.trim()) e.description = "Omschrijving is verplicht";
    if (!cat.trim()) e.category = "Categorie is verplicht";
    if (!unit.trim()) e.unit = "Eenheid is verplicht";
    if (!/^\d+$/.test(minStock)) e.min_stock = "Voer een geheel getal in (0 of hoger)";
    if (!editing && !/^\d+$/.test(initial)) e.initial_stock = "Voer een geheel getal in (0 of hoger)";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    setFormError(null);
    if (!validate()) return;
    const pending = newCode.trim() && !barcodes.includes(newCode.trim()) ? [...barcodes, newCode.trim()] : barcodes;
    setSaving(true);
    try {
      const body = {
        description: desc,
        category: cat,
        unit,
        min_stock: parseInt(minStock, 10),
        notes,
        active,
        barcodes: pending,
      };
      const saved = editing
        ? await api<Article>(`/articles/${id}`, { method: "PATCH", body })
        : await api<Article>("/articles", { method: "POST", body: { ...body, article_number: num, initial_stock: parseInt(initial, 10) } });
      await qc.invalidateQueries();
      toast(editing ? "Artikel bijgewerkt" : "Artikel aangemaakt");
      if (editing) router.back();
      else router.replace(`/artikel/${saved.id}`);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (editing && existing.isLoading) return <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: editing ? "Artikel bewerken" : "Nieuw artikel" }} />
      <KeyboardAwareScrollView contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={styles.section}>
          <Input
            testID="form-article-number-input"
            label="Artikelnummer"
            value={num}
            onChangeText={setNum}
            editable={!editing}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Bijv. DB-1001"
            error={errors.article_number}
            hint={editing ? "Het artikelnummer is uniek en kan niet worden gewijzigd" : "Uniek intern nummer; kan later niet worden gewijzigd"}
            style={{ fontFamily: mono }}
          />
          <Input testID="form-description-input" label="Omschrijving" value={desc} onChangeText={setDesc} placeholder="Bijv. Glasklem 90° chroom" error={errors.description} />
          <Input testID="form-category-input" label="Categorie" value={cat} onChangeText={setCat} placeholder="Bijv. Scharnieren" error={errors.category} />
          {(cats.data ?? []).length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ height: 56, flexGrow: 0 }} contentContainerStyle={{ gap: spacing.sm, alignItems: "center" }} keyboardShouldPersistTaps="handled">
              {cats.data!.map((c) => (
                <Chip key={c} testID={`form-category-chip-${c}`} label={c} selected={cat === c} onPress={() => setCat(c)} />
              ))}
            </ScrollView>
          )}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Input testID="form-unit-input" label="Eenheid" value={unit} onChangeText={setUnit} placeholder="stuks" error={errors.unit} />
            </View>
            <View style={{ flex: 1 }}>
              <Input
                testID="form-min-stock-input"
                label="Minimumvoorraad"
                value={minStock}
                onChangeText={(t) => setMinStock(t.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                error={errors.min_stock}
              />
            </View>
          </View>
          {!editing && (
            <Input
              testID="form-initial-stock-input"
              label="Beginvoorraad"
              value={initial}
              onChangeText={(t) => setInitial(t.replace(/[^0-9]/g, ""))}
              keyboardType="number-pad"
              error={errors.initial_stock}
              hint="Wordt geboekt als ontvangst-mutatie. Latere wijzigingen alleen via mutaties."
            />
          )}
          {editing && <Text style={styles.hint}>De voorraad wijzigt u uitsluitend via mutaties (ontvangst, afboeken, retour of correctie).</Text>}
        </View>

        <Text style={styles.sectionTitle}>Barcodes / QR-codes</Text>
        <View style={styles.section}>
          {barcodes.length === 0 && <Text style={styles.hint}>Nog geen barcodes gekoppeld.</Text>}
          {barcodes.map((b) => (
            <View key={b} style={styles.codeRow} testID={`form-barcode-${b}`}>
              <Ionicons name="barcode-outline" size={18} color={colors.brandSecondary} />
              <Text style={styles.code}>{b}</Text>
              <Pressable testID={`form-barcode-remove-${b}`} onPress={() => setBarcodes(barcodes.filter((x) => x !== b))} hitSlop={10} style={styles.removeBtn}>
                <Ionicons name="trash-outline" size={18} color={colors.error} />
              </Pressable>
            </View>
          ))}
          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Input testID="form-barcode-input" value={newCode} onChangeText={setNewCode} placeholder="Barcode toevoegen" autoCapitalize="none" autoCorrect={false} onSubmitEditing={addCode} style={{ fontFamily: mono }} />
            </View>
            <Button testID="form-barcode-add-button" title="Toevoegen" variant="secondary" compact onPress={addCode} style={{ minHeight: 48 }} />
          </View>
          <Text style={styles.hint}>Elke barcode kan maar aan één artikel gekoppeld zijn.</Text>
        </View>

        <Text style={styles.sectionTitle}>Overig</Text>
        <View style={styles.section}>
          <Input testID="form-notes-input" label="Opmerkingen" value={notes} onChangeText={setNotes} multiline placeholder="Bijv. leverancier, locatie in magazijn" style={{ minHeight: 80, textAlignVertical: "top" }} />
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Actief</Text>
              <Text style={styles.hint}>Inactieve artikelen verschijnen niet in de standaardlijst en kunnen niet gemuteerd worden.</Text>
            </View>
            <Switch testID="form-active-switch" value={active} onValueChange={setActive} trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }} />
          </View>
        </View>

        {formError && (
          <View style={styles.errorBox} testID="form-error">
            <Ionicons name="alert-circle" size={18} color={colors.onErrorSoft} />
            <Text style={styles.errorText}>{formError}</Text>
          </View>
        )}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Button testID="form-save-button" title={editing ? "Wijzigingen opslaan" : "Artikel aanmaken"} icon="checkmark" loading={saving} onPress={save} />
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 720, alignSelf: "center", paddingTop: spacing.lg, gap: spacing.md },
  section: { marginHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, padding: spacing.lg, gap: spacing.lg },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.8, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  row2: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  hint: { fontSize: fontSize.sm, color: c.muted },
  codeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  code: { flex: 1, fontFamily: mono, fontSize: fontSize.base, color: c.onSurface },
  removeBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: fontSize.lg, fontWeight: "600", color: c.onSurface },
  errorBox: { marginHorizontal: spacing.lg, flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: c.errorSoft, padding: spacing.md, borderRadius: radius.md },
  errorText: { color: c.onErrorSoft, fontSize: fontSize.base, flex: 1, fontWeight: "500" },
}));
