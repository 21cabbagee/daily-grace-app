import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatReference } from "../../../shared/bible";
import { PLANS } from "../../../shared/constants";
import { Card, ErrorState, IconButton, LoadingState, Row, Text, type IconName } from "@/components/ui";
import { errorMessage, trpc } from "@/lib/api";
import { useUser } from "@/lib/session";
import { spacing, useTheme } from "@/lib/theme";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const QUICK: { label: string; icon: IconName; href: Href }[] = [
  { label: "Read the Bible", icon: "book-outline", href: "/bible" },
  { label: "Prayer journal", icon: "heart-outline", href: "/prayers" },
  { label: "Community", icon: "people-outline", href: "/community" },
  { label: "Bookmarks", icon: "bookmark-outline", href: "/bookmarks" },
];

export default function Home() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useUser();
  const verse = trpc.devotional.dailyVerse.useQuery();
  const today = trpc.devotional.today.useQuery();
  const utils = trpc.useUtils();
  const refreshing = verse.isRefetching || today.isRefetching;

  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const devotional = today.data?.devotional;
  const plan = PLANS.find((p) => p.tier === user.tier)!;

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void utils.devotional.invalidate();
              void utils.auth.me.invalidate();
            }}
          />
        }
      >
        <Row style={{ justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text variant="caption" muted>
              {dateLabel.toUpperCase()}
            </Text>
            <Text variant="title">
              {greeting()}, {user.name}
            </Text>
          </View>
          <IconButton icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} />
        </Row>

        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            <Row>
              <Ionicons name="flame" size={22} color={colors.accent} />
              <Text variant="subheading">
                {user.streakCount} day{user.streakCount === 1 ? "" : "s"} streak
              </Text>
            </Row>
            <Text variant="caption" muted>
              Best: {user.longestStreak}
            </Text>
          </Row>
          <Text muted variant="caption">
            Finish a devotional each day to grow your streak.
          </Text>
        </Card>

        <Card
          onPress={() =>
            verse.data &&
            router.push({ pathname: "/bible", params: { book: verse.data.bookId, chapter: String(verse.data.chapter), verse: String(verse.data.verseStart) } })
          }
          accessibilityLabel="Today's verse. Opens in the Bible reader."
        >
          <Text variant="caption" muted>
            TODAY&apos;S VERSE
          </Text>
          {verse.isLoading ? (
            <LoadingState />
          ) : verse.error ? (
            <ErrorState message={errorMessage(verse.error)} onRetry={() => verse.refetch()} />
          ) : verse.data ? (
            <>
              <Text variant="scripture">“{verse.data.text}”</Text>
              <Row style={{ justifyContent: "space-between" }}>
                <Text variant="label" color={colors.primary}>
                  {verse.data.reference}
                </Text>
                <Text variant="caption" muted>
                  {verse.data.translationName}
                </Text>
              </Row>
            </>
          ) : null}
        </Card>

        <Card onPress={() => router.push("/devotional")} accessibilityLabel="Open today's devotional">
          <Row style={{ justifyContent: "space-between" }}>
            <Text variant="caption" muted>
              TODAY&apos;S DEVOTIONAL
            </Text>
            {devotional?.readAt ? <Ionicons name="checkmark-circle" size={18} color={colors.success} /> : null}
          </Row>
          {today.isLoading ? (
            <LoadingState />
          ) : devotional ? (
            <>
              <Text variant="heading">{devotional.title}</Text>
              <Text muted numberOfLines={3}>
                {devotional.openingReflection}
              </Text>
              <Text variant="label" color={colors.primary}>
                {devotional.readAt ? "Read again" : "Continue reading"} →
              </Text>
            </>
          ) : (
            <>
              <Text variant="heading">Ready when you are</Text>
              <Text muted>
                A devotional on {today.data ? formatReference(today.data.reference) : "today's verse"}, written for you.
              </Text>
              {today.data?.quota.remaining != null ? (
                <Text variant="caption" muted>
                  {today.data.quota.remaining} of {today.data.quota.limit} free devotionals left this week
                </Text>
              ) : null}
              <Text variant="label" color={colors.primary}>
                Begin →
              </Text>
            </>
          )}
        </Card>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.md }}>
          {QUICK.map((q) => (
            <Card key={q.label} style={{ flexBasis: "47%", flexGrow: 1 }} onPress={() => router.push(q.href)} accessibilityLabel={q.label}>
              <Ionicons name={q.icon} size={22} color={colors.primary} />
              <Text variant="label">{q.label}</Text>
            </Card>
          ))}
        </View>

        {user.tier === "free" ? (
          <Card onPress={() => router.push("/paywall")} accessibilityLabel="See Grace Plus and Grace Pro plans">
            <Row>
              <Ionicons name="sparkles" size={18} color={colors.accent} />
              <Text variant="subheading">Go deeper with Grace Plus</Text>
            </Row>
            <Text muted>Unlimited devotionals, AI prayer ideas, and your full history.</Text>
          </Card>
        ) : (
          <Text variant="caption" muted style={{ textAlign: "center" }}>
            You&apos;re on {plan.name}. Thank you for supporting Daily Grace.
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
