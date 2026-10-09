import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/src/auth";
import { Badge, Button, IconName, SectionTitle } from "@/src/components/ui";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";
import { ROLE_LABELS } from "@/src/types";

const RIGHTS: Record<string, string[]> = {
  monteur: ["Artikelen zoeken en scannen", "Voorraad afboeken", "Retour boeken"],
  magazijn: ["Alles van Monteur", "Ontvangst van leveringen boeken", "Voorraadcorrectie na telling"],
  admin: ["Alles van Magazijn", "Artikelen aanmaken en wijzigen", "Barcodes koppelen", "Gebruikers beheren"],
};

export default function Profile() {
  const { user, logout, isAdmin } = useAuth();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (!user) return null;

  return (
    <ScrollView style={styles.root} contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.name.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.name} testID="profile-name">
            {user.name}
          </Text>
          <Text style={styles.email} testID="profile-email">
            {user.email}
          </Text>
          <Badge label={ROLE_LABELS[user.role]} tone="brand" testID="profile-role" />
        </View>
      </View>

      <SectionTitle title="Uw rechten" />
      <View style={styles.list}>
        {RIGHTS[user.role].map((r) => (
          <View key={r} style={styles.right}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={styles.rightText}>{r}</Text>
          </View>
        ))}
      </View>

      {isAdmin && (
        <>
          <SectionTitle title="Beheer" />
          <View style={styles.list}>
            <Item icon="people-outline" label="Gebruikersbeheer" testID="profile-users-button" onPress={() => router.push("/gebruikers")} />
            <Item icon="add-circle-outline" label="Nieuw artikel" testID="profile-new-article-button" onPress={() => router.push("/artikel-form")} />
            <Item icon="cloud-upload-outline" label="Artikelen importeren (Excel)" testID="profile-import-button" onPress={() => router.push("/import")} />
          </View>
        </>
      )}

      <View style={{ padding: spacing.lg }}>
        <Button testID="profile-logout-button" title="Uitloggen" variant="ghost" icon="log-out-outline" onPress={logout} />
      </View>
    </ScrollView>
  );
}

function Item({ icon, label, onPress, testID }: { icon: IconName; label: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.item, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      <Ionicons name={icon} size={20} color={colors.brandPrimary} />
      <Text style={styles.itemText}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 720, alignSelf: "center", paddingTop: spacing.lg },
  card: { marginHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontSize: fontSize["2xl"], fontWeight: "700" },
  name: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  email: { fontSize: fontSize.base, color: c.muted },
  list: { marginHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, overflow: "hidden" },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: c.divider },
  rightText: { fontSize: fontSize.base, color: c.onSurface },
  item: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, minHeight: 52, borderBottomWidth: 1, borderBottomColor: c.divider },
  itemText: { flex: 1, fontSize: fontSize.lg, color: c.onSurface, fontWeight: "500" },
}));
