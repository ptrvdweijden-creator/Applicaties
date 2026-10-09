import { Ionicons } from "@react-native-vector-icons/ionicons";
import React, { ComponentProps, forwardRef } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, TextInputProps, View, ViewStyle } from "react-native";

import { fontSize, makeStyles, mono, radius, spacing, useTheme } from "@/src/theme";
import { Article, articleTitle, Mutation, MUTATION_ICONS, MUTATION_LABELS, ORDER_STATUS_LABELS, OrderStatus } from "@/src/types";

export type IconName = ComponentProps<typeof Ionicons>["name"];

type ButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
  compact?: boolean;
};

export function Button({ title, onPress, variant = "primary", icon, loading, disabled, testID, style, compact }: ButtonProps) {
  const styles = useStyles();
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, secondary: colors.brandTertiary, ghost: "transparent", danger: colors.error }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandTertiary, ghost: colors.brandPrimary, danger: colors.onError }[variant];
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        compact && styles.btnCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

type InputProps = TextInputProps & { label?: string; error?: string | null; hint?: string; icon?: IconName };

export const Input = forwardRef<TextInput, InputProps>(function Input({ label, error, hint, icon, style, editable, ...rest }, ref) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      {label && <Text style={styles.label}>{label}</Text>}
      <View style={[styles.inputWrap, error ? { borderColor: colors.error } : null, editable === false && styles.inputDisabled]}>
        {icon && <Ionicons name={icon} size={18} color={colors.muted} />}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.muted}
          style={[styles.input, style]}
          editable={editable}
          {...rest}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
});

export function Chip({ label, selected, onPress, testID }: { label: string; selected?: boolean; onPress: () => void; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: selected ? colors.brandPrimary : colors.surfaceSecondary, borderColor: selected ? colors.brandPrimary : colors.border },
      ]}
    >
      <Text numberOfLines={1} style={[styles.chipText, { color: selected ? colors.onBrandPrimary : colors.onSurfaceTertiary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({ label, tone = "neutral", testID }: { label: string; tone?: "neutral" | "success" | "warning" | "error" | "info" | "brand"; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const map = {
    neutral: [colors.brandTertiary, colors.onBrandTertiary],
    success: [colors.successSoft, colors.onSuccessSoft],
    warning: [colors.warningSoft, colors.onWarningSoft],
    error: [colors.errorSoft, colors.onErrorSoft],
    info: [colors.infoSoft, colors.onInfoSoft],
    brand: [colors.brandPrimary, colors.onBrandPrimary],
  }[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: map[0] }]}>
      <Text style={[styles.badgeText, { color: map[1] }]}>{label}</Text>
    </View>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge testID="order-status" label={ORDER_STATUS_LABELS[status]} tone={status === "volledig_ontvangen" ? "success" : status === "gedeeltelijk_ontvangen" ? "warning" : "info"} />;
}

export function StateView({ icon, title, text, action, testID }: { icon: IconName; title: string; text?: string; action?: React.ReactNode; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View testID={testID} style={styles.state}>
      <View style={styles.stateIcon}>
        <Ionicons name={icon} size={28} color={colors.brandSecondary} />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      {text && <Text style={styles.stateText}>{text}</Text>}
      {action}
    </View>
  );
}

export function StockPill({ article }: { article: Article }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const low = article.below_min;
  const empty = article.physical_stock === 0;
  const bg = empty ? colors.errorSoft : low ? colors.warningSoft : colors.successSoft;
  const fg = empty ? colors.onErrorSoft : low ? colors.onWarningSoft : colors.onSuccessSoft;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]} testID={`stock-pill-${article.article_number}`}>
      <Text style={[styles.pillNum, { color: fg }]}>{article.physical_stock}</Text>
      <Text style={[styles.pillUnit, { color: fg }]}>{article.unit}</Text>
    </View>
  );
}

export function ArticleRow({ article, onPress }: { article: Article; onPress: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`article-row-${article.article_number}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <Text style={styles.sku}>{article.article_number}</Text>
          {!article.active && <Badge label="Inactief" />}
          {article.below_min && article.active && <Ionicons name="warning" size={14} color={colors.warning} />}
        </View>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {articleTitle(article)}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {article.category} · min. {article.min_stock}
        </Text>
      </View>
      <StockPill article={article} />
      <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
    </Pressable>
  );
}

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function MutationRow({ m, onPress, showArticle = true }: { m: Mutation; onPress?: () => void; showArticle?: boolean }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const tone = m.delta > 0 ? colors.success : m.delta < 0 ? colors.error : colors.muted;
  const iconBg = m.type === "ontvangst" ? colors.successSoft : m.type === "afboeken" ? colors.errorSoft : m.type === "retour" ? colors.infoSoft : colors.warningSoft;
  const iconFg = m.type === "ontvangst" ? colors.onSuccessSoft : m.type === "afboeken" ? colors.onErrorSoft : m.type === "retour" ? colors.onInfoSoft : colors.onWarningSoft;
  return (
    <Pressable testID={`mutation-row-${m.id}`} onPress={onPress} disabled={!onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfaceTertiary }]}>
      <View style={[styles.mutIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={MUTATION_ICONS[m.type] as IconName} size={20} color={iconFg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {MUTATION_LABELS[m.type]}
          {showArticle ? <Text style={styles.sku}>{"  "}{m.article_number}</Text> : null}
        </Text>
        {showArticle && (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {m.article_description}
          </Text>
        )}
        <Text style={styles.rowMeta} numberOfLines={1}>
          {formatDateTime(m.created_at)} · {m.user_name}
        </Text>
        {!!m.project && (
          <Text style={styles.rowMeta} numberOfLines={1} testID={`mutation-project-${m.id}`}>
            Project {m.project}
            {m.reservation_consumed ? ` · ${m.reservation_consumed} uit reservering` : ""}
          </Text>
        )}
        {!!m.note && (
          <Text style={styles.note} numberOfLines={2}>
            “{m.note}”
          </Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.delta, { color: tone }]}>
          {m.delta > 0 ? "+" : ""}
          {m.delta}
        </Text>
        <Text style={styles.stockChange}>
          {m.stock_before} → {m.stock_after}
        </Text>
      </View>
    </Pressable>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  btn: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  btnCompact: { minHeight: 44, paddingHorizontal: spacing.md },
  btnText: { fontSize: fontSize.lg, fontWeight: "600" },
  field: { gap: 6 },
  label: { fontSize: fontSize.sm, fontWeight: "600", color: c.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: 48,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.md,
    backgroundColor: c.surfaceSecondary,
    paddingHorizontal: spacing.md,
  },
  inputDisabled: { backgroundColor: c.surfaceTertiary },
  input: { flex: 1, fontSize: fontSize.lg, color: c.onSurface, paddingVertical: spacing.md, outlineStyle: "none" } as any,
  errorText: { fontSize: fontSize.sm, color: c.error, fontWeight: "500" },
  hint: { fontSize: fontSize.sm, color: c.muted },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  chipText: { fontSize: fontSize.base, fontWeight: "500" },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  state: { alignItems: "center", paddingVertical: spacing["3xl"], paddingHorizontal: spacing.xl, gap: spacing.sm },
  stateIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  stateTitle: { fontSize: fontSize.lg, fontWeight: "600", color: c.onSurface, textAlign: "center" },
  stateText: { fontSize: fontSize.base, color: c.muted, textAlign: "center", marginBottom: spacing.sm },
  pill: { flexDirection: "row", alignItems: "baseline", gap: 3, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, minWidth: 64, justifyContent: "center" },
  pillNum: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700" },
  pillUnit: { fontSize: 11, fontWeight: "500" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: c.surfaceSecondary,
    borderBottomWidth: 1,
    borderBottomColor: c.divider,
    minHeight: 64,
  },
  sku: { fontFamily: mono, fontSize: fontSize.sm, color: c.brandSecondary, fontWeight: "600" },
  rowTitle: { fontSize: fontSize.base, fontWeight: "600", color: c.onSurface },
  rowMeta: { fontSize: fontSize.sm, color: c.muted },
  note: { fontSize: fontSize.sm, color: c.onSurfaceTertiary, fontStyle: "italic" },
  mutIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  delta: { fontFamily: mono, fontSize: fontSize.lg, fontWeight: "700" },
  stockChange: { fontFamily: mono, fontSize: 11, color: c.muted },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.sm },
  sectionTitle: { fontSize: fontSize.sm, fontWeight: "700", color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
}));
