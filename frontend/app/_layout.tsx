import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import { LogBox } from "react-native";
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
    if (!user && !onLogin) router.replace("/login");
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
    </Stack>
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
                <AuthGate />
              </ToastProvider>
            </AuthProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
