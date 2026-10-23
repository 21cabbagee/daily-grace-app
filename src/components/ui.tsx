import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { radius, spacing, useTheme } from "@/lib/theme";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Screen({
  children,
  scroll = true,
  edges = ["top"],
  padded = true,
}: {
  children: ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  padded?: boolean;
}) {
  const { colors } = useTheme();
  const inner = padded ? { padding: spacing.lg, gap: spacing.lg } : undefined;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: spacing.xxl }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const variants = {
  title: { fontSize: 28, fontWeight: "700", lineHeight: 34 },
  heading: { fontSize: 20, fontWeight: "700", lineHeight: 26 },
  subheading: { fontSize: 17, fontWeight: "600", lineHeight: 23 },
  body: { fontSize: 16, lineHeight: 24 },
  scripture: { fontSize: 18, lineHeight: 30, fontFamily: "Georgia" },
  caption: { fontSize: 13, lineHeight: 18 },
  label: { fontSize: 14, fontWeight: "600", lineHeight: 20 },
} satisfies Record<string, TextStyle>;

export function Text({
  children,
  variant = "body",
  color,
  muted,
  style,
  ...rest
}: {
  children: ReactNode;
  variant?: keyof typeof variants;
  color?: string;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
} & Omit<ComponentProps<typeof RNText>, "style">) {
  const { colors, fontScale } = useTheme();
  const v = variants[variant];
  return (
    <RNText
      style={[
        v,
        { color: color ?? (muted ? colors.muted : colors.foreground), fontSize: v.fontSize * fontScale, lineHeight: v.lineHeight * fontScale },
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string }) {
  const { colors } = useTheme();
  const base = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.primary, secondary: colors.surface, ghost: "transparent", danger: colors.error }[variant];
  const fg = { primary: colors.primaryText, secondary: colors.foreground, ghost: colors.primary, danger: "#FFFFFF" }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === "secondary" ? colors.border : bg, opacity: inactive ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, color, size = 22 }: { icon: IconName; label: string; onPress: () => void; color?: string; size?: number }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={8} style={styles.iconButton}>
      <Ionicons name={icon} size={size} color={color ?? colors.foreground} />
    </Pressable>
  );
}

export function Field({ label, error, style, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  const { colors, fontScale } = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? <Text variant="label">{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.muted}
        accessibilityLabel={label ?? props.placeholder}
        style={[
          styles.input,
          { color: colors.foreground, borderColor: error ? colors.error : colors.border, backgroundColor: colors.background, fontSize: 16 * fontScale },
          props.multiline && { minHeight: 110, textAlignVertical: "top" },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text variant="caption" color={colors.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border }]}
    >
      <Text variant="caption" color={selected ? colors.primaryText : colors.foreground} style={{ fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Row({ children, style, gap = spacing.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: "row", alignItems: "center", gap }, style]}>{children}</View>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.state} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.primary} />
      <Text muted>{label}</Text>
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.state} accessibilityRole="alert">
      <Ionicons name="cloud-offline-outline" size={32} color={colors.muted} />
      <Text muted style={{ textAlign: "center" }}>
        {message}
      </Text>
      {onRetry ? <Button title="Try again" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: IconName; title: string; message?: string; action?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.state}>
      <Ionicons name={icon} size={36} color={colors.muted} />
      <Text variant="subheading" style={{ textAlign: "center" }}>
        {title}
      </Text>
      {message ? (
        <Text muted style={{ textAlign: "center" }}>
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.sm },
  button: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  iconButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  input: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  chip: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, justifyContent: "center" },
  state: { alignItems: "center", justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
});
