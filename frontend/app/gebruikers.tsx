import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect, Stack } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Badge, Button, Chip, Input, StateView } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { Role, ROLE_LABELS, User } from "@/src/types";

const ROLES: Role[] = ["monteur", "magazijn", "admin"];

export default function UsersScreen() {
  const { isAdmin, user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/users"), enabled: isAdmin });

  if (!isAdmin) return <Redirect href="/" />;

  const toggle = async (u: User) => {
    try {
      await api(`/users/${u.id}`, { method: "PATCH", body: { active: !u.active } });
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast(u.active ? `${u.name} gedeactiveerd` : `${u.name} geactiveerd`);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable testID="users-add-button" onPress={() => setOpen(true)} hitSlop={10} style={{ paddingHorizontal: spacing.sm }}>
              <Ionicons name="person-add" size={22} color={colors.brandPrimary} />
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={users.data ?? []}
        keyExtractor={(u) => u.id}
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]}
        ListHeaderComponent={<Text style={styles.help}>Beheerders maken accounts aan voor medewerkers. Gedeactiveerde gebruikers kunnen niet meer inloggen; hun historische mutaties blijven bewaard.</Text>}
        renderItem={({ item }) => (
          <View style={styles.row} testID={`user-row-${item.email}`}>
            <View style={[styles.avatar, !item.active && { backgroundColor: colors.borderStrong }]}>
              <Text style={styles.avatarText}>{item.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.email}>{item.email}</Text>
              <Badge label={ROLE_LABELS[item.role]} tone={item.role === "admin" ? "brand" : "neutral"} />
            </View>
            <Switch
              testID={`user-active-switch-${item.email}`}
              value={item.active}
              disabled={item.id === me?.id}
              onValueChange={() => toggle(item)}
              trackColor={{ true: colors.success, false: colors.borderStrong }}
            />
          </View>
        )}
        ListEmptyComponent={users.isLoading ? <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.brandPrimary} /> : <StateView icon="people-outline" title="Geen gebruikers" />}
      />
      <NewUserSheet visible={open} onClose={() => setOpen(false)} />
    </View>
  );
}

function NewUserSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("monteur");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const close = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("monteur");
    setError(null);
    onClose();
  };

  const save = async () => {
    if (!name.trim() || !email.trim()) return setError("Naam en e-mailadres zijn verplicht");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setError("Voer een geldig e-mailadres in");
    if (password.length < 8) return setError("Wachtwoord moet minimaal 8 tekens bevatten");
    setSaving(true);
    setError(null);
    try {
      await api("/users", { method: "POST", body: { name, email, password, role } });
      await qc.invalidateQueries({ queryKey: ["users"] });
      toast("Gebruiker aangemaakt");
      close();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]} testID="new-user-sheet">
          <View style={styles.handle} />
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Nieuwe gebruiker</Text>
            <Pressable testID="new-user-close" onPress={close} hitSlop={12}>
              <Ionicons name="close" size={24} color={colors.onSurfaceTertiary} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.lg }}>
            <Input testID="new-user-name-input" label="Naam" value={name} onChangeText={setName} placeholder="Voor- en achternaam" />
            <Input testID="new-user-email-input" label="E-mailadres" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="naam@bedrijf.nl" />
            <Input testID="new-user-password-input" label="Tijdelijk wachtwoord" value={password} onChangeText={setPassword} secureTextEntry hint="Minimaal 8 tekens. De gebruiker moet dit bij de eerste login zelf wijzigen." />
            <View style={{ gap: 6 }}>
              <Text style={styles.label}>Rol</Text>
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                {ROLES.map((r) => (
                  <Chip key={r} testID={`new-user-role-${r}`} label={ROLE_LABELS[r]} selected={role === r} onPress={() => setRole(r)} />
                ))}
              </View>
            </View>
            {error && (
              <Text style={styles.error} testID="new-user-error">
                {error}
              </Text>
            )}
            <Button testID="new-user-save-button" title="Gebruiker aanmaken" icon="person-add" loading={saving} onPress={save} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 720, alignSelf: "center" },
  help: { fontSize: fontSize.sm, color: c.muted, padding: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.lg, backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.divider },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: fontSize.lg },
  name: { fontSize: fontSize.lg, fontWeight: "600", color: c.onSurface },
  email: { fontSize: fontSize.sm, color: c.muted },
  backdrop: { flex: 1, backgroundColor: c.overlay },
  sheet: { backgroundColor: c.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: spacing.lg, maxHeight: "90%", width: "100%", maxWidth: 640, alignSelf: "center" },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: c.borderStrong, alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.md },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.lg },
  sheetTitle: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: c.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500" },
}));
