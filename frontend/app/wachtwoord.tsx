import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Input } from "@/src/components/ui";
import { useToast } from "@/src/components/Toast";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

export default function ChangePasswordScreen() {
  const { user, changePassword, logout } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const forced = !!user?.must_change_password;
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setError(null);
    if (!current) return setError("Vul uw huidige wachtwoord in");
    if (next.length < 10) return setError("Het nieuwe wachtwoord moet minimaal 10 tekens bevatten");
    if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return setError("Gebruik minimaal één letter en één cijfer");
    if (next !== confirm) return setError("De nieuwe wachtwoorden komen niet overeen");
    if (next === current) return setError("Het nieuwe wachtwoord moet anders zijn dan het huidige");
    setSaving(true);
    try {
      await changePassword(current, next);
      toast("Wachtwoord gewijzigd");
      router.replace("/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={24}
    >
      {forced && (
        <View style={styles.banner} testID="password-forced-banner">
          <Ionicons name="shield-checkmark" size={22} color={colors.onWarningSoft} />
          <Text style={styles.bannerText}>Voor uw veiligheid moet u eerst een eigen wachtwoord instellen voordat u de app kunt gebruiken.</Text>
        </View>
      )}
      <View style={styles.card}>
        <Input testID="password-current-input" label="Huidig wachtwoord" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" />
        <Input
          testID="password-new-input"
          label="Nieuw wachtwoord"
          value={next}
          onChangeText={setNext}
          secureTextEntry
          autoCapitalize="none"
          hint="Minimaal 10 tekens, met minimaal één letter en één cijfer"
        />
        <Input testID="password-confirm-input" label="Herhaal nieuw wachtwoord" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" onSubmitEditing={save} />
        {error && (
          <Text style={styles.error} testID="password-error">
            {error}
          </Text>
        )}
        <Button testID="password-save-button" title="Wachtwoord opslaan" icon="checkmark" loading={saving} onPress={save} />
        <Text style={styles.hint}>Na het wijzigen worden andere sessies met het oude wachtwoord automatisch uitgelogd.</Text>
      </View>
      {forced && (
        <View style={{ paddingHorizontal: spacing.lg }}>
          <Button testID="password-logout-button" title="Uitloggen" variant="ghost" icon="log-out-outline" onPress={logout} />
        </View>
      )}
    </KeyboardAwareScrollView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 560, alignSelf: "center", paddingTop: spacing.lg, gap: spacing.lg },
  banner: { marginHorizontal: spacing.lg, flexDirection: "row", gap: spacing.sm, alignItems: "center", backgroundColor: c.warningSoft, padding: spacing.md, borderRadius: radius.md },
  bannerText: { flex: 1, color: c.onWarningSoft, fontSize: fontSize.base, fontWeight: "500" },
  card: { marginHorizontal: spacing.lg, backgroundColor: c.surfaceSecondary, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, padding: spacing.lg, gap: spacing.lg },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500" },
  hint: { fontSize: fontSize.sm, color: c.muted },
}));
