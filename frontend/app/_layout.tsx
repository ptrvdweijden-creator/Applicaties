import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect } from "react";
import { LogBox, Platform, View } from "react-native";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider, useAuth } from "@/src/auth";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/Toast";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true);

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const onLogin = segments[0] === "login";
    const onPassword = segments[0] === "wachtwoord";
    if (!user && !onLogin) router.replace("/login");
    else if (user?.must_change_password && !onPassword) router.replace("/wachtwoord");
    else if (user && onLogin) router.replace("/");
  }, [user, loading, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerTintColor: colors.brandPrimary,
        headerTitleStyle: { color: colors.onSurface, fontWeight: "600" },
        headerStyle: { backgroundColor: colors.surfaceSecondary },
        headerBackTitle: "Terug",
        contentStyle: { backgroundColor: colors.surface },
      }}
    >
      <Stack.Screen name="artikel/[id]" options={{ headerShown: true, title: "Artikel" }} />
      <Stack.Screen name="artikel-form" options={{ headerShown: true, title: "Artikel" }} />
      <Stack.Screen name="koppel" options={{ headerShown: true, title: "Barcode koppelen" }} />
      <Stack.Screen name="profiel" options={{ headerShown: true, title: "Profiel" }} />
      <Stack.Screen name="gebruikers" options={{ headerShown: true, title: "Gebruikersbeheer" }} />
      <Stack.Screen name="import" options={{ headerShown: true, title: "Artikelen importeren" }} />
      <Stack.Screen name="project/[id]" options={{ headerShown: true, title: "Project" }} />
      <Stack.Screen name="project-form" options={{ headerShown: true, title: "Project" }} />
      <Stack.Screen name="bestelling/[id]" options={{ headerShown: true, title: "Bestelling" }} />
      <Stack.Screen name="bestelling-form" options={{ headerShown: true, title: "Bestelling" }} />
      <Stack.Screen name="wachtwoord" options={{ headerShown: true, title: "Wachtwoord wijzigen" }} />
    </Stack>
  );
}

// Op brede browserschermen (desktop) de app gecentreerd met maximale breedte tonen; native ongewijzigd
const WEB_MAX_WIDTH = 1100;

// PWA-tags ook in dev-preview zetten (daar wordt +html.tsx niet gebruikt)
const PWA_TAGS: [string, Record<string, string>][] = [
  ["link", { rel: "manifest", href: "/manifest.json" }],
  ["link", { rel: "apple-touch-icon", href: "/apple-touch-icon.png" }],
  ["meta", { name: "theme-color", content: "#1E3A5F" }],
  ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
  ["meta", { name: "mobile-web-app-capable", content: "yes" }],
  ["meta", { name: "apple-mobile-web-app-title", content: "Voorraad" }],
];

function usePwaHead() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.lang = "nl";
    document.title = "Douchebeslag Voorraad";
    for (const [tag, attrs] of PWA_TAGS) {
      const key = attrs.rel ? `rel="${attrs.rel}"` : `name="${attrs.name}"`;
      if (document.head.querySelector(`${tag}[${key}]`)) continue;
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
    }
  }, []);
}

function WebFrame({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  usePwaHead();
  if (Platform.OS !== "web") return <>{children}</>;
  return (
    <View style={{ flex: 1, backgroundColor: colors.surfaceTertiary, alignItems: "center" }}>
      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: WEB_MAX_WIDTH,
          backgroundColor: colors.surface,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          overflow: "hidden",
        }}
      >
        {children}
      </View>
    </View>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <AuthProvider>
              <ToastProvider>
                <WebFrame>
                  <AuthGate />
                </WebFrame>
              </ToastProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
