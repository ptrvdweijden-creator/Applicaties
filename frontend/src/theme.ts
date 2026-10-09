// Design tokens for this app. Light theme only (from /app/design_guidelines.json).
// A plain key is a background; its `on` partner is the text/icon color on top.

import { useMemo } from "react";
import { Appearance, Platform, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#F8FAFC",
  onSurface: "#0F172A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1E293B",
  surfaceTertiary: "#F1F5F9",
  onSurfaceTertiary: "#334155",
  surfaceInverse: "#0F172A",
  onSurfaceInverse: "#F8FAFC",
  muted: "#64748B",

  brand: "#1E3A5F",
  onBrand: "#FFFFFF",
  brandPrimary: "#1E3A5F",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#64748B",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#E2E8F0",
  onBrandTertiary: "#0F172A",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  successSoft: "#D1FAE5",
  onSuccessSoft: "#065F46",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  warningSoft: "#FEF3C7",
  onWarningSoft: "#92400E",
  error: "#EF4444",
  onError: "#FFFFFF",
  errorSoft: "#FEE2E2",
  onErrorSoft: "#991B1B",
  info: "#3B82F6",
  onInfo: "#FFFFFF",
  infoSoft: "#DBEAFE",
  onInfoSoft: "#1E40AF",

  border: "#E2E8F0",
  borderStrong: "#CBD5E1",
  divider: "#F1F5F9",

  scrim: "rgba(15,23,42,0.7)",
  overlay: "rgba(15,23,42,0.45)",
};

export type ThemeColors = typeof light;

export const defaultScheme = "light" satisfies ColorScheme;

export const themes: { light: ThemeColors; dark?: ThemeColors } = { light };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 };
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 };
export const fontSize = { sm: 12, base: 14, lg: 16, xl: 20, "2xl": 24 };
export const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.(scheme ?? "unspecified");
}

setColorScheme?.(themes.dark ? null : defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system && themes[system] ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
