import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { ArticleLinesEditor, EditLine } from "@/src/components/ArticleLinesEditor";
import { Button, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { newRequestId, Project } from "@/src/types";

export default function ProjectForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const { isAdmin } = useAuth();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<EditLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [requestId] = useState(newRequestId());

  const existing = useQuery({ queryKey: ["project", id], queryFn: () => api<Project>(`/projects/${id}`), enabled: editing });
  useEffect(() => {
    if (existing.data) {
      setName(existing.data.name);
      setNote(existing.data.note);
    }
  }, [existing.data]);

  if (!isAdmin) return <Redirect href="/" />;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Vul een projectnaam of projectnummer in");
    const bad = lines.find((l) => !/^\d+$/.test(l.quantity) || parseInt(l.quantity, 10) < 1);
    if (bad) return setError(`Voer een geldig aantal in voor ${bad.article.article_number}`);
    const over = lines.filter((l) => l.article.available_stock !== undefined && parseInt(l.quantity, 10) > l.article.available_stock!);
    if (over.length) return setError(`Onvoldoende beschikbare voorraad voor ${over.map((l) => l.article.article_number).join(", ")}`);
    setSaving(true);
    try {
      if (editing) {
        await api(`/projects/${id}`, { method: "PATCH", body: { name, note } });
        toast("Project bijgewerkt");
        await qc.invalidateQueries();
        router.back();
      } else {
        const p = await api<Project>("/projects", {
          method: "POST",
          body: { client_request_id: requestId, name, note, lines: lines.map((l) => ({ article_id: l.article.id, quantity: parseInt(l.quantity, 10) })) },
        });
        toast(`Project ${p.name} aangemaakt`);
        await qc.invalidateQueries();
        router.replace(`/project/${p.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (editing && existing.isLoading) return <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: editing ? "Project bewerken" : "Nieuw project" }} />
      <KeyboardAwareScrollView contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={styles.section}>
          <Input testID="project-name-input" label="Projectnaam of -nummer" value={name} onChangeText={setName} placeholder="Bijv. P-2026-014 Jansen" />
          <Input testID="project-note-input" label="Opmerking (optioneel)" value={note} onChangeText={setNote} placeholder="Bijv. adres, montagedatum" />
        </View>
        {!editing && (
          <>
            <Text style={styles.sectionTitle}>Te reserveren artikelen</Text>
            <View style={styles.section}>
              <ArticleLinesEditor lines={lines} onChange={setLines} mode="reserve" />
              <Text style={styles.hint}>Reserveren verandert de fysieke voorraad niet; alleen de beschikbare voorraad daalt.</Text>
            </View>
          </>
        )}
        {error && (
          <Text style={styles.error} testID="project-form-error">
            {error}
          </Text>
        )}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Button testID="project-save-button" title={editing ? "Opslaan" : "Project aanmaken"} icon="checkmark" loading={saving} onPress={save} />
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
  hint: { fontSize: fontSize.sm, color: c.muted },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500", paddingHorizontal: spacing.lg },
}));
