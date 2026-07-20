import type { Metadata, Viewport } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { ThemeProvider } from "@/components/Theme";
import { BuildRootMetadata } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = BuildRootMetadata();

export const viewport: Viewport = {
	colorScheme: "light dark",
	themeColor: [
		{ color: "#08776d", media: "(prefers-color-scheme: light)" },
		{ color: "#4cd6c8", media: "(prefers-color-scheme: dark)" },
	],
};

const ThemeBootstrapScript = `
try {
	const storageKey = "industrial-ops-brain-theme";
	const storedTheme = window.localStorage.getItem(storageKey);
	const systemTheme = window.matchMedia("(prefers-color-scheme: light)").matches
		? "light"
		: window.matchMedia("(prefers-color-scheme: dark)").matches
			? "dark"
			: "dark";
	const theme = storedTheme === "light" || storedTheme === "dark" ? storedTheme : systemTheme;
	document.documentElement.dataset.theme = theme;
	document.documentElement.style.colorScheme = theme;
} catch {
	document.documentElement.dataset.theme = "dark";
	document.documentElement.style.colorScheme = "dark";
}
`;

export default function RootLayout({
	children,
}: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en-IN" suppressHydrationWarning>
			<body>
				<Script
					dangerouslySetInnerHTML={{ __html: ThemeBootstrapScript }}
					id="theme-bootstrap"
					strategy="beforeInteractive"
				/>
				<ThemeProvider>
					<AppShell>{children}</AppShell>
				</ThemeProvider>
			</body>
		</html>
	);
}
