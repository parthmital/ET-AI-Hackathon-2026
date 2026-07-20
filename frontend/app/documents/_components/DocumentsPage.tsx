"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
	AlertTriangle,
	BrainCircuit,
	Database,
	FileText,
	FileUp,
	Play,
	ScanText,
	Search,
	Sparkles,
	Tags,
	Trash2,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import { DocumentUploader } from "@/components/DocumentUploader";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
	AppIcon,
	Button,
	EmptyState,
	SearchInput,
	SelectField,
	SkeletonBlock,
	cn,
	type IconType,
} from "@/components/UI";
import {
	ClearWorkspace,
	GetAnalysisStatus,
	GetDocuments,
	GetEntities,
	RegenerateAnalysis,
} from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type { AnalysisStatus, DocumentSummary, Entity } from "@/lib/types";
import { DataRefreshEvent, useAsyncResource } from "@/lib/useAsyncResource";

type DocumentsData = {
	documents: DocumentSummary[];
	entities: Entity[];
	analysis: AnalysisStatus;
};

const EmptyDocuments: DocumentSummary[] = [];
const EmptyEntities: Entity[] = [];
const DocumentPreviewLimit = 8;
const EntityPreviewLimit = 18;

async function LoadDocumentsData(): Promise<DocumentsData> {
	const [documents, entities, analysis] = await Promise.all([
		GetDocuments(),
		GetEntities(),
		GetAnalysisStatus(),
	]);
	return { documents, entities, analysis };
}

export default function DocumentsPage() {
	const [status, setStatus] = useState("");
	const [isAnalysing, setIsAnalysing] = useState(false);
	const [isClearing, setIsClearing] = useState(false);
	const [isConfirmingClear, setIsConfirmingClear] = useState(false);
	const [search, setSearch] = useState("");
	const [entityType, setEntityType] = useState("All");
	const { data, error, isLoading, isRefreshing, reload } =
		useAsyncResource<DocumentsData>("documents", LoadDocumentsData);
	const documents = data?.documents ?? EmptyDocuments;
	const entities = data?.entities ?? EmptyEntities;
	const analysis = data?.analysis;

	const recentDocuments = useMemo(
		() =>
			[...documents]
				.sort((left, right) => right.id - left.id)
				.slice(0, DocumentPreviewLimit),
		[documents],
	);
	const hiddenDocumentCount = Math.max(
		documents.length - recentDocuments.length,
		0,
	);

	const entityTypeOptions = useMemo(
		() => [
			{ label: "All types", value: "All" },
			...Array.from(new Set(entities.map((item) => item.entity_type)))
				.sort()
				.map((type) => ({
					label: FormatDisplayLabel(type),
					value: type,
				})),
		],
		[entities],
	);
	const matchingEntities = useMemo(() => {
		const query = search.trim().toLowerCase();
		return entities
			.filter(
				(entity) => entityType === "All" || entity.entity_type === entityType,
			)
			.filter((entity) => {
				if (!query) return true;
				return [entity.value, entity.context, entity.filename].some((value) =>
					value.toLowerCase().includes(query),
				);
			});
	}, [entities, entityType, search]);
	const visibleEntities = matchingEntities.slice(0, EntityPreviewLimit);

	async function AnalyseWorkspace() {
		setIsAnalysing(true);
		setStatus("Running extraction on uploaded evidence");
		try {
			const result = await RegenerateAnalysis();
			setStatus(
				result.analysis_status === "complete"
					? `Extraction complete: ${result.assets} assets, ${result.timeline_events} events, ${result.compliance_gaps} gaps, ${result.contradictions} contradictions.`
					: result.analysis_message || "Extraction failed",
			);
			await reload(true);
			window.dispatchEvent(new Event(DataRefreshEvent));
		} catch (analysisError) {
			setStatus(
				analysisError instanceof Error
					? analysisError.message
					: "Extraction failed",
			);
		} finally {
			setIsAnalysing(false);
		}
	}

	async function ClearAllData() {
		setIsConfirmingClear(false);
		setIsClearing(true);
		setStatus("Clearing workspace");
		try {
			await ClearWorkspace();
			setStatus("Workspace cleared");
			await reload(true);
			window.dispatchEvent(new Event(DataRefreshEvent));
		} catch (clearError) {
			setStatus(
				clearError instanceof Error ? clearError.message : "Clear failed",
			);
		} finally {
			setIsClearing(false);
		}
	}

	return (
		<>
			<PageHeader
				icon={FileUp}
				subtitle="Upload plant records, run extraction, and review the evidence layer without noise."
				title="Evidence Workspace"
			/>
			{status || error ? (
				<StatusLine
					icon={error ? AlertTriangle : Sparkles}
					message={`${error || status}${isRefreshing ? " Refreshing workspace data." : ""}`}
				/>
			) : null}
			{isConfirmingClear ? (
				<ClearWorkspaceDialog
					disabled={isClearing}
					onCancel={() => setIsConfirmingClear(false)}
					onConfirm={ClearAllData}
				/>
			) : null}

			<WorkspaceSummary
				analysis={analysis}
				documentsCount={documents.length}
				entitiesCount={analysis?.entities_extracted ?? entities.length}
			/>

			<div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(24rem,0.95fr)]">
				<div className="min-w-0 space-y-4">
					<DocumentUploader
						intro="Drop the evidence set once. Extraction remains a separate manual run."
						onUploaded={() => reload(true)}
					/>
					<SourceFilesCard
						analysis={analysis}
						documents={recentDocuments}
						hiddenCount={hiddenDocumentCount}
						isLoading={isLoading && !data}
					/>
				</div>

				<div className="min-w-0 space-y-4">
					<RunExtractionCard
						analysis={analysis}
						documentsCount={documents.length}
						isAnalysing={isAnalysing}
						isClearing={isClearing}
						onClear={() => setIsConfirmingClear(true)}
						onRun={AnalyseWorkspace}
					/>
					<ExtractedEntitiesCard
						entityType={entityType}
						entityTypeOptions={entityTypeOptions}
						matchingCount={matchingEntities.length}
						onEntityTypeChange={setEntityType}
						onSearchChange={setSearch}
						search={search}
						visibleEntities={visibleEntities}
					/>
				</div>
			</div>
		</>
	);
}

function StatusLine({
	icon: Icon,
	message,
}: {
	icon: IconType;
	message: string;
}) {
	return (
		<div className="mb-4 flex min-w-0 gap-2 rounded-lg border border-app-border bg-app-surface p-3 text-sm font-semibold text-app-muted">
			<AppIcon className="mt-0.5 size-4" icon={Icon} />
			<span className="min-w-0 break-words">{message}</span>
		</div>
	);
}

function WorkspaceSummary({
	analysis,
	documentsCount,
	entitiesCount,
}: {
	analysis: AnalysisStatus | undefined;
	documentsCount: number;
	entitiesCount: number;
}) {
	return (
		<section className="rounded-lg border border-app-border bg-app-surface p-4 shadow-[var(--app-shadow-tight)]">
			<div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-xs font-semibold uppercase text-app-subtle">
							Workspace Status
						</h2>
						<StatusBadge value={analysis?.analysis_status ?? "not_run"} />
					</div>
					<p className="mt-2 max-w-3xl text-sm leading-6 text-app-muted">
						{analysis?.analysis_message ||
							"Upload evidence and run extraction when the source set is ready."}
					</p>
				</div>
				<div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-5 xl:min-w-[40rem]">
					<SummaryStat icon={FileText} label="Files" value={documentsCount} />
					<SummaryStat icon={Tags} label="Entities" value={entitiesCount} />
					<SummaryStat
						icon={BrainCircuit}
						label="Assets"
						value={analysis?.assets ?? 0}
					/>
					<SummaryStat
						icon={AlertTriangle}
						label="Gaps"
						tone="red"
						value={analysis?.compliance_gaps ?? 0}
					/>
					<SummaryStat
						icon={AlertTriangle}
						label="Contradictions"
						tone="red"
						value={analysis?.contradictions ?? 0}
					/>
				</div>
			</div>
		</section>
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
	tone?: "slate" | "red";
	value: ReactNode;
}) {
	return (
		<div
			className={cn(
				"min-w-0 rounded-lg border px-3 py-2",
				tone === "red"
					? "border-tone-red-border bg-tone-red-bg"
					: "border-app-border bg-app-panel",
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="truncate text-xs font-semibold text-app-subtle">
					{label}
				</p>
				<AppIcon
					className={cn(
						"size-3.5",
						tone === "red" ? "text-tone-red-text" : "text-app-subtle",
					)}
					icon={Icon}
				/>
			</div>
			<p className="mt-1 font-mono text-xl font-semibold text-app-text">
				{value}
			</p>
		</div>
	);
}

function SourceFilesCard({
	analysis,
	documents,
	hiddenCount,
	isLoading,
}: {
	analysis: AnalysisStatus | undefined;
	documents: DocumentSummary[];
	hiddenCount: number;
	isLoading: boolean;
}) {
	return (
		<DataCard
			action={<StatusBadge value={analysis?.analysis_status ?? "not_run"} />}
			title="Source Files"
		>
			{isLoading ? (
				<div className="space-y-3">
					<SkeletonBlock className="h-16" />
					<SkeletonBlock className="h-16" />
					<SkeletonBlock className="h-16" />
				</div>
			) : documents.length ? (
				<>
					<div className="divide-y divide-app-border">
						{documents.map((document) => (
							<SourceFileRow document={document} key={document.id} />
						))}
					</div>
					{hiddenCount ? (
						<p className="mt-3 rounded-lg border border-app-border bg-app-panel px-3 py-2 text-xs font-semibold text-app-muted">
							Showing latest {documents.length} of{" "}
							{documents.length + hiddenCount} indexed files.
						</p>
					) : null}
				</>
			) : (
				<EmptyState
					icon={FileText}
					message="Upload evidence files to create the source ledger."
					title="No Source Files"
				/>
			)}
		</DataCard>
	);
}

function SourceFileRow({ document }: { document: DocumentSummary }) {
	return (
		<article className="grid min-w-0 gap-3 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
			<div className="min-w-0">
				<p className="break-words text-sm font-semibold text-app-text">
					{document.filename}
				</p>
				<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-app-muted">
					<span>{FormatDisplayLabel(document.document_type)}</span>
					<span>{document.page_count} pages</span>
					<span>{document.character_count.toLocaleString("en-IN")} chars</span>
					<span>{FormatUploadTime(document.upload_time)}</span>
				</div>
			</div>
			<div className="flex min-w-0 flex-wrap gap-2 md:justify-end">
				<StatusBadge value={document.parser} />
				<StatusBadge value={document.ocr_used ? "OCR Used" : "Text"} />
			</div>
		</article>
	);
}

function RunExtractionCard({
	analysis,
	documentsCount,
	isAnalysing,
	isClearing,
	onClear,
	onRun,
}: {
	analysis: AnalysisStatus | undefined;
	documentsCount: number;
	isAnalysing: boolean;
	isClearing: boolean;
	onClear: () => void;
	onRun: () => void;
}) {
	return (
		<DataCard
			action={<StatusBadge value={analysis?.analysis_status ?? "not_run"} />}
			title="Extraction Run"
		>
			<div className="rounded-lg border border-tone-teal-border bg-tone-teal-bg p-3">
				<div className="flex min-w-0 items-start gap-2">
					<AppIcon
						className="mt-0.5 size-4 text-tone-teal-text"
						icon={ScanText}
					/>
					<p className="text-sm leading-6 text-tone-teal-text">
						Uploads are indexed first. Run extraction only when the evidence set
						is ready for generated assets, graph evidence, timeline events,
						compliance gaps, and contradictions.
					</p>
				</div>
			</div>
			<div className="mt-4 divide-y divide-app-border">
				<RunFact
					icon={Database}
					label="Documents ready"
					value={analysis?.documents_ingested ?? documentsCount}
				/>
				<RunFact
					icon={Sparkles}
					label="Timeline events"
					value={analysis?.timeline_events ?? 0}
				/>
				<RunFact
					icon={AlertTriangle}
					label="Open compliance gaps"
					value={analysis?.compliance_gaps ?? 0}
				/>
				<RunFact
					icon={AlertTriangle}
					label="Contradictions"
					value={analysis?.contradictions ?? 0}
				/>
			</div>
			{analysis?.agent_stages?.length ? (
				<div className="mt-4 grid gap-2">
					{analysis.agent_stages.map((stage) => (
						<div
							className="rounded-lg border border-app-border bg-app-panel p-3"
							key={stage.stage}
						>
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0">
									<p className="text-sm font-semibold text-app-text">
										{stage.stage}
									</p>
									<p className="mt-1 break-words text-xs font-semibold leading-5 text-app-subtle">
										{stage.message}
									</p>
								</div>
								<StatusBadge value={stage.status} />
							</div>
						</div>
					))}
				</div>
			) : null}
			<div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
				<Button
					className="w-full"
					disabled={!documentsCount || isAnalysing}
					icon={Play}
					onClick={onRun}
					type="button"
				>
					{isAnalysing ? "Running" : "Run Extraction"}
				</Button>
				<Button
					disabled={!documentsCount || isClearing}
					icon={Trash2}
					onClick={onClear}
					type="button"
					variant="secondary"
				>
					{isClearing ? "Clearing" : "Clear"}
				</Button>
			</div>
		</DataCard>
	);
}

function RunFact({
	icon: Icon,
	label,
	value,
}: {
	icon: IconType;
	label: string;
	value: ReactNode;
}) {
	return (
		<div className="flex min-w-0 items-center justify-between gap-3 py-3">
			<div className="flex min-w-0 items-center gap-2">
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
				<p className="truncate text-sm font-semibold text-app-muted">{label}</p>
			</div>
			<p className="shrink-0 font-mono text-sm font-semibold text-app-text">
				{value}
			</p>
		</div>
	);
}

function ExtractedEntitiesCard({
	entityType,
	entityTypeOptions,
	matchingCount,
	onEntityTypeChange,
	onSearchChange,
	search,
	visibleEntities,
}: {
	entityType: string;
	entityTypeOptions: { label: string; value: string }[];
	matchingCount: number;
	onEntityTypeChange: (value: string) => void;
	onSearchChange: (value: string) => void;
	search: string;
	visibleEntities: Entity[];
}) {
	return (
		<DataCard
			action={<StatusBadge value={`${matchingCount} matching`} />}
			title="Extracted Signals"
		>
			<div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(13rem,0.45fr)]">
				<SearchInput
					icon={Search}
					onValueChange={onSearchChange}
					placeholder="Search evidence"
					value={search}
				/>
				<SelectField
					ariaLabel="Filter entity type"
					onValueChange={onEntityTypeChange}
					options={entityTypeOptions}
					value={entityType}
				/>
			</div>
			{visibleEntities.length ? (
				<>
					<div className="mt-4 max-h-[35rem] divide-y divide-app-border overflow-y-auto pr-1">
						{visibleEntities.map((entity) => (
							<EntityCard entity={entity} key={entity.id} />
						))}
					</div>
					{matchingCount > visibleEntities.length ? (
						<p className="mt-3 rounded-lg border border-app-border bg-app-panel px-3 py-2 text-xs font-semibold text-app-muted">
							Showing the first {visibleEntities.length} matching signals.
						</p>
					) : null}
				</>
			) : (
				<div className="mt-3">
					<EmptyState
						icon={Search}
						message="Signals appear after extraction completes."
						title="No Extracted Signals"
					/>
				</div>
			)}
		</DataCard>
	);
}

function EntityCard({ entity }: { entity: Entity }) {
	return (
		<article className="min-w-0 py-3">
			<div className="flex items-start justify-between gap-3">
				<p className="min-w-0 break-words text-sm font-semibold text-app-text">
					{entity.value}
				</p>
				<StatusBadge value={entity.entity_type} />
			</div>
			<p className="mt-2 line-clamp-2 text-sm leading-6 text-app-muted">
				{entity.context}
			</p>
			<p className="mt-3 truncate font-mono text-[0.68rem] font-semibold uppercase text-app-subtle">
				{entity.filename} / Page {entity.page}
			</p>
		</article>
	);
}

function ClearWorkspaceDialog({
	disabled,
	onCancel,
	onConfirm,
}: {
	disabled: boolean;
	onCancel: () => void;
	onConfirm: () => void;
}) {
	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
			<div
				aria-label="Clear Workspace"
				aria-modal="true"
				className="w-full max-w-md rounded-lg border border-app-border bg-app-elevated p-5 shadow-panel"
				role="dialog"
			>
				<div className="flex min-w-0 items-start gap-3">
					<AppIcon className="mt-1 size-5 text-tone-red-text" icon={Trash2} />
					<div className="min-w-0 flex-1">
						<h2 className="text-base font-semibold text-app-text">
							Clear Workspace
						</h2>
						<p className="mt-2 text-sm leading-6 text-app-muted">
							This removes every uploaded file, extracted entity, asset, graph
							link, timeline event, and compliance finding.
						</p>
					</div>
				</div>
				<div className="mt-5 flex flex-wrap justify-end gap-2">
					<Button
						disabled={disabled}
						onClick={onCancel}
						type="button"
						variant="secondary"
					>
						Cancel
					</Button>
					<Button
						disabled={disabled}
						icon={Trash2}
						onClick={onConfirm}
						type="button"
						variant="danger"
					>
						Clear Workspace
					</Button>
				</div>
			</div>
		</div>
	);
}

function FormatUploadTime(value: string) {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Upload time unavailable";
	return new Intl.DateTimeFormat("en-IN", {
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
	}).format(date);
}
