import { Stack, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { AUTO_HIDE_REPORT_THRESHOLD } from "../../../shared/constants";
import { Screen, Text } from "@/components/ui";
import { spacing } from "@/lib/theme";

// In-app copies of the legal documents. Have counsel review these before launch and
// publish the same text at a public URL for the App Store / Play listings (see DEPLOYMENT.md).

const CONTACT = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "the support address listed on our App Store page";
const UPDATED = "October 23, 2026";

type Doc = { title: string; sections: { heading: string; body: string }[] };

const DOCS: Record<string, Doc> = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      {
        heading: "What we collect",
        body: "Your name, email address, and hashed password; your church tradition (if you choose one); your timezone and reminder settings; the prayers, notes, highlights, and bookmarks you create; your devotional history; and anything you post in the community. Purchases are handled by Apple or Google and our billing partner RevenueCat — we never see your card details.",
      },
      {
        heading: "How we use it",
        body: "To run the app: show your journal and history, write your daily devotional, schedule reminders, and keep your subscription active. We do not sell your data and we do not use it for advertising.",
      },
      {
        heading: "AI devotionals",
        body: "To write your devotional we send today's Bible passage, your church tradition, and — only if you type one — the short note about your day to Anthropic's Claude API. The note is not stored. Your prayer journal is never sent to AI. Prayer-topic suggestions use only how many prayers of each type you've written recently, not their contents.",
      },
      {
        heading: "Community",
        body: "Posts and comments are visible to other signed-in members along with your first name. You can delete your own posts at any time. Reports are reviewed by our moderators.",
      },
      {
        heading: "Your choices",
        body: "You can edit your profile, turn reminders off, and delete individual prayers or posts at any time. Settings → Delete account permanently erases your account and everything associated with it from our database.",
      },
      { heading: "Contact", body: `Questions about privacy? Contact us at ${CONTACT}.` },
    ],
  },
  terms: {
    title: "Terms of Use",
    sections: [
      {
        heading: "Using Daily Grace",
        body: "Daily Grace offers devotional content, Bible reading, a private prayer journal, and a community for encouragement. You must be at least 13 years old to use it. Keep your password safe; you're responsible for activity on your account.",
      },
      {
        heading: "Not professional advice",
        body: "Devotionals are generated with AI from Scripture and are for spiritual encouragement only. They are not pastoral counseling or medical, legal, financial, or mental-health advice. If you are in crisis, call or text 988 (US) or dial 911.",
      },
      {
        heading: "Subscriptions",
        body: "Grace Plus and Grace Pro are monthly auto-renewing subscriptions billed through the App Store or Google Play. They renew unless cancelled at least 24 hours before the period ends. You can manage or cancel in your store account settings. Refunds are handled by Apple or Google under their policies.",
      },
      {
        heading: "Community conduct",
        body: "Follow the Community Guidelines. We may remove content or suspend accounts that break them.",
      },
      {
        heading: "Scripture",
        body: "Scripture quotations are from the World English Bible (public domain) unless another licensed translation is shown.",
      },
      { heading: "Contact", body: `Contact us at ${CONTACT}.` },
    ],
  },
  guidelines: {
    title: "Community Guidelines",
    sections: [
      { heading: "Encourage one another", body: "Share what God is teaching you, pray for others, and respond with kindness — even when you disagree." },
      { heading: "Not allowed", body: "Harassment, hate, profanity, sexual content, spam or advertising, sharing others' private information, and content that mocks someone's faith." },
      {
        heading: "Prayer requests",
        body: "Share only what you're comfortable making visible to the whole community. Avoid details that could identify other people.",
      },
      {
        heading: "Reporting and blocking",
        body: `Use ••• on any post or comment to report it or block its author. Content that receives ${AUTO_HIDE_REPORT_THRESHOLD} reports is hidden until a moderator reviews it.`,
      },
      {
        heading: "If someone is at risk",
        body: "Report the post with “Someone may be at risk.” If there is immediate danger, call 911. The 988 Suicide & Crisis Lifeline is available by call or text.",
      },
    ],
  },
};

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = DOCS[doc ?? ""] ?? DOCS.terms;
  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: content.title }} />
      <Text variant="caption" muted>
        Last updated {UPDATED}
      </Text>
      {content.sections.map((s) => (
        <View key={s.heading} style={{ gap: spacing.xs }}>
          <Text variant="subheading">{s.heading}</Text>
          <Text>{s.body}</Text>
        </View>
      ))}
    </Screen>
  );
}
