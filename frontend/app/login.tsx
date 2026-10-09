import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button, Input } from "@/src/components/ui";
import { fontSize, makeStyles, radius, spacing, useTheme } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1584384689201-e0bcbe2c7f1d?crop=entropy&cs=srgb&fm=jpg&ixlib=rb-4.1.0&q=85&w=1200";

export default function Login() {
  const { login } = useAuth();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pwRef = useRef<TextInput>(null);

  const submit = async () => {
    if (!email.trim() || !password) {
      setError("Vul uw e-mailadres en wachtwoord in");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" />
      <LinearGradient colors={[colors.overlay, colors.brand]} style={styles.hero} />
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing["2xl"], paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
        bottomOffset={24}
      >
        <View style={styles.brandBlock}>
          <View style={styles.logo}>
            <Ionicons name="cube" size={28} color={colors.onBrand} />
          </View>
          <Text style={styles.appName}>Douchebeslag Voorraad</Text>
          <Text style={styles.tagline}>Artikelen, barcodes en voorraadmutaties op één plek</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Inloggen</Text>
          <Input
            testID="login-email-input"
            label="E-mailadres"
            icon="mail-outline"
            placeholder="naam@bedrijf.nl"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            returnKeyType="next"
            onSubmitEditing={() => pwRef.current?.focus()}
          />
          <Input
            ref={pwRef}
            testID="login-password-input"
            label="Wachtwoord"
            icon="lock-closed-outline"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {error && (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          )}
          <Button testID="login-submit-button" title="Inloggen" loading={busy} onPress={submit} />
          <Text style={styles.footnote}>Accounts worden aangemaakt door een beheerder.</Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.brand },
  hero: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scroll: { flexGrow: 1, justifyContent: "space-between", paddingHorizontal: spacing.lg, gap: spacing.xl, width: "100%", maxWidth: 480, alignSelf: "center" },
  brandBlock: { gap: spacing.sm, marginTop: spacing.xl },
  logo: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  appName: { fontSize: 30, fontWeight: "800", color: c.onBrand, letterSpacing: -0.5 },
  tagline: { fontSize: fontSize.lg, color: c.brandTertiary },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  cardTitle: { fontSize: fontSize["2xl"], fontWeight: "700", color: c.onSurface },
  error: { color: c.error, fontSize: fontSize.base, fontWeight: "500" },
  footnote: { fontSize: fontSize.sm, color: c.muted, textAlign: "center" },
}));
