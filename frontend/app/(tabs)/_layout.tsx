import { Ionicons } from "@react-native-vector-icons/ionicons";
import { Redirect, Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { ActivityIndicator, Platform, View } from "react-native";

import { useAuth } from "@/src/auth";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";

export default function TabsLayout() {
  const { user, loading } = useAuth();
  const { colors } = useTheme();

  if (loading)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} size="large" />
      </View>
    );
  if (!user) return <Redirect href="/login" />;
  if (user.must_change_password) return <Redirect href="/wachtwoord" />;

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="square.grid.2x2.fill" />
          <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="artikelen">
          <NativeTabs.Trigger.Icon sf="shippingbox.fill" />
          <NativeTabs.Trigger.Label>Artikelen</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="scannen">
          <NativeTabs.Trigger.Icon sf="barcode.viewfinder" />
          <NativeTabs.Trigger.Label>Scannen</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="mutaties">
          <NativeTabs.Trigger.Icon sf="arrow.left.arrow.right" />
          <NativeTabs.Trigger.Label>Mutaties</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="planning">
          <NativeTabs.Trigger.Icon sf="calendar" />
          <NativeTabs.Trigger.Label>Planning</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surfaceSecondary,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarButtonTestID: "tab-dashboard",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="artikelen"
        options={{
          title: "Artikelen",
          tabBarButtonTestID: "tab-artikelen",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "cube" : "cube-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="scannen"
        options={{
          title: "Scannen",
          tabBarButtonTestID: "tab-scannen",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "barcode" : "barcode-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="mutaties"
        options={{
          title: "Mutaties",
          tabBarButtonTestID: "tab-mutaties",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "swap-horizontal" : "swap-horizontal-outline"} size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="planning"
        options={{
          title: "Planning",
          tabBarButtonTestID: "tab-planning",
          tabBarIcon: ({ color, focused }) => <Ionicons name={focused ? "calendar" : "calendar-outline"} size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
