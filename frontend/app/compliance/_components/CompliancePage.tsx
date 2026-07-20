"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	AlertTriangle,
	CheckCircle2,
	ClipboardCheck,
	Download,
	Play,
	Search,
	ShieldCheck,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import { EvidenceReferenceCard } from "@/components/Evidence";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
	AppIcon,
	Button,
	CustomCheckbox,
	EmptyState,
	SearchInput,
	SegmentedControl,
	SkeletonBlock,
	TextAreaField,
	cn,
	type IconType,
} from "@/components/UI";
import {
	CheckCompliance,
	GetComplianceEvidencePack,
	GetComplianceGaps,
} from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type { ComplianceGap } from "@/lib/types";
import { useAsyncResource } from "@/lib/useAsyncResource";

const EmptyGaps: ComplianceGap[] = [];

export default function CompliancePage() {
	const [checkedGaps, setCheckedGaps] = useState<ComplianceGap[] | null>(null);
	const [summary, setSummary] = useState("");
	const [query, setQuery] = useState("");
	const [severity, setSeverity] = useState("All");
	const [statusFilter, setStatusFilter] = useState("All");
	const [search, setSearch] = useState("");
	const [checkedActions, setCheckedActions] = useState<Record<number, boolean>>(
		{},
	);
	const [isChecking, setIsChecking] = useState(false);
	const [checkError, setCheckError] = useState("");
	const [exportStatus, setExportStatus] = useState("");
	const {
		data: loadedGapsData,
		error: loadError,
		isLoading,
		isRefreshing,
	} = useAsyncResource<ComplianceGap[]>("compliance-gaps", GetComplianceGaps);
	const loadedGaps = loadedGapsData ?? EmptyGaps;
	const gaps = checkedGaps ?? loadedGaps;

	async function RunCheck() {
		if (!query.trim()) {
			setCheckError("Enter a compliance request.");
			return;
		}
		setIsChecking(true);
		setCheckError("");
		try {
			const result = await CheckCompliance(query.trim());
			setSummary(result.summary);
			setCheckedGaps(result.gaps);
		} catch (error) {
			setCheckError(
				error instanceof Error ? error.message : "Compliance check failed",
			);
		} finally {
			setIsChecking(false);
		}
	}

	async function ExportEvidencePack() {
		setExportStatus("");
		try {
			const pack = await GetComplianceEvidencePack();
			DownloadMarkdown(pack.filename, pack.markdown);
			setExportStatus("Evidence pack exported");
		} catch (error) {
			setExportStatus(error instanceof Error ? error.message : "Export failed");
		}
	}

	const severityOptions = useMemo(
		() => [
			"All",
			...Array.from(new Set(gaps.map((gap) => gap.severity))).sort(),
		],
		[gaps],
	);
	const statusOptions = useMemo(
		() => ["All", ...Array.from(new Set(gaps.map((gap) => gap.status))).sort()],
		[gaps],
	);
	const filteredGaps = useMemo(() => {
		const queryText = search.trim().toLowerCase();
		return gaps
			.filter((gap) => severity === "All" || gap.severity === severity)
			.filter((gap) => statusFilter === "All" || gap.status === statusFilter)
			.filter((gap) => {
				if (!queryText) return true;
				return (
					gap.asset_id.toLowerCase().includes(queryText) ||
					gap.gap_type.toLowerCase().includes(queryText) ||
					gap.description.toLowerCase().includes(queryText) ||
					gap.evidence.toLowerCase().includes(queryText)
				);
			});
	}, [gaps, search, severity, statusFilter]);
	const showSeverityFilter = severityOptions.length > 1;
	const showStatusFilter = statusOptions.length > 1;
	const openCount = gaps.filter((gap) => gap.status === "Open").length;
	const highCount = gaps.filter((gap) => gap.severity === "High").length;
	const actionDoneCount = Object.values(checkedActions).filter(Boolean).length;
	const error = checkError || loadError;

	return (
		<>
			<PageHeader
				actions={
					<div className="flex min-w-0 flex-wrap gap-2">
						<Button
							icon={Download}
							onClick={ExportEvidencePack}
							type="button"
							variant="secondary"
						>
							Export Pack
						</Button>
						<Button
							disabled={isChecking || !query.trim()}
							icon={Play}
							onClick={RunCheck}
							type="button"
						>
							{isChecking ? "Checking" : "Run Check"}
						</Button>
					</div>
				}
				icon={ShieldCheck}
				title="Compliance Review"
				subtitle="Run a check, filter gaps, and mark corrective actions."
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

			<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.55fr)]">
				<DataCard
					action={
						<Button
							disabled={isChecking || !query.trim()}
							icon={Play}
							onClick={RunCheck}
							type="button"
						>
							{isChecking ? "Checking" : "Run Check"}
						</Button>
					}
					description="Enter the compliance angle judges ask for, or review already generated workspace gaps."
					eyebrow="Request"
					title="Compliance Check"
				>
					<TextAreaField
						ariaLabel="Compliance Request"
						placeholder="Describe the compliance evidence or gaps to review"
						value={query}
						onValueChange={setQuery}
					/>
					{summary ? (
						<div className="mt-4 rounded-lg border border-tone-teal-border bg-tone-teal-bg p-3 text-sm font-semibold leading-6 text-tone-teal-text">
							{summary}
						</div>
					) : null}
				</DataCard>

				<DataCard
					description="The main exposure numbers update from generated gaps or a targeted check."
					eyebrow="Exposure"
					title="Review Summary"
				>
					<div className="grid gap-3">
						<SummaryStat
							icon={ShieldCheck}
							label="Total Gaps"
							value={gaps.length}
						/>
						<SummaryStat
							icon={AlertTriangle}
							label="High Severity"
							tone="red"
							value={highCount}
						/>
						<SummaryStat
							icon={CheckCircle2}
							label="Actions Ticked"
							tone="teal"
							value={actionDoneCount}
						/>
					</div>
					<p className="mt-3 text-sm font-semibold text-app-muted">
						Open items remaining: {openCount}
					</p>
				</DataCard>
			</div>

			<DataCard
				action={
					<SearchInput
						className="min-w-0 sm:w-80"
						icon={Search}
						onValueChange={setSearch}
						placeholder="Search gaps"
						value={search}
					/>
				}
				className="mt-4"
				description="Filter quickly, then use each row as an audit ready evidence and action record."
				eyebrow="Findings"
				title="Compliance Findings"
			>
				{showSeverityFilter || showStatusFilter ? (
					<div className="mb-4 flex min-w-0 flex-wrap gap-3">
						{showSeverityFilter ? (
							<SegmentedControl
								onChange={setSeverity}
								options={severityOptions}
								value={severity}
							/>
						) : null}
						{showStatusFilter ? (
							<SegmentedControl
								onChange={setStatusFilter}
								options={statusOptions}
								value={statusFilter}
							/>
						) : null}
					</div>
				) : null}
				{isLoading && !loadedGaps.length ? (
					<div className="space-y-3">
						<SkeletonBlock className="h-36" />
						<SkeletonBlock className="h-36" />
						<SkeletonBlock className="h-36" />
					</div>
				) : filteredGaps.length ? (
					<div className="grid gap-3">
						{filteredGaps.map((gap) => (
							<ComplianceFinding
								checked={checkedActions[gap.id] ?? false}
								gap={gap}
								key={gap.id}
								onCheckedChange={(checked) =>
									setCheckedActions((current) => ({
										...current,
										[gap.id]: checked,
									}))
								}
							/>
						))}
					</div>
				) : (
					<EmptyState
						icon={ClipboardCheck}
						message="No compliance gaps match the active filters."
						title="No Matching Gaps"
					/>
				)}
			</DataCard>
		</>
	);
}

function ComplianceFinding({
	checked,
	gap,
	onCheckedChange,
}: {
	checked: boolean;
	gap: ComplianceGap;
	onCheckedChange: (checked: boolean) => void;
}) {
	return (
		<article className="min-w-0 rounded-lg border border-app-border bg-app-panel p-4">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="min-w-0">
					<p className="break-words text-base font-semibold text-app-text">
						{FormatDisplayLabel(gap.gap_type)}
					</p>
					<p className="font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-app-subtle">
						{gap.asset_id}
					</p>
				</div>
				<div className="flex min-w-0 flex-wrap gap-2">
					<StatusBadge value={gap.severity} />
					<StatusBadge value={gap.status} />
				</div>
			</div>
			<p className="mt-3 break-words text-sm leading-6 text-app-muted">
				{gap.description}
			</p>
			<div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
				<div className="min-w-0">
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
				<CustomCheckbox
					checked={checked}
					className="h-full"
					onCheckedChange={onCheckedChange}
				>
					<span className="block min-w-0">
						<span className="block text-xs font-semibold text-app-subtle">
							Corrective Action
						</span>
						<span className="mt-1 block break-words text-sm leading-6 text-app-muted">
							{gap.corrective_action}
						</span>
					</span>
				</CustomCheckbox>
			</div>
		</article>
	);
}

function SummaryStat({
	icon: Icon,
	label,
	tone = "slate",
	value,
}: {
	icon: IconType;
	label: string;
	tone?: "slate" | "red" | "teal";
	value: ReactNode;
}) {
	return (
		<div
			className={cn(
				"flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3",
				tone === "red"
					? "border-tone-red-border bg-tone-red-bg"
					: tone === "teal"
						? "border-tone-teal-border bg-tone-teal-bg"
						: "border-app-border bg-app-panel",
			)}
		>
			<span className="flex min-w-0 items-center gap-2">
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
				<span className="truncate text-sm font-semibold text-app-muted">
					{label}
				</span>
			</span>
			<span className="shrink-0 font-mono text-xl font-semibold text-app-text">
				{value}
			</span>
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
