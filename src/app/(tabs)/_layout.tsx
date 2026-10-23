import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { IconName } from "@/components/ui";
import { useTheme } from "@/lib/theme";

const TABS: { name: string; title: string; icon: IconName; activeIcon: IconName }[] = [
  { name: "index", title: "Home", icon: "home-outline", activeIcon: "home" },
  { name: "devotional", title: "Today", icon: "sunny-outline", activeIcon: "sunny" },
  { name: "bible", title: "Bible", icon: "book-outline", activeIcon: "book" },
  { name: "prayers", title: "Prayers", icon: "heart-outline", activeIcon: "heart" },
  { name: "community", title: "Community", icon: "people-outline", activeIcon: "people" },
];

export default function TabLayout() {
  const { colors } = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.background, borderTopColor: colors.border },
      }}
    >
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size, focused }) => <Ionicons name={focused ? t.activeIcon : t.icon} size={size} color={color as string} />,
          }}
        />
      ))}
    </Tabs>
  );
}
