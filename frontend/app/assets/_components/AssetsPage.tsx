"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	AlertTriangle,
	CalendarClock,
	CheckCircle2,
	ClipboardCheck,
	Download,
	Gauge,
	History,
	ListChecks,
	MapPin,
	Network,
	Search,
	Sparkles,
} from "lucide-react";
import { EvidenceList, EvidenceReferenceCard } from "@/components/Evidence";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
	AppIcon,
	Button,
	CustomCheckbox,
	EmptyState,
	PanelButton,
	SearchInput,
	SegmentedControl,
	SkeletonBlock,
	cn,
	type IconType,
} from "@/components/UI";
import {
	GetAssetEvidencePack,
	GetAssetRiskSummary,
	GetAssetTimeline,
	GetAssets,
} from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type {
	Asset,
	ComplianceGap,
	Contradiction,
	EvidenceReference,
	GraphPath,
	TimelineEvent,
} from "@/lib/types";
import { useAsyncResource } from "@/lib/useAsyncResource";

type WorkspaceMode = "Overview" | "Timeline" | "Gaps" | "Trace";

type RiskSummary = {
	asset_id: string;
	open_compliance_gaps: ComplianceGap[];
	failure_patterns: string[];
	suggested_next_actions: string[];
	suggested_action_evidence?: {
		action: string;
		evidence: EvidenceReference[];
	}[];
	risk_level: string;
	last_inspection: string | null;
	source_document?: string;
	source_page?: number;
	evidence_text?: string;
	graph_paths: GraphPath[];
	contradictions?: Contradiction[];
};

type AssetDetailData = {
	timeline: TimelineEvent[];
	risk: RiskSummary;
};

const EmptyAssets: Asset[] = [];
const EmptyTimeline: TimelineEvent[] = [];
const Modes: WorkspaceMode[] = ["Overview", "Timeline", "Gaps", "Trace"];

async function LoadAssetDetail(assetId: string): Promise<AssetDetailData> {
	const [timeline, risk] = await Promise.all([
		GetAssetTimeline(assetId),
		GetAssetRiskSummary(assetId),
	]);
	return { timeline, risk };
}

export default function AssetsPage() {
	const [selectedAssetId, setSelectedAssetId] = useState("");
	const [assetSearch, setAssetSearch] = useState("");
	const [mode, setMode] = useState<WorkspaceMode>("Overview");
	const [timelineFilter, setTimelineFilter] = useState("All");
	const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>(
		{},
	);
	const [exportStatus, setExportStatus] = useState("");
	const {
		data: assetsData,
		error: assetsError,
		isLoading: isLoadingAssets,
		isRefreshing: isRefreshingAssets,
	} = useAsyncResource<Asset[]>("assets", GetAssets);
	const assets = assetsData ?? EmptyAssets;
	const selectedAsset = assets.some((asset) => asset.id === selectedAssetId)
		? selectedAssetId
		: assets[0]?.id || "";
	const {
		data: detail,
		error: detailError,
		isLoading: isLoadingDetail,
		isRefreshing: isRefreshingDetail,
	} = useAsyncResource<AssetDetailData>(
		`asset-detail:${selectedAsset}`,
		() => LoadAssetDetail(selectedAsset),
		{ enabled: Boolean(selectedAsset) },
	);

	function SelectAsset(assetId: string) {
		setSelectedAssetId(assetId);
		setCheckedActions({});
		setTimelineFilter("All");
		setExportStatus("");
		setMode("Overview");
	}

	async function ExportAssetPack() {
		if (!selectedAsset) return;
		setExportStatus("");
		try {
			const pack = await GetAssetEvidencePack(selectedAsset);
			DownloadMarkdown(pack.filename, pack.markdown);
			setExportStatus("Evidence pack exported");
		} catch (error) {
			setExportStatus(error instanceof Error ? error.message : "Export failed");
		}
	}

	const selectedAssetRecord = assets.find(
		(asset) => asset.id === selectedAsset,
	);
	const filteredAssets = useMemo(() => {
		const query = assetSearch.trim().toLowerCase();
		if (!query) return assets;
		return assets.filter(
			(asset) =>
				asset.name.toLowerCase().includes(query) ||
				asset.id.toLowerCase().includes(query) ||
				asset.location.toLowerCase().includes(query),
		);
	}, [assetSearch, assets]);
	const timeline = detail?.timeline ?? EmptyTimeline;
	const risk = detail?.risk ?? null;
	const timelineTypes = useMemo(
		() => [
			"All",
			...Array.from(new Set(timeline.map((item) => item.event_type))).sort(),
		],
		[timeline],
	);
	const filteredTimeline = useMemo(
		() =>
			timeline.filter(
				(item) =>
					timelineFilter === "All" || item.event_type === timelineFilter,
			),
		[timeline, timelineFilter],
	);
	const error = assetsError || detailError;
	const isRefreshing = isRefreshingAssets || isRefreshingDetail;

	return (
		<>
			<PageHeader
				actions={
					<Button
						disabled={!selectedAsset}
						icon={Download}
						onClick={ExportAssetPack}
						type="button"
						variant="secondary"
					>
						Export Pack
					</Button>
				}
				icon={Gauge}
				title="Asset Risk Register"
				subtitle="Review risk, provenance, timeline evidence, gaps, and graph traces for each generated asset."
			/>
			{error ? (
				<div className="mb-4 rounded-lg border border-tone-red-border bg-tone-red-bg p-3 text-sm font-semibold text-tone-red-text">
					{error}
					{isRefreshing ? " Refreshing previous data." : ""}
				</div>
			) : null}
			{exportStatus ? (
				<div className="mb-4 rounded-lg border border-tone-teal-border bg-tone-teal-bg p-3 text-sm font-semibold text-tone-teal-text">
					{exportStatus}
				</div>
			) : null}

			{isLoadingAssets && !assets.length ? (
				<AssetsSkeleton />
			) : !assets.length ? (
				<EmptyState
					icon={Gauge}
					message="Upload documents and analyse the workspace to generate the asset register."
					title="No Assets Generated"
				/>
			) : (
				<div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
					<AssetRail
						assets={filteredAssets}
						onSearch={setAssetSearch}
						onSelect={SelectAsset}
						search={assetSearch}
						selectedAsset={selectedAsset}
						totalAssets={assets.length}
					/>

					<section
						aria-label="Selected asset workspace"
						className="min-w-0 rounded-lg border border-app-border bg-app-surface shadow-[var(--app-shadow-tight)]"
					>
						{selectedAssetRecord ? (
							<>
								<AssetWorkspaceHeader
									asset={selectedAssetRecord}
									isLoading={isLoadingDetail && !detail}
									risk={risk}
								/>
								<div className="border-b border-app-border px-4 py-3">
									<SegmentedControl
										onChange={(value) => setMode(value as WorkspaceMode)}
										options={Modes}
										value={mode}
									/>
								</div>
								<div className="min-h-[30rem] p-4">
									{isLoadingDetail && !detail ? (
										<div className="grid gap-3">
											<SkeletonBlock className="h-28" />
											<SkeletonBlock className="h-32" />
											<SkeletonBlock className="h-24" />
										</div>
									) : (
										<WorkspaceModePanel
											checkedActions={checkedActions}
											filteredTimeline={filteredTimeline}
											mode={mode}
											onCheckedActionsChange={setCheckedActions}
											onTimelineFilterChange={setTimelineFilter}
											risk={risk}
											timeline={timeline}
											timelineFilter={timelineFilter}
											timelineTypes={timelineTypes}
										/>
									)}
								</div>
							</>
						) : (
							<EmptyState
								icon={Gauge}
								message="Select an asset from the rail."
								title="No Asset Selected"
							/>
						)}
					</section>

					<AssetInspector
						asset={selectedAssetRecord ?? null}
						checkedActions={checkedActions}
						onExport={ExportAssetPack}
						risk={risk}
						timelineCount={timeline.length}
					/>
				</div>
			)}
		</>
	);
}

function AssetRail({
	assets,
	onSearch,
	onSelect,
	search,
	selectedAsset,
	totalAssets,
}: {
	assets: Asset[];
	onSearch: (value: string) => void;
	onSelect: (assetId: string) => void;
	search: string;
	selectedAsset: string;
	totalAssets: number;
}) {
	return (
		<aside className="min-w-0 rounded-lg border border-app-border bg-app-surface p-3 shadow-[var(--app-shadow-tight)] xl:sticky xl:top-4 xl:self-start">
			<div className="mb-3 flex items-center justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-app-text">Assets</h2>
					<p className="text-xs font-semibold text-app-subtle">
						{assets.length}/{totalAssets}
					</p>
				</div>
				<StatusBadge value={`${assets.length}/${totalAssets}`} />
			</div>
			<SearchInput
				className="mb-3"
				icon={Search}
				onValueChange={onSearch}
				placeholder="Search assets"
				value={search}
			/>
			<div className="space-y-2 xl:max-h-[calc(100vh-18rem)] xl:overflow-y-auto xl:pr-1">
				{assets.map((asset) => (
					<AssetListItem
						asset={asset}
						key={asset.id}
						onSelect={() => onSelect(asset.id)}
						selected={selectedAsset === asset.id}
					/>
				))}
			</div>
		</aside>
	);
}

function AssetListItem({
	asset,
	onSelect,
	selected,
}: {
	asset: Asset;
	onSelect: () => void;
	selected: boolean;
}) {
	return (
		<PanelButton onClick={onSelect} selected={selected}>
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0 flex-1">
					<span className="block truncate font-semibold">{asset.name}</span>
					<span
						className={cn(
							"mt-1 block truncate font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em]",
							selected ? "text-app-on-primary/75" : "text-app-subtle",
						)}
					>
						{asset.id} / {FormatDisplayLabel(asset.asset_type)}
					</span>
					<span
						className={cn(
							"mt-2 flex min-w-0 items-center gap-1 text-sm",
							selected ? "text-app-on-primary/75" : "text-app-subtle",
						)}
					>
						<AppIcon className="size-3.5" icon={MapPin} />
						<span className="truncate">{asset.location}</span>
					</span>
				</div>
				<StatusBadge
					className={
						selected
							? "border-white/30 bg-white/15 text-white before:bg-white"
							: ""
					}
					value={asset.risk_level}
				/>
			</div>
			<div
				className={cn(
					"mt-3 flex flex-wrap gap-2 text-xs font-semibold",
					selected ? "text-app-on-primary/75" : "text-app-subtle",
				)}
			>
				<span>{asset.open_compliance_gaps} open gaps</span>
				<span>{asset.last_inspection ?? "No inspection date"}</span>
			</div>
		</PanelButton>
	);
}

function AssetWorkspaceHeader({
	asset,
	isLoading,
	risk,
}: {
	asset: Asset;
	isLoading: boolean;
	risk: RiskSummary | null;
}) {
	const riskLevel = risk?.risk_level ?? asset.risk_level;
	const lastInspection =
		risk?.last_inspection ?? asset.last_inspection ?? "Not generated";
	const openGaps =
		risk?.open_compliance_gaps.length ?? asset.open_compliance_gaps;

	return (
		<header className="border-b border-app-border p-4">
			<div className="flex flex-wrap gap-2">
				<StatusBadge value={riskLevel} />
				<StatusBadge value={asset.asset_type} />
				{isLoading ? <StatusBadge value="Updating" /> : null}
			</div>
			<h2 className="mt-3 break-words text-2xl font-semibold leading-tight text-app-text">
				{asset.name}
			</h2>
			<p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6 text-app-muted">
				<span className="font-mono font-semibold text-app-subtle">
					{asset.id}
				</span>
				<span className="inline-flex min-w-0 items-center gap-1">
					<AppIcon className="size-4 text-app-subtle" icon={MapPin} />
					<span className="min-w-0 break-words">{asset.location}</span>
				</span>
			</p>
			<div className="mt-4 grid gap-2 sm:grid-cols-3">
				<AssetFact
					icon={AlertTriangle}
					label="Risk Level"
					value={FormatDisplayLabel(riskLevel)}
				/>
				<AssetFact
					icon={CalendarClock}
					label="Last Inspection"
					value={lastInspection}
				/>
				<AssetFact icon={ClipboardCheck} label="Open Gaps" value={openGaps} />
			</div>
		</header>
	);
}

function WorkspaceModePanel({
	checkedActions,
	filteredTimeline,
	mode,
	onCheckedActionsChange,
	onTimelineFilterChange,
	risk,
	timeline,
	timelineFilter,
	timelineTypes,
}: {
	checkedActions: Record<string, boolean>;
	filteredTimeline: TimelineEvent[];
	mode: WorkspaceMode;
	onCheckedActionsChange: (
		value: (current: Record<string, boolean>) => Record<string, boolean>,
	) => void;
	onTimelineFilterChange: (value: string) => void;
	risk: RiskSummary | null;
	timeline: TimelineEvent[];
	timelineFilter: string;
	timelineTypes: string[];
}) {
	if (!risk) {
		return (
			<EmptyState
				icon={AlertTriangle}
				message="Generated risk analysis will appear after an asset is selected."
				title="No Risk Analysis"
			/>
		);
	}

	if (mode === "Timeline") {
		return (
			<TimelinePanel
				filter={timelineFilter}
				filteredTimeline={filteredTimeline}
				onFilterChange={onTimelineFilterChange}
				timelineTypes={timelineTypes}
			/>
		);
	}

	if (mode === "Gaps") {
		return <CompliancePanel gaps={risk.open_compliance_gaps} />;
	}

	if (mode === "Trace") {
		return (
			<TracePanel
				contradictions={risk.contradictions ?? []}
				paths={risk.graph_paths}
			/>
		);
	}

	return (
		<div className="grid gap-4">
			<div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
				<PlainList
					empty="No failure pattern detected."
					icon={Sparkles}
					items={risk.failure_patterns}
					title="Failure Patterns"
				/>
				<ActionChecklist
					actions={risk.suggested_next_actions}
					checkedActions={checkedActions}
					onCheckedActionsChange={onCheckedActionsChange}
				/>
			</div>
			<div className="grid gap-3 sm:grid-cols-3">
				<ModeMetric
					icon={ClipboardCheck}
					label="Gap Evidence"
					value={risk.open_compliance_gaps.length}
				/>
				<ModeMetric
					icon={History}
					label="Timeline Events"
					value={timeline.length}
				/>
				<ModeMetric
					icon={Network}
					label="Graph Paths"
					value={risk.graph_paths.length}
				/>
			</div>
			<EvidenceReferenceCard
				evidence={{
					document: risk.source_document ?? "",
					page: risk.source_page ?? 1,
					snippet: risk.evidence_text ?? "",
					status: risk.source_document ? "accepted" : "rejected",
				}}
			/>
		</div>
	);
}

function AssetInspector({
	asset,
	checkedActions,
	onExport,
	risk,
	timelineCount,
}: {
	asset: Asset | null;
	checkedActions: Record<string, boolean>;
	onExport: () => void;
	risk: RiskSummary | null;
	timelineCount: number;
}) {
	const checkedCount = Object.values(checkedActions).filter(Boolean).length;
	const actionCount = risk?.suggested_next_actions.length ?? 0;
	const provenance = asset
		? {
				document: risk?.source_document ?? asset.source_document,
				page: risk?.source_page ?? asset.source_page,
				snippet: risk?.evidence_text ?? asset.evidence_text,
				status: asset.source_document ? "accepted" : "rejected",
			}
		: null;

	return (
		<aside className="min-w-0 rounded-lg border border-app-border bg-app-surface p-4 shadow-[var(--app-shadow-tight)] xl:sticky xl:top-4 xl:self-start">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="min-w-0">
					<h2 className="text-sm font-semibold text-app-text">Inspector</h2>
					<p className="mt-1 break-words text-xs font-semibold text-app-subtle">
						{asset?.id ?? "No asset"}
					</p>
				</div>
				<Button
					disabled={!asset}
					icon={Download}
					onClick={onExport}
					size="sm"
					type="button"
					variant="secondary"
				>
					Export
				</Button>
			</div>
			<div className="mt-4 flex flex-wrap gap-2">
				<StatusBadge value={`${checkedCount}/${actionCount} actions`} />
				<StatusBadge value={`${risk?.open_compliance_gaps.length ?? 0} gaps`} />
				<StatusBadge value={`${timelineCount} events`} />
				<StatusBadge value={`${risk?.graph_paths.length ?? 0} paths`} />
			</div>
			<div className="mt-4 border-t border-app-border pt-4">
				<h3 className="mb-2 text-sm font-semibold text-app-text">Provenance</h3>
				{provenance ? (
					<EvidenceReferenceCard evidence={provenance} />
				) : (
					<EmptyState
						icon={Gauge}
						message="Select an asset to inspect provenance."
						title="No Asset"
					/>
				)}
			</div>
			<div className="mt-4 border-t border-app-border pt-4">
				<h3 className="text-sm font-semibold text-app-text">Contradictions</h3>
				<div className="mt-3 grid gap-2">
					{risk?.contradictions?.length ? (
						risk.contradictions.slice(0, 3).map((item) => (
							<article
								className="rounded-lg border border-app-border bg-app-panel p-3"
								key={item.id}
							>
								<div className="flex items-start justify-between gap-2">
									<p className="min-w-0 break-words text-sm font-semibold text-app-text">
										{FormatDisplayLabel(item.contradiction_type)}
									</p>
									<StatusBadge value={item.severity} />
								</div>
								<p className="mt-2 line-clamp-3 text-sm leading-6 text-app-muted">
									{item.description}
								</p>
							</article>
						))
					) : (
						<p className="rounded-lg border border-dashed border-app-border bg-app-panel p-3 text-sm text-app-muted">
							No contradictions linked to this asset.
						</p>
					)}
				</div>
			</div>
		</aside>
	);
}

function ActionChecklist({
	actions,
	checkedActions,
	onCheckedActionsChange,
}: {
	actions: string[];
	checkedActions: Record<string, boolean>;
	onCheckedActionsChange: (
		value: (current: Record<string, boolean>) => Record<string, boolean>,
	) => void;
}) {
	return (
		<section className="min-w-0">
			<h3 className="flex items-center gap-2 text-sm font-semibold text-app-text">
				<AppIcon className="size-4 text-app-subtle" icon={ListChecks} />
				Recommended Actions
			</h3>
			<div className="mt-3 space-y-2">
				{actions.length ? (
					actions.map((item) => (
						<CustomCheckbox
							checked={checkedActions[item] ?? false}
							className="font-semibold"
							key={item}
							onCheckedChange={(checked) =>
								onCheckedActionsChange((current) => ({
									...current,
									[item]: checked,
								}))
							}
						>
							{item}
						</CustomCheckbox>
					))
				) : (
					<p className="text-sm text-app-muted">No generated action.</p>
				)}
			</div>
		</section>
	);
}

function AssetFact({
	icon: Icon,
	label,
	value,
}: {
	icon: IconType;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="min-w-0 rounded-lg border border-app-border bg-app-panel p-3">
			<div className="flex min-w-0 items-center gap-2">
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
				<p className="truncate text-xs font-semibold text-app-subtle">
					{label}
				</p>
			</div>
			<p className="mt-2 break-words text-sm font-semibold text-app-text">
				{value}
			</p>
		</div>
	);
}

function ModeMetric({
	icon: Icon,
	label,
	value,
}: {
	icon: IconType;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-app-border bg-app-panel p-3">
			<div className="flex items-center justify-between gap-3">
				<p className="text-xs font-semibold text-app-subtle">{label}</p>
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
			</div>
			<p className="mt-2 text-2xl font-semibold leading-tight text-app-text">
				{value}
			</p>
		</div>
	);
}

function PlainList({
	empty,
	icon: Icon,
	items,
	title,
}: {
	empty: string;
	icon: IconType;
	items: string[];
	title: string;
}) {
	return (
		<section className="min-w-0">
			<h3 className="flex items-center gap-2 text-sm font-semibold text-app-text">
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
				{title}
			</h3>
			{items.length ? (
				<ul className="mt-3 space-y-2 text-sm leading-6 text-app-muted">
					{items.map((item) => (
						<li
							className="break-words border-l-2 border-app-border pl-3"
							key={item}
						>
							{item}
						</li>
					))}
				</ul>
			) : (
				<p className="mt-2 text-sm text-app-muted">{empty}</p>
			)}
		</section>
	);
}

function TimelinePanel({
	filter,
	filteredTimeline,
	onFilterChange,
	timelineTypes,
}: {
	filter: string;
	filteredTimeline: TimelineEvent[];
	onFilterChange: (value: string) => void;
	timelineTypes: string[];
}) {
	return (
		<>
			<div className="mb-4">
				<SegmentedControl
					onChange={onFilterChange}
					options={timelineTypes}
					value={filter}
				/>
			</div>
			{filteredTimeline.length ? (
				<div className="relative space-y-3 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-app-border">
					{filteredTimeline.map((event) => (
						<article
							className="relative ml-8 rounded-lg border border-app-border bg-app-panel p-4"
							key={event.id}
						>
							<span className="absolute -left-[2.05rem] top-5 size-3 rounded-full border-2 border-app-surface bg-app-primary" />
							<div className="flex flex-wrap items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="break-words font-semibold text-app-text">
										{event.title}
									</p>
									<p className="mt-1 break-words text-sm leading-6 text-app-muted">
										{event.description}
									</p>
								</div>
								<StatusBadge value={event.event_type} />
							</div>
							<div className="mt-3">
								<EvidenceReferenceCard
									evidence={{
										document: event.source_document,
										page: event.source_page,
										snippet: event.description,
										status: "accepted",
									}}
								/>
							</div>
						</article>
					))}
				</div>
			) : (
				<EmptyState
					icon={History}
					message="No timeline event matches the current filter."
					title="No Events"
				/>
			)}
		</>
	);
}

function CompliancePanel({ gaps }: { gaps: ComplianceGap[] }) {
	return gaps.length ? (
		<div className="grid gap-3">
			{gaps.map((gap) => (
				<article
					className="rounded-lg border border-app-border bg-app-panel p-4"
					key={gap.id}
				>
					<div className="flex min-w-0 items-start justify-between gap-3">
						<div className="min-w-0">
							<p className="break-words font-semibold text-app-text">
								{FormatDisplayLabel(gap.gap_type)}
							</p>
							<p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-app-subtle">
								{gap.asset_id}
							</p>
						</div>
						<div className="flex flex-wrap justify-end gap-1.5">
							<StatusBadge value={gap.severity} />
							<StatusBadge value={gap.evidence_status ?? "accepted"} />
						</div>
					</div>
					<p className="mt-3 text-sm leading-6 text-app-muted">
						{gap.description}
					</p>
					<div className="mt-3">
						<EvidenceReferenceCard
							evidence={{
								confidence: gap.confidence,
								document: gap.source_document,
								page: gap.source_page,
								snippet: gap.evidence,
								status: gap.evidence_status ?? "accepted",
							}}
						/>
					</div>
				</article>
			))}
		</div>
	) : (
		<EmptyState
			icon={CheckCircle2}
			message="No open compliance gaps are linked to this asset."
			title="No Linked Gaps"
		/>
	);
}

function TracePanel({
	contradictions,
	paths,
}: {
	contradictions: Contradiction[];
	paths: GraphPath[];
}) {
	const graphEvidence = paths.flatMap((path) =>
		path.edges.slice(0, 8).map((edge) => ({
			confidence: edge.confidence,
			document: edge.source_document ?? "",
			page: edge.source_page ?? 1,
			reason: edge.validation_reason,
			snippet:
				edge.evidence_text ||
				`${edge.source_node ?? edge.source} / ${FormatDisplayLabel(edge.label)} / ${
					edge.target_node ?? edge.target
				}`,
			status: edge.validation_status ?? "weak",
		})),
	);
	return (
		<div className="grid gap-4">
			{paths.length ? (
				<div className="divide-y divide-app-border border-y border-app-border">
					{paths.map((path) => (
						<article className="py-3" key={`${path.asset_id}-${path.title}`}>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-semibold text-app-text">{path.title}</p>
									<p className="mt-1 text-sm leading-6 text-app-muted">
										{path.summary}
									</p>
								</div>
								<StatusBadge value={`${path.edges.length} Links`} />
							</div>
						</article>
					))}
				</div>
			) : (
				<EmptyState
					icon={Network}
					message="No graph path has been generated for this asset."
					title="No Graph Path"
				/>
			)}
			<section>
				<h3 className="mb-3 text-sm font-semibold text-app-text">
					Graph Evidence
				</h3>
				<EvidenceList
					empty="No graph edge evidence is linked to this asset."
					evidence={graphEvidence}
				/>
			</section>
			<section>
				<h3 className="mb-3 text-sm font-semibold text-app-text">
					Contradiction Evidence
				</h3>
				{contradictions.length ? (
					<div className="grid gap-3">
						{contradictions.map((item) => (
							<article
								className="rounded-lg border border-app-border bg-app-panel p-4"
								key={item.id}
							>
								<div className="flex items-start justify-between gap-2">
									<p className="min-w-0 break-words font-semibold text-app-text">
										{item.description}
									</p>
									<StatusBadge value={item.severity} />
								</div>
								<div className="mt-3 grid gap-2 lg:grid-cols-2">
									<EvidenceReferenceCard
										evidence={{
											document: item.source_document_a,
											page: item.source_page_a,
											snippet: item.evidence_a,
											status: "accepted",
										}}
									/>
									<EvidenceReferenceCard
										evidence={{
											document: item.source_document_b,
											page: item.source_page_b,
											snippet: item.evidence_b,
											status: "accepted",
										}}
									/>
								</div>
							</article>
						))}
					</div>
				) : (
					<p className="rounded-lg border border-dashed border-app-border bg-app-panel p-3 text-sm text-app-muted">
						No contradictions linked to this asset.
					</p>
				)}
			</section>
		</div>
	);
}

function AssetsSkeleton() {
	return (
		<div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_22rem]">
			<SkeletonBlock className="h-[36rem]" />
			<SkeletonBlock className="h-[36rem]" />
			<SkeletonBlock className="h-[36rem]" />
		</div>
	);
}

function DownloadMarkdown(filename: string, markdown: string) {
	const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
