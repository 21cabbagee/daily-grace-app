import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";

export const palettes = {
  light: {
    primary: "#2563EB",
    primaryText: "#FFFFFF",
    secondary: "#DC2626",
    accent: "#F59E0B",
    success: "#10B981",
    warning: "#F59E0B",
    error: "#EF4444",
    background: "#FFFFFF",
    surface: "#F8FAFC",
    foreground: "#0F172A",
    muted: "#64748B",
    border: "#E2E8F0",
    highlight: { yellow: "#FEF3C7", green: "#D1FAE5", blue: "#DBEAFE", pink: "#FCE7F3" },
  },
  dark: {
    primary: "#60A5FA",
    primaryText: "#0B1220",
    secondary: "#F87171",
    accent: "#FBBF24",
    success: "#34D399",
    warning: "#FBBF24",
    error: "#F87171",
    background: "#0B1220",
    surface: "#111A2E",
    foreground: "#F1F5F9",
    muted: "#94A3B8",
    border: "#1E293B",
    highlight: { yellow: "#4A3B10", green: "#0F3B2E", blue: "#13294B", pink: "#4A1D35" },
  },
} as const;

export type Palette = (typeof palettes)["light"] | (typeof palettes)["dark"];
export type ThemePreference = "system" | "light" | "dark";

interface ThemeState {
  colors: Palette;
  scheme: "light" | "dark";
  preference: ThemePreference;
  setPreference: (p: ThemePreference) => void;
  largeText: boolean;
  setLargeText: (v: boolean) => void;
  /** Multiply font sizes by this; respects the in-app "Large text" setting on top of OS scaling. */
  fontScale: number;
}

const ThemeContext = createContext<ThemeState | null>(null);
const PREF_KEY = "dg.theme";
const LARGE_KEY = "dg.largeText";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>("system");
  const [largeText, setLargeTextState] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([PREF_KEY, LARGE_KEY])
      .then(([[, pref], [, large]]) => {
        if (pref === "light" || pref === "dark" || pref === "system") setPreferenceState(pref);
        setLargeTextState(large === "1");
      })
      .catch(() => {});
  }, []);

  const value = useMemo<ThemeState>(() => {
    const scheme = preference === "system" ? (system === "dark" ? "dark" : "light") : preference;
    return {
      colors: palettes[scheme],
      scheme,
      preference,
      setPreference: (p) => {
        setPreferenceState(p);
        AsyncStorage.setItem(PREF_KEY, p).catch(() => {});
      },
      largeText,
      setLargeText: (v) => {
        setLargeTextState(v);
        AsyncStorage.setItem(LARGE_KEY, v ? "1" : "0").catch(() => {});
      },
      fontScale: largeText ? 1.2 : 1,
    };
  }, [preference, system, largeText]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
