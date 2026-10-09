import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, errorMessage } from "@/src/api";
import { Button, Chip, MutationRow, StateView } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { makeStyles, spacing, useTheme } from "@/src/theme";
import { Mutation, MUTATION_LABELS, MutationType } from "@/src/types";

const TYPES: MutationType[] = ["ontvangst", "afboeken", "retour", "correctie"];

export default function MutatiesScreen() {
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [type, setType] = useState<MutationType | "">("");
  const [limit, setLimit] = useState(100);

  const list = useQuery({
    queryKey: ["mutations", type, limit],
    queryFn: () => api<Mutation[]>(`/mutations?limit=${limit}${type ? `&type=${type}` : ""}`),
  });
  const data = list.data ?? [];

  useFocusEffect(
    useCallback(() => {
      list.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.inner}>
          <Text style={styles.title}>Mutaties</Text>
          <Text style={styles.sub}>Volledige, onveranderlijke historie van alle voorraadboekingen</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow} contentContainerStyle={styles.chips}>
            <Chip testID="mutations-chip-all" label="Alle" selected={!type} onPress={() => setType("")} />
            {TYPES.map((t) => (
              <Chip key={t} testID={`mutations-chip-${t}`} label={MUTATION_LABELS[t]} selected={type === t} onPress={() => setType(type === t ? "" : t)} />
            ))}
          </ScrollView>
        </View>
      </View>
      <FlatList
        data={data}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => <MutationRow m={item} onPress={() => router.push(`/artikel/${item.article_id}`)} />}
        contentContainerStyle={[styles.inner, { paddingBottom: bottomChrome + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} tintColor={colors.brandPrimary} />}
        ListFooterComponent={
          data.length >= limit && limit < 500 ? (
            <View style={{ padding: spacing.lg }}>
              <Button testID="mutations-load-more" title="Meer laden" variant="secondary" onPress={() => setLimit(500)} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          list.isLoading ? (
            <ActivityIndicator style={{ marginTop: spacing["3xl"] }} color={colors.brandPrimary} />
          ) : list.isError ? (
            <StateView
              icon="cloud-offline-outline"
              title="Kon mutaties niet laden"
              text={errorMessage(list.error)}
              action={<Button title="Opnieuw proberen" variant="secondary" onPress={() => list.refetch()} />}
            />
          ) : (
            <StateView testID="mutations-empty" icon="time-outline" title="Geen mutaties gevonden" />
          )
        }
      />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  inner: { width: "100%", maxWidth: 960, alignSelf: "center" },
  header: { backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5, paddingHorizontal: spacing.lg },
  sub: { fontSize: 13, color: c.muted, paddingHorizontal: spacing.lg, marginTop: 2 },
  chipRow: { height: 56, flexGrow: 0 },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, alignItems: "center" },
}));
