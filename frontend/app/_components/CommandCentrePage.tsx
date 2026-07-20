"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import {
	AlertTriangle,
	ArrowRight,
	BrainCircuit,
	CheckCircle2,
	ClipboardCheck,
	FileText,
	Gauge,
	MessageSquareText,
	Network,
	ShieldCheck,
	UploadCloud,
	Wrench,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import { DocumentUploader } from "@/components/DocumentUploader";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
	AppIcon,
	EmptyState,
	SkeletonBlock,
	cn,
	type IconType,
} from "@/components/UI";
import { GetAssets, GetComplianceGaps, GetDashboard } from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type { Asset, ComplianceGap, DashboardSummary } from "@/lib/types";
import { useAsyncResource } from "@/lib/useAsyncResource";

type DashboardData = {
	summary: DashboardSummary;
	assets: Asset[];
	gaps: ComplianceGap[];
};

const EmptyAssets: Asset[] = [];
const EmptyGaps: ComplianceGap[] = [];

const ChartColours = [
	"var(--app-chart-1)",
	"var(--app-chart-2)",
	"var(--app-chart-3)",
	"var(--app-chart-4)",
	"var(--app-chart-5)",
];

async function LoadDashboardData(): Promise<DashboardData> {
	const [summary, assets, gaps] = await Promise.all([
		GetDashboard(),
		GetAssets(),
		GetComplianceGaps(),
	]);
	return { summary, assets, gaps };
}

export default function DashboardPage() {
	const { data, error, isLoading, isRefreshing, reload } =
		useAsyncResource<DashboardData>("dashboard", LoadDashboardData);
	const summary = data?.summary;
	const assets = data?.assets ?? EmptyAssets;
	const gaps = data?.gaps ?? EmptyGaps;

	const riskRows = useMemo(
		() =>
			Object.entries(
				assets.reduce<Record<string, number>>((acc, asset) => {
					acc[asset.risk_level] = (acc[asset.risk_level] ?? 0) + 1;
					return acc;
				}, {}),
			).map(([name, value]) => ({ name, value })),
		[assets],
	);
	const severityRows = useMemo(
		() =>
			Object.entries(
				gaps.reduce<Record<string, number>>((acc, gap) => {
					acc[gap.severity] = (acc[gap.severity] ?? 0) + 1;
					return acc;
				}, {}),
			).map(([name, value]) => ({ name, value })),
		[gaps],
	);
	const failureRows =
		summary?.top_failure_modes.map((item) => ({
			name: item.failure_mode,
			value: item.count,
		})) ?? [];
	const newestDocument = summary?.recent_uploads[0];
	const priorityGap =
		gaps.find((gap) => gap.severity.toLowerCase() === "high") ?? gaps[0];
	const highRiskAsset =
		assets.find((asset) => asset.risk_level.toLowerCase().includes("high")) ??
		assets[0];
	const hasDocuments = Boolean((summary?.total_documents ?? 0) > 0);

	return (
		<>
			<PageHeader
				actions={
					hasDocuments ? (
						<div className="flex flex-wrap gap-2">
							<ActionLink
								href="/documents"
								icon={UploadCloud}
								variant="secondary"
							>
								Analyse Evidence
							</ActionLink>
							<ActionLink
								href="/chat"
								icon={MessageSquareText}
								variant="primary"
							>
								Ask With Citations
							</ActionLink>
						</div>
					) : null
				}
				icon={Gauge}
				title="Command Centre"
				subtitle="Evidence readiness, risk, compliance, and next actions."
			/>
			{error ? <ErrorBanner message={error} refreshing={isRefreshing} /> : null}
			{isLoading && !data ? (
				<DashboardSkeleton />
			) : !data ? (
				<EmptyState
					icon={AlertTriangle}
					message="Upload documents and analyse the workspace to populate the command centre."
					title="Workspace Data Unavailable"
				/>
			) : !hasDocuments ? (
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)]">
					<DocumentUploader
						intro="Start with plant evidence. Uploading indexes the source files, then analysis extracts assets, events, gaps, and graph links."
						onUploaded={() => reload(true)}
					/>
					<DataCard
						description="Use this exact flow during the demo so judges see live provenance rather than prepared output."
						eyebrow="Demo Flow"
						title="Run Sequence"
					>
						<div className="space-y-3">
							<ReadinessStep
								active
								icon={UploadCloud}
								label="Upload plant files"
								meta="PDF, DOCX, TXT, CSV, XLSX"
							/>
							<ReadinessStep
								icon={BrainCircuit}
								label="Analyse workspace"
								meta="Extract assets, events, controls, and gaps"
							/>
							<ReadinessStep
								icon={MessageSquareText}
								label="Ask a cited question"
								meta="Show answer, sources, and graph path"
							/>
							<ReadinessStep
								icon={Wrench}
								label="Generate RCA"
								meta="Export or print evidence backed output"
							/>
						</div>
					</DataCard>
				</div>
			) : (
				<div className="space-y-4">
					<section className="overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-panel">
						<div className="grid gap-0 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
							<div className="min-w-0 p-5">
								<div className="flex flex-wrap items-center gap-2">
									<StatusBadge value="Evidence Ready" />
									<StatusBadge
										value={`${summary?.recent_uploads.length ?? 0} Recent Files`}
									/>
								</div>
								<h2 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight text-app-text sm:text-4xl">
									Operational intelligence built only from uploaded evidence.
								</h2>
								<p className="mt-3 max-w-3xl text-sm leading-6 text-app-muted">
									The workspace has source files, generated records, compliance
									gaps, and risk signals ready for cited review.
								</p>
								<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
									<HeroMetric
										icon={FileText}
										label="Documents"
										value={summary?.total_documents ?? 0}
									/>
									<HeroMetric
										icon={Gauge}
										label="Assets"
										value={summary?.total_assets ?? 0}
									/>
									<HeroMetric
										icon={ShieldCheck}
										label="Open Gaps"
										value={summary?.detected_compliance_gaps ?? 0}
										tone="amber"
									/>
									<HeroMetric
										icon={AlertTriangle}
										label="High Risk"
										value={summary?.high_risk_assets ?? 0}
										tone="red"
									/>
								</div>
							</div>
							<div className="border-t border-app-border bg-app-panel p-5 xl:border-l xl:border-t-0">
								<p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-app-subtle">
									Priority Signal
								</p>
								<div className="mt-4 space-y-3">
									<SignalPanel
										href="/assets"
										icon={Gauge}
										label={
											highRiskAsset
												? highRiskAsset.name
												: "Review Asset Register"
										}
										meta={
											highRiskAsset
												? `${highRiskAsset.id} / ${FormatDisplayLabel(
														highRiskAsset.risk_level,
													)} risk`
												: "No generated asset record yet"
										}
									/>
									<SignalPanel
										href="/compliance"
										icon={ClipboardCheck}
										label={
											priorityGap
												? FormatDisplayLabel(priorityGap.gap_type)
												: "Review Compliance"
										}
										meta={
											priorityGap
												? `${priorityGap.asset_id}: ${priorityGap.corrective_action}`
												: "No compliance finding available"
										}
									/>
									<SignalPanel
										href="/graph"
										icon={Network}
										label="Trace Evidence Path"
										meta="Open the graph to show generated relationships."
									/>
								</div>
							</div>
						</div>
					</section>

					<div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
						<div className="min-w-0 space-y-4">
							<DataCard
								action={<StatusBadge value={`${assets.length} Assets`} />}
								description="Risk and compliance distribution should be legible without opening a detail page."
								eyebrow="Operations Load"
								title="Risk Board"
							>
								<div className="grid gap-5 lg:grid-cols-2">
									<DistributionBars rows={riskRows} title="Asset Risk Mix" />
									<DistributionBars
										rows={severityRows}
										title="Gap Severity Mix"
									/>
								</div>
								<div className="mt-6">
									<h3 className="text-sm font-semibold text-app-text">
										Top Failure Modes
									</h3>
									{failureRows.length ? (
										<div className="mt-3">
											<HorizontalBars rows={failureRows} />
										</div>
									) : (
										<EmptyState
											icon={Wrench}
											message="Failure modes appear after workspace analysis."
											title="No Failure Modes Yet"
										/>
									)}
								</div>
							</DataCard>

							<DataCard
								action={
									<ActionLink
										href="/documents"
										icon={FileText}
										variant="secondary"
									>
										View All
									</ActionLink>
								}
								description={
									newestDocument
										? `Latest source: ${newestDocument.filename}`
										: "No recent upload metadata is available."
								}
								eyebrow="Source Ledger"
								title="Recent Evidence"
							>
								{summary?.recent_uploads.length ? (
									<div className="overflow-hidden rounded-lg border border-app-border">
										{summary.recent_uploads.slice(0, 6).map((document) => (
											<Link
												className="group flex min-w-0 items-center justify-between gap-3 border-b border-app-border bg-app-panel px-3 py-3 last:border-b-0 hover:bg-app-hover"
												href="/documents"
												key={document.id}
											>
												<div className="min-w-0">
													<p className="truncate text-sm font-semibold text-app-text">
														{document.filename}
													</p>
													<p className="mt-1 text-xs text-app-subtle">
														{FormatDisplayLabel(document.document_type)} /{" "}
														{document.page_count} pages /{" "}
														{document.character_count.toLocaleString("en-IN")}{" "}
														chars
													</p>
												</div>
												<StatusBadge
													value={document.ocr_used ? "OCR" : "Text"}
												/>
											</Link>
										))}
									</div>
								) : (
									<EmptyState
										icon={FileText}
										message="Upload documents to build the source ledger."
										title="No Documents Yet"
									/>
								)}
							</DataCard>
						</div>

						<div className="min-w-0 space-y-4">
							<DataCard
								description="Use these in sequence for a short judge walkthrough."
								eyebrow="Next Best Actions"
								title="Demo Controls"
							>
								<div className="grid gap-2">
									<QuickAction
										href="/chat"
										icon={MessageSquareText}
										label="Ask a Question"
										meta="Answer with citations and confidence"
									/>
									<QuickAction
										href="/assets"
										icon={Gauge}
										label="Review Assets"
										meta="Risk, timeline, actions, evidence pack"
									/>
									<QuickAction
										href="/graph"
										icon={Network}
										label="Trace Graph"
										meta="Evidence, controls, failures, assets"
									/>
									<QuickAction
										href="/rca"
										icon={Wrench}
										label="Generate RCA"
										meta="Root cause report with supporting evidence"
									/>
								</div>
							</DataCard>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

function ErrorBanner({
	message,
	refreshing,
}: {
	message: string;
	refreshing: boolean;
}) {
	return (
		<div className="mb-4 rounded-lg border border-tone-red-border bg-tone-red-bg p-4 text-sm font-semibold text-tone-red-text">
			{message}
			{refreshing ? " Refreshing previous data." : ""}
		</div>
	);
}

function HeroMetric({
	icon: Icon,
	label,
	tone = "slate",
	value,
}: {
	icon: IconType;
	label: string;
	tone?: "slate" | "amber" | "red";
	value: ReactNode;
}) {
	return (
		<div
			className={cn(
				"min-w-0 rounded-lg border p-3 shadow-[var(--app-shadow-tight)]",
				tone === "red"
					? "border-tone-red-border bg-tone-red-bg"
					: tone === "amber"
						? "border-tone-amber-border bg-tone-amber-bg"
						: "border-app-border bg-app-panel",
			)}
		>
			<div className="flex items-center justify-between gap-3">
				<p className="truncate text-xs font-semibold text-app-muted">{label}</p>
				<AppIcon
					className={cn(
						"size-4",
						tone === "red"
							? "text-tone-red-text"
							: tone === "amber"
								? "text-tone-amber-text"
								: "text-app-subtle",
					)}
					icon={Icon}
				/>
			</div>
			<p className="mt-3 font-mono text-3xl font-semibold leading-none text-app-text">
				{value}
			</p>
		</div>
	);
}

function ActionLink({
	children,
	href,
	icon: Icon,
	variant,
}: {
	children: string;
	href: string;
	icon: IconType;
	variant: "primary" | "secondary";
}) {
	return (
		<Link
			className={cn(
				"inline-flex max-w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-all duration-200 ease-out active:scale-[0.98]",
				variant === "primary"
					? "border-app-primary bg-app-primary text-app-on-primary hover:border-app-primary-hover hover:bg-app-primary-hover"
					: "border-app-border bg-app-surface text-app-text hover:border-app-border-strong hover:bg-app-hover",
			)}
			href={href}
		>
			<AppIcon className="size-4" icon={Icon} />
			<span className="min-w-0 truncate">{children}</span>
		</Link>
	);
}

function SignalPanel({
	href,
	icon: Icon,
	label,
	meta,
}: {
	href: string;
	icon: IconType;
	label: string;
	meta: string;
}) {
	return (
		<Link
			className="group flex min-w-0 items-start gap-3 rounded-lg border border-app-border bg-app-surface p-3 shadow-[var(--app-shadow-tight)] transition-all duration-200 ease-out hover:border-app-border-strong hover:bg-app-hover active:scale-[0.99]"
			href={href}
		>
			<AppIcon className="mt-0.5 size-4 text-app-primary" icon={Icon} />
			<span className="min-w-0 flex-1">
				<span className="block font-semibold text-app-text">{label}</span>
				<span className="mt-1 line-clamp-2 text-sm leading-6 text-app-muted">
					{meta}
				</span>
			</span>
			<AppIcon
				className="mt-1 size-4 text-app-subtle transition-transform duration-200 ease-out group-hover:translate-x-0.5"
				icon={ArrowRight}
			/>
		</Link>
	);
}

function DistributionBars({
	rows,
	title,
}: {
	rows: { name: string; value: number }[];
	title: string;
}) {
	const total = rows.reduce((sum, row) => sum + row.value, 0);
	return (
		<section>
			<h3 className="text-sm font-semibold text-app-text">{title}</h3>
			{rows.length ? (
				<div className="mt-3 space-y-3">
					{rows.map((row, index) => (
						<div key={row.name}>
							<div className="mb-1 flex items-center justify-between gap-3 text-sm">
								<span className="truncate font-semibold text-app-text">
									{FormatDisplayLabel(row.name)}
								</span>
								<span className="font-mono text-app-subtle">{row.value}</span>
							</div>
							<div className="h-2 overflow-hidden rounded-full bg-app-hover">
								<div
									className="h-full rounded-full"
									style={{
										background: ChartColours[index % ChartColours.length],
										width: `${total ? (row.value / total) * 100 : 0}%`,
									}}
								/>
							</div>
						</div>
					))}
				</div>
			) : (
				<p className="mt-3 text-sm text-app-muted">No generated rows yet.</p>
			)}
		</section>
	);
}

function HorizontalBars({ rows }: { rows: { name: string; value: number }[] }) {
	const max = Math.max(...rows.map((row) => row.value), 1);
	return (
		<div className="space-y-4">
			{rows.map((row, index) => (
				<div key={row.name}>
					<div className="mb-2 flex items-center justify-between gap-3 text-sm">
						<span className="truncate font-semibold text-app-text">
							{FormatDisplayLabel(row.name)}
						</span>
						<StatusBadge value={row.value} />
					</div>
					<div className="h-3 overflow-hidden rounded-full bg-app-hover">
						<div
							className="h-full rounded-full"
							style={{
								background: ChartColours[index % ChartColours.length],
								width: `${(row.value / max) * 100}%`,
							}}
						/>
					</div>
				</div>
			))}
		</div>
	);
}

function QuickAction({
	href,
	icon: Icon,
	label,
	meta,
}: {
	href: string;
	icon: IconType;
	label: string;
	meta: string;
}) {
	return (
		<Link
			className="group flex min-w-0 items-start gap-3 rounded-lg border border-app-border bg-app-panel p-3 transition-all duration-200 ease-out hover:border-app-border-strong hover:bg-app-hover active:scale-[0.99]"
			href={href}
		>
			<AppIcon className="mt-1 size-4 text-app-subtle" icon={Icon} />
			<span className="min-w-0 flex-1">
				<span className="block break-words font-semibold text-app-text">
					{label}
				</span>
				<span className="mt-0.5 block text-sm leading-5 text-app-muted">
					{meta}
				</span>
			</span>
			<AppIcon
				className="mt-1 size-4 text-app-subtle transition-transform group-hover:translate-x-0.5"
				icon={ArrowRight}
			/>
		</Link>
	);
}

function ReadinessStep({
	active = false,
	icon: Icon,
	label,
	meta,
}: {
	active?: boolean;
	icon: IconType;
	label: string;
	meta: string;
}) {
	return (
		<div
			className={cn(
				"flex min-w-0 items-start gap-3 rounded-lg border p-3",
				active
					? "border-tone-teal-border bg-tone-teal-bg"
					: "border-app-border bg-app-panel",
			)}
		>
			<span
				className={cn(
					"inline-flex size-8 shrink-0 items-center justify-center rounded-lg border",
					active
						? "border-tone-teal-border bg-app-surface text-tone-teal-text"
						: "border-app-border bg-app-surface text-app-subtle",
				)}
			>
				<AppIcon className="size-4" icon={active ? CheckCircle2 : Icon} />
			</span>
			<span className="min-w-0">
				<span className="block text-sm font-semibold text-app-text">
					{label}
				</span>
				<span className="mt-1 block text-xs leading-5 text-app-muted">
					{meta}
				</span>
			</span>
		</div>
	);
}

function DashboardSkeleton() {
	return (
		<div className="space-y-6">
			<SkeletonBlock className="h-72" />
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(22rem,0.7fr)]">
				<SkeletonBlock className="h-96" />
				<SkeletonBlock className="h-96" />
			</div>
		</div>
	);
}
