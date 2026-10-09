import { Ionicons } from "@react-native-vector-icons/ionicons";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, ApiError, errorMessage } from "@/src/api";
import { useAuth } from "@/src/auth";
import { Button } from "@/src/components/ui";
import { hapticError, hapticSuccess } from "@/src/haptics";
import { usesNativeTabs } from "@/src/navigation";
import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article } from "@/src/types";

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128", "code39", "code93", "itf14", "codabar", "qr", "datamatrix"] as const;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknown, setUnknown] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const lock = useRef(false);

  const lookup = async (code: string) => {
    const c = code.trim();
    if (!c || lock.current) return;
    lock.current = true;
    setBusy(true);
    setLookupError(null);
    try {
      const a = await api<Article>(`/articles/by-barcode/${encodeURIComponent(c)}`);
      hapticSuccess();
      setManual("");
      router.push({ pathname: "/artikel/[id]", params: { id: a.id, scanned: c } });
      setTimeout(() => (lock.current = false), 1200);
    } catch (e) {
      hapticError();
      if (e instanceof ApiError && e.status === 404) setUnknown(c);
      else {
        setLookupError(errorMessage(e));
        setTimeout(() => (lock.current = false), 1500);
      }
    } finally {
      setBusy(false);
    }
  };

  const onScanned = (r: BarcodeScanningResult) => {
    if (!unknown) lookup(r.data);
  };

  const reset = () => {
    setUnknown(null);
    setLookupError(null);
    lock.current = false;
  };

  const manualBox = (
    <View style={styles.manual}>
      <Text style={styles.manualLabel}>Scannen lukt niet? Voer de barcode handmatig in</Text>
      <View style={styles.manualRow}>
        <TextInput
          testID="scan-manual-input"
          value={manual}
          onChangeText={setManual}
          placeholder="Barcode / QR-code"
          placeholderTextColor={colors.muted}
          style={styles.manualInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={() => lookup(manual)}
        />
        <Pressable testID="scan-manual-submit" style={styles.manualBtn} onPress={() => lookup(manual)}>
          <Ionicons name="arrow-forward" size={20} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <Pressable testID="scan-search-articles" onPress={() => router.push("/artikelen")}>
        <Text style={styles.manualLink}>Of zoek op artikelnummer / omschrijving</Text>
      </Pressable>
    </View>
  );

  const resultPanel = (unknown || lookupError) && (
    <View style={styles.result} testID="scan-result-panel">
      <View style={styles.resultHead}>
        <View style={[styles.resultIcon, { backgroundColor: colors.errorSoft }]}>
          <Ionicons name="alert-circle" size={24} color={colors.onErrorSoft} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.resultTitle} testID="scan-unknown-title">
            {unknown ? "Onbekende barcode" : "Opzoeken mislukt"}
          </Text>
          {unknown ? (
            <Text style={styles.resultCode} testID="scan-unknown-code">
              {unknown}
            </Text>
          ) : (
            <Text style={styles.resultText}>{lookupError}</Text>
          )}
        </View>
      </View>
      {unknown && (
        <Text style={styles.resultText}>
          {isAdmin
            ? "Deze barcode is niet gekoppeld aan een artikel. U kunt hem koppelen aan een bestaand artikel."
            : "Deze barcode is niet gekoppeld aan een artikel. Vraag een beheerder om de barcode te koppelen, of zoek het artikel handmatig."}
        </Text>
      )}
      <View style={{ gap: spacing.sm }}>
        {unknown && isAdmin && (
          <Button
            testID="scan-link-barcode-button"
            title="Koppel aan bestaand artikel"
            icon="link"
            onPress={() => {
              const code = unknown;
              reset();
              router.push({ pathname: "/koppel", params: { code } });
            }}
          />
        )}
        <Button testID="scan-again-button" title="Opnieuw scannen" variant="secondary" icon="scan" onPress={reset} />
      </View>
    </View>
  );

  // Permission handling
  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  if (!permission.granted) {
    const blocked = permission.status === "denied" && !permission.canAskAgain;
    return (
      <KeyboardAvoidingView behavior="padding" style={styles.lightRoot}>
        <View style={[styles.permWrap, { paddingTop: insets.top + spacing.xl, paddingBottom: bottomChrome + spacing.xl }]}>
          <Text style={styles.lightTitle}>Scannen</Text>
          <View style={styles.permCard} testID="scan-permission-card">
            <View style={styles.permIcon}>
              <Ionicons name="camera-outline" size={32} color={colors.brandPrimary} />
            </View>
            <Text style={styles.permTitle}>{blocked ? "Cameratoegang geweigerd" : "Camera gebruiken om te scannen"}</Text>
            <Text style={styles.permText}>
              {blocked
                ? "U heeft cameratoegang geweigerd. Sta de camera toe in de instellingen om barcodes te scannen. De rest van de app blijft gewoon werken."
                : "Met de camera scant u barcodes en QR-codes op het beslag, zodat het juiste artikel direct opent. Er worden geen foto's opgeslagen."}
            </Text>
            {blocked ? (
              Platform.OS !== "web" ? (
                <Button testID="scan-open-settings-button" title="Open instellingen" icon="settings-outline" onPress={() => Linking.openSettings()} />
              ) : (
                <Text style={styles.permText}>Sta cameratoegang toe via het slotje in de adresbalk van uw browser en herlaad de pagina.</Text>
              )
            ) : (
              <Button testID="scan-allow-camera-button" title={permission.status === "denied" ? "Opnieuw toestaan" : "Camera toestaan"} icon="camera" onPress={requestPermission} />
            )}
          </View>
          {manualBox}
          {resultPanel}
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      {focused && !unknown && (
        <CameraView
          testID="scan-camera"
          style={styles.camera}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={busy || unknown ? undefined : onScanned}
        />
      )}
      {/* Scrim with cutout */}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={[styles.scrim, { paddingTop: insets.top + spacing.lg, alignItems: "center", justifyContent: "flex-end", paddingBottom: spacing.lg }]}>
          <Text style={styles.instr}>Richt de camera op de barcode</Text>
        </View>
        <View style={{ flexDirection: "row", height: 220 }}>
          <View style={styles.scrim} />
          <View style={styles.cutout}>
            <View style={[styles.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 }]} />
            <View style={[styles.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 }]} />
            <View style={[styles.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 }]} />
            <View style={[styles.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 }]} />
            {busy && <ActivityIndicator color={colors.onBrand} size="large" />}
          </View>
          <View style={styles.scrim} />
        </View>
        <KeyboardAvoidingView behavior="padding" style={[styles.scrim, { paddingBottom: bottomChrome + spacing.lg, justifyContent: "flex-end" }]}>
          <View style={styles.bottomInner}>
            {resultPanel || manualBox}
          </View>
        </KeyboardAvoidingView>
      </View>
      {Platform.OS !== "web" && !unknown && (
        <Pressable
          testID="scan-torch-toggle"
          onPress={() => setTorch(!torch)}
          style={[styles.torch, { top: insets.top + spacing.lg }, torch && { backgroundColor: colors.warning }]}
        >
          <Ionicons name={torch ? "flashlight" : "flashlight-outline"} size={22} color={colors.onBrand} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceInverse },
  lightRoot: { flex: 1, backgroundColor: c.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  camera: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  overlay: { flex: 1 },
  scrim: { flex: 1, backgroundColor: c.scrim },
  cutout: { width: 280, maxWidth: "80%", alignItems: "center", justifyContent: "center" },
  corner: { position: "absolute", width: 36, height: 36, borderColor: c.onBrand, borderRadius: 4 },
  instr: { color: c.onSurfaceInverse, fontSize: fontSize.lg, fontWeight: "600" },
  torch: { position: "absolute", right: spacing.lg, width: 48, height: 48, borderRadius: 24, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center" },
  bottomInner: { paddingHorizontal: spacing.lg, width: "100%", maxWidth: 560, alignSelf: "center" },
  manual: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  manualLabel: { fontSize: fontSize.base, color: c.onSurfaceTertiary, fontWeight: "500" },
  manualRow: { flexDirection: "row", gap: spacing.sm },
  manualInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceTertiary,
    paddingHorizontal: spacing.md,
    fontFamily: mono,
    fontSize: fontSize.lg,
    color: c.onSurface,
  },
  manualBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  manualLink: { fontSize: fontSize.base, color: c.brandPrimary, fontWeight: "600" },
  result: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  resultHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  resultIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  resultTitle: { fontSize: fontSize.lg, fontWeight: "700", color: c.onSurface },
  resultCode: { fontFamily: mono, fontSize: fontSize.base, color: c.brandSecondary, marginTop: 2 },
  resultText: { fontSize: fontSize.base, color: c.onSurfaceTertiary },
  permWrap: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.lg, width: "100%", maxWidth: 560, alignSelf: "center" },
  lightTitle: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  permCard: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, borderWidth: 1, borderColor: c.border, padding: spacing.xl, gap: spacing.md },
  permIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  permTitle: { fontSize: fontSize.xl, fontWeight: "700", color: c.onSurface },
  permText: { fontSize: fontSize.base, color: c.onSurfaceTertiary, lineHeight: 20 },
}));
