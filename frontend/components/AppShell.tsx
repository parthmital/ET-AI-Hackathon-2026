"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
	BrainCircuit,
	FileUp,
	Gauge,
	LayoutDashboard,
	Menu,
	MessageSquareText,
	Network,
	Server,
	ShieldCheck,
	Sparkles,
	Wrench,
	X,
} from "lucide-react";
import { AppIcon, IconButton, cn, type IconType } from "@/components/UI";
import { ThemeToggle } from "@/components/Theme";
import { Brand } from "@/lib/brand";
import { GetHealth } from "@/lib/api";
import { FormatDisplayLabel, FormatProviderName } from "@/lib/format";
import { InstallFrontendTerminalLogging } from "@/lib/terminalLogging";
import type { HealthResponse } from "@/lib/types";
import { DataRefreshEvent } from "@/lib/useAsyncResource";

const NavigationItems = [
	{
		href: "/",
		label: "Command Centre",
		icon: LayoutDashboard,
	},
	{
		href: "/documents",
		label: "Evidence",
		icon: FileUp,
	},
	{
		href: "/chat",
		label: "Ask",
		icon: MessageSquareText,
	},
	{
		href: "/assets",
		label: "Assets",
		icon: Gauge,
	},
	{
		href: "/graph",
		label: "Graph",
		icon: Network,
	},
	{
		href: "/compliance",
		label: "Compliance",
		icon: ShieldCheck,
	},
	{
		href: "/rca",
		label: "RCA",
		icon: Wrench,
	},
];

const ShellTransition = { duration: 0.2, ease: "easeOut" } as const;
const DrawerTransition = { duration: 0.22, ease: "easeOut" } as const;
const RailControlClass =
	"border-white/15 !bg-white/5 !text-app-rail-text shadow-none hover:!border-white/25 hover:!bg-white/10 hover:!text-app-rail-text";

export function AppShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const [health, setHealth] = useState<HealthResponse | null>(null);
	const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

	useEffect(() => {
		InstallFrontendTerminalLogging();
	}, []);

	useEffect(() => {
		let isCurrent = true;

		async function RefreshHealth() {
			try {
				const result = await GetHealth();
				if (!isCurrent) return;
				setHealth(result);
			} catch {
				if (!isCurrent) return;
				setHealth(null);
			}
		}

		void RefreshHealth();
		const interval = window.setInterval(RefreshHealth, 60000);
		window.addEventListener(DataRefreshEvent, RefreshHealth);
		return () => {
			isCurrent = false;
			window.clearInterval(interval);
			window.removeEventListener(DataRefreshEvent, RefreshHealth);
		};
	}, []);

	useEffect(() => {
		if (!isMobileSidebarOpen) return;

		const originalOverflow = document.body.style.overflow;

		function HandleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") setIsMobileSidebarOpen(false);
		}

		document.body.style.overflow = "hidden";
		document.addEventListener("keydown", HandleKeyDown);
		return () => {
			document.body.style.overflow = originalOverflow;
			document.removeEventListener("keydown", HandleKeyDown);
		};
	}, [isMobileSidebarOpen]);

	const currentRoute =
		NavigationItems.find((item) => item.href === pathname) ??
		NavigationItems[0];

	return (
		<div className="min-h-screen">
			<a className="skip-link print-hidden" href="#main-content">
				Skip to main content
			</a>
			<aside
				aria-label="Primary Navigation"
				className="print-hidden fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/10 bg-app-rail px-3 py-4 text-app-rail-text shadow-[18px_0_45px_rgba(0,0,0,0.18)] lg:flex"
			>
				<SidebarContent health={health} pathname={pathname} />
			</aside>
			<header className="print-hidden sticky top-0 z-30 border-b border-white/10 bg-app-rail px-3 py-3 text-app-rail-text shadow-panel lg:hidden">
				<div className="flex items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-2.5">
						<IconButton
							aria-controls="mobile-navigation-sidebar"
							aria-expanded={isMobileSidebarOpen}
							className={RailControlClass}
							icon={Menu}
							label="Open Navigation"
							onClick={() => setIsMobileSidebarOpen(true)}
						/>
						<div className="min-w-0">
							<p className="truncate text-sm font-semibold">
								{currentRoute.label}
							</p>
							<p className="truncate text-xs text-app-rail-muted">
								{Brand.name}
							</p>
						</div>
					</div>
					<ThemeToggle className={RailControlClass} />
				</div>
			</header>
			<AnimatePresence initial={false}>
				{isMobileSidebarOpen ? (
					<div className="print-hidden lg:hidden">
						<motion.button
							animate={{ opacity: 1 }}
							aria-label="Close Navigation"
							className="fixed inset-0 z-40 bg-black/60"
							exit={{ opacity: 0 }}
							initial={{ opacity: 0 }}
							onClick={() => setIsMobileSidebarOpen(false)}
							transition={ShellTransition}
							type="button"
						/>
						<motion.aside
							animate={{ opacity: 1, x: 0 }}
							aria-label="Primary Navigation"
							className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,calc(100vw-2.5rem))] flex-col border-r border-white/10 bg-app-rail px-3 py-4 text-app-rail-text shadow-panel"
							exit={{ opacity: 0, x: "-100%" }}
							id="mobile-navigation-sidebar"
							initial={{ opacity: 0, x: "-100%" }}
							transition={DrawerTransition}
						>
							<SidebarContent
								health={health}
								onNavigate={() => setIsMobileSidebarOpen(false)}
								pathname={pathname}
								showThemeToggle={false}
								trailingAction={
									<IconButton
										className={RailControlClass}
										icon={X}
										label="Close Navigation"
										onClick={() => setIsMobileSidebarOpen(false)}
									/>
								}
							/>
						</motion.aside>
					</div>
				) : null}
			</AnimatePresence>
			<main className="lg:pl-64" id="main-content" tabIndex={-1}>
				<AnimatePresence initial={false} mode="wait">
					<motion.div
						animate={{ opacity: 1, y: 0 }}
						className="min-w-0 w-full px-3 py-4 sm:px-4 lg:px-6 xl:px-8"
						exit={{ opacity: 0, y: 4 }}
						initial={{ opacity: 0, y: 6 }}
						key={pathname}
						transition={ShellTransition}
					>
						{children}
					</motion.div>
				</AnimatePresence>
			</main>
		</div>
	);
}

function SidebarContent({
	health,
	onNavigate,
	pathname,
	showThemeToggle = true,
	trailingAction,
}: {
	health: HealthResponse | null;
	onNavigate?: () => void;
	pathname: string;
	showThemeToggle?: boolean;
	trailingAction?: ReactNode;
}) {
	return (
		<>
			<div className="mb-4">
				<div className="flex min-w-0 items-center justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<span className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-app-primary">
							<AppIcon className="size-5" icon={BrainCircuit} />
						</span>
						<div className="min-w-0">
							<p className="break-words text-sm font-semibold leading-tight text-app-rail-text">
								{Brand.name}
							</p>
							<p className="mt-0.5 text-xs text-app-rail-muted">
								{Brand.event}
							</p>
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-1.5">
						{showThemeToggle ? (
							<ThemeToggle className={RailControlClass} />
						) : null}
						{trailingAction}
					</div>
				</div>
				<div className="mt-3 flex min-w-0 gap-2">
					<SystemChip
						icon={Server}
						label="Backend"
						value={health ? FormatDisplayLabel(health.status) : "Offline"}
						active={Boolean(health)}
					/>
					<SystemChip
						icon={Sparkles}
						label="LLM"
						value={FormatProviderName(health?.active_provider || "Unknown")}
						active={Boolean(health?.llm_configured)}
					/>
				</div>
			</div>

			<nav
				aria-label="Main Navigation"
				className="app-rail-scrollbar min-h-0 flex-1 space-y-1 overflow-y-auto pr-1"
			>
				{NavigationItems.map((item) => (
					<NavLink
						href={item.href}
						icon={item.icon}
						isActive={pathname === item.href}
						key={item.href}
						label={item.label}
						onClick={onNavigate}
					/>
				))}
			</nav>

			<div className="mt-4 border-t border-white/10 pt-3 text-xs text-app-rail-muted">
				<span className="block truncate">
					{FormatDisplayLabel(health?.analysis.analysis_status ?? "not_run")} /{" "}
					{health?.analysis.documents_ingested ?? 0} files
				</span>
			</div>
		</>
	);
}

function SystemChip({
	active,
	icon: Icon,
	label,
	value,
}: {
	active: boolean;
	icon: IconType;
	label: string;
	value: string;
}) {
	return (
		<div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/10 px-2.5 py-2">
			<div className="flex min-w-0 items-center gap-1.5 text-app-rail-muted">
				<AppIcon className="size-3.5" icon={Icon} />
				<span className="truncate text-[0.68rem] font-semibold">{label}</span>
			</div>
			<p
				className={cn(
					"mt-1 truncate text-xs font-semibold",
					active ? "text-tone-emerald-text" : "text-tone-red-text",
				)}
			>
				{value}
			</p>
		</div>
	);
}

function NavLink({
	href,
	icon: Icon,
	isActive,
	label,
	onClick,
}: {
	href: string;
	icon: IconType;
	isActive: boolean;
	label: string;
	onClick?: () => void;
}) {
	return (
		<Link
			aria-current={isActive ? "page" : undefined}
			className={cn(
				"group flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2.5 transition-all duration-200 ease-out active:scale-[0.99]",
				isActive
					? "border-white/[0.18] bg-white/[0.12] text-app-rail-text"
					: "border-transparent text-app-rail-muted hover:border-white/10 hover:bg-white/[0.07] hover:text-app-rail-text",
			)}
			href={href}
			onClick={onClick}
		>
			<span
				className={cn(
					"inline-flex size-8 shrink-0 items-center justify-center rounded-lg border",
					isActive
						? "border-app-primary bg-app-primary text-app-on-primary"
						: "border-white/10 bg-white/[0.04] text-app-rail-muted group-hover:text-app-rail-text",
				)}
			>
				<AppIcon className="size-4" icon={Icon} strokeWidth={1.9} />
			</span>
			<span className="min-w-0 flex-1 truncate text-sm font-semibold">
				{label}
			</span>
		</Link>
	);
}
