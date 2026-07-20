"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useSyncExternalStore,
} from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/components/UI";

type Theme = "light" | "dark";

type ThemeContextValue = {
	theme: Theme;
	toggleTheme: () => void;
};

const ThemeStorageKey = "industrial-ops-brain-theme";
const ThemeChangeEvent = "industrial-ops-brain-theme-change";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function GetStoredTheme(): Theme | null {
	if (typeof window === "undefined") return null;
	try {
		const storedTheme = window.localStorage.getItem(ThemeStorageKey);
		return storedTheme === "light" || storedTheme === "dark"
			? storedTheme
			: null;
	} catch {
		return null;
	}
}

function ApplyTheme(theme: Theme) {
	document.documentElement.dataset.theme = theme;
	document.documentElement.style.colorScheme = theme;
}

function GetSystemTheme(): Theme | null {
	if (typeof window === "undefined" || !window.matchMedia) return null;
	if (window.matchMedia("(prefers-color-scheme: light)").matches)
		return "light";
	if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
	return null;
}

function GetResolvedTheme(): Theme {
	return GetStoredTheme() ?? GetSystemTheme() ?? "dark";
}

function SubscribeTheme(onStoreChange: () => void) {
	if (typeof window === "undefined") return () => undefined;

	const mediaQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
	const handleStorage = (event: StorageEvent) => {
		if (event.key !== ThemeStorageKey) return;
		ApplyTheme(GetResolvedTheme());
		onStoreChange();
	};
	const handleThemeChange = () => onStoreChange();
	const handleSystemThemeChange = () => {
		if (GetStoredTheme()) return;
		ApplyTheme(GetResolvedTheme());
		onStoreChange();
	};

	window.addEventListener("storage", handleStorage);
	window.addEventListener(ThemeChangeEvent, handleThemeChange);
	mediaQuery?.addEventListener("change", handleSystemThemeChange);

	return () => {
		window.removeEventListener("storage", handleStorage);
		window.removeEventListener(ThemeChangeEvent, handleThemeChange);
		mediaQuery?.removeEventListener("change", handleSystemThemeChange);
	};
}

export function ThemeProvider({ children }: { children: ReactNode }) {
	const theme = useSyncExternalStore<Theme>(
		SubscribeTheme,
		GetResolvedTheme,
		() => "dark",
	);

	const value = useMemo<ThemeContextValue>(
		() => ({
			theme,
			toggleTheme: () => {
				const nextTheme = theme === "dark" ? "light" : "dark";
				try {
					window.localStorage.setItem(ThemeStorageKey, nextTheme);
				} catch {
					// Keep the visible theme responsive even when storage is unavailable.
				}
				ApplyTheme(nextTheme);
				window.dispatchEvent(new Event(ThemeChangeEvent));
			},
		}),
		[theme],
	);

	return (
		<ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useTheme must be used inside ThemeProvider");
	}
	return context;
}

export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggleTheme } = useTheme();
	const isDark = theme === "dark";
	const label = isDark ? "Switch to light mode" : "Switch to dark mode";
	const Icon = isDark ? Moon : Sun;

	return (
		<IconButton
			aria-pressed={isDark}
			className={className}
			icon={Icon}
			label={label}
			onClick={toggleTheme}
			type="button"
		/>
	);
}
