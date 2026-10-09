import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { makeStyles, radius, spacing, useTheme } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastState = { id: number; message: string; type: ToastType } | null;

const Ctx = createContext<(message: string, type?: ToastType) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const { colors } = useTheme();

  const show = useCallback((message: string, type: ToastType = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, type });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const bg = toast?.type === "error" ? colors.error : toast?.type === "info" ? colors.surfaceInverse : colors.success;
  const icon = toast?.type === "error" ? "alert-circle" : toast?.type === "info" ? "information-circle" : "checkmark-circle";

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
          <Animated.View key={toast.id} entering={FadeInUp} exiting={FadeOutUp} style={[styles.toast, { backgroundColor: bg }]} testID="toast-message">
            <Ionicons name={icon} size={20} color={colors.onSuccess} />
            <Text style={styles.text}>{toast.message}</Text>
          </Animated.View>
        </View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const useStyles = makeStyles((c) => ({
  wrap: { position: "absolute", left: spacing.lg, right: spacing.lg, alignItems: "center", zIndex: 1000 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    maxWidth: 560,
    shadowColor: c.onSurface,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  text: { color: c.onSuccess, fontSize: 14, fontWeight: "600", flexShrink: 1 },
}));
