"use client";

import { useRef, useState } from "react";
import {
	AlertTriangle,
	BrainCircuit,
	CheckCircle2,
	FileText,
	RefreshCw,
	UploadCloud,
	X,
	XCircle,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import {
	AppIcon,
	Button,
	FileDropZone,
	IconButton,
	type IconType,
} from "@/components/UI";
import { RegenerateAnalysis, UploadDocuments } from "@/lib/api";
import { DataRefreshEvent } from "@/lib/useAsyncResource";
import { StatusBadge } from "@/components/StatusBadge";
import type { AnalysisStatus } from "@/lib/types";

const SupportedExtensions = [".pdf", ".docx", ".txt", ".csv", ".xlsx"];

type UploadItem = {
	id: string;
	file: File;
	progress: number;
	status:
		"selected" | "uploading" | "uploaded" | "indexed" | "duplicate" | "failed";
	message: string;
};
type FileWithRelativePath = File & { webkitRelativePath?: string };
type UploadNotice = {
	icon: IconType;
	message: string;
	tone: "info" | "success" | "error";
};

export function DocumentUploader({
	autoAnalyseAfterUpload = false,
	intro = "Select PDF, DOCX, TXT, CSV, or XLSX files. Uploading indexes the source files.",
	onUploaded,
}: {
	autoAnalyseAfterUpload?: boolean;
	intro?: string;
	onUploaded?: () => Promise<unknown> | unknown;
}) {
	const [queue, setQueue] = useState<UploadItem[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [notice, setNotice] = useState<UploadNotice | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isAnalysing, setIsAnalysing] = useState(false);
	const isBusyRef = useRef(false);
	const isBusy = isUploading || isAnalysing;
	const readyItems = queue.filter(
		(item) =>
			(item.status === "selected" || item.status === "failed") &&
			SupportedExtensions.some((extension) =>
				item.file.name.toLowerCase().endsWith(extension),
			),
	);
	const selectedCount = queue.filter(
		(item) => item.status === "selected",
	).length;
	const failedCount = queue.filter((item) => item.status === "failed").length;

	function HandleFiles(files: File[] | FileList | null) {
		const incomingFiles = Array.from(files ?? []);
		if (!incomingFiles.length) return;
		setNotice(null);
		setQueue((current) => {
			const existing = new Set(current.map((item) => item.id));
			const incoming = incomingFiles
				.map((file) => ({
					file,
					id: FileQueueId(file),
				}))
				.filter(({ id }) => !existing.has(id))
				.map(({ file, id }): UploadItem => {
					const supported = SupportedExtensions.some((extension) =>
						file.name.toLowerCase().endsWith(extension),
					);
					return {
						file,
						id,
						progress: 0,
						status: supported ? "selected" : "failed",
						message: supported ? "Ready to Upload" : "Unsupported File Type",
					};
				});
			return [...current, ...incoming];
		});
	}

	async function UploadSelected() {
		if (isBusyRef.current) return;
		const selected = readyItems;
		if (!selected.length) return;
		isBusyRef.current = true;
		setIsUploading(true);
		setNotice({
			icon: UploadCloud,
			message: `Uploading ${selected.length} files.`,
			tone: "info",
		});
		const selectedIds = new Set(selected.map((item) => item.id));
		setQueue((items) =>
			items.map((item) =>
				selectedIds.has(item.id)
					? {
							...item,
							status: "uploading",
							progress: 0,
							message: "Preparing upload",
						}
					: item,
			),
		);
		try {
			const result = await UploadViaMultipart(selected, UpdateQueueItem);
			if (result.failed) {
				setNotice({
					icon: AlertTriangle,
					message: `Indexed: ${result.indexed}. Duplicates: ${result.duplicates}. Failed: ${result.failed}. Analysis did not run because the upload was incomplete.`,
					tone: "error",
				});
				if (!autoAnalyseAfterUpload) await NotifyWorkspaceChanged(onUploaded);
				return;
			}
			if (!autoAnalyseAfterUpload) {
				setNotice({
					icon: CheckCircle2,
					message: `Indexed: ${result.indexed}. Duplicates: ${result.duplicates}. Failed: 0.`,
					tone: "success",
				});
				await NotifyWorkspaceChanged(onUploaded);
				return;
			}
			if (!result.indexed) {
				setNotice({
					icon: AlertTriangle,
					message: `No new files were indexed. Duplicates: ${result.duplicates}. Analysis did not run.`,
					tone: "info",
				});
				return;
			}
			setIsUploading(false);
			setIsAnalysing(true);
			setNotice({
				icon: BrainCircuit,
				message: `Upload complete: ${result.indexed} indexed, ${result.duplicates} duplicates. Running analysis pipeline.`,
				tone: "info",
			});
			setQueue((items) =>
				items.map((item) =>
					selectedIds.has(item.id) && item.status === "indexed"
						? { ...item, message: "Indexed. Analysis running." }
						: item,
				),
			);
			let analysis: AnalysisStatus;
			try {
				analysis = await RegenerateAnalysis();
			} catch (analysisError) {
				setQueue((items) =>
					items.map((item) =>
						selectedIds.has(item.id) && item.status === "indexed"
							? { ...item, message: "Indexed. Analysis failed." }
							: item,
					),
				);
				setNotice({
					icon: XCircle,
					message:
						analysisError instanceof Error
							? analysisError.message
							: "Analysis failed after upload.",
					tone: "error",
				});
				return;
			}
			if (analysis.analysis_status === "complete") {
				setNotice({
					icon: CheckCircle2,
					message: FormatAnalysisSuccess(analysis),
					tone: "success",
				});
				setQueue((items) =>
					items.map((item) =>
						selectedIds.has(item.id) && item.status === "indexed"
							? { ...item, message: "Indexed and analysed." }
							: item,
					),
				);
				await NotifyWorkspaceChanged(onUploaded);
				return;
			}
			setNotice({
				icon: XCircle,
				message: analysis.analysis_message || "Analysis failed after upload.",
				tone: "error",
			});
			setQueue((items) =>
				items.map((item) =>
					selectedIds.has(item.id) && item.status === "indexed"
						? { ...item, message: "Indexed. Analysis failed." }
						: item,
				),
			);
		} catch (uploadError) {
			setQueue((items) =>
				items.map((item) =>
					selectedIds.has(item.id)
						? {
								...item,
								status: "failed",
								message:
									uploadError instanceof Error
										? uploadError.message
										: "Upload Failed",
							}
						: item,
				),
			);
			setNotice({
				icon: XCircle,
				message:
					uploadError instanceof Error ? uploadError.message : "Upload failed.",
				tone: "error",
			});
		} finally {
			setIsUploading(false);
			setIsAnalysing(false);
			isBusyRef.current = false;
		}
	}

	function UpdateQueueItem(id: string, patch: Partial<UploadItem>) {
		setQueue((items) =>
			items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		);
	}

	return (
		<DataCard
			action={
				<StatusBadge
					value={
						isAnalysing
							? "Analysing"
							: isUploading
								? "Uploading"
								: `${readyItems.length} Ready`
					}
				/>
			}
			description={intro}
			eyebrow="Evidence Intake"
			title="Upload Evidence"
		>
			{notice ? <UploadNoticeMessage notice={notice} /> : null}
			<FileDropZone
				acceptExtensions={SupportedExtensions}
				description="PDF, DOCX, TXT, CSV, and XLSX are supported."
				icon={UploadCloud}
				isDragging={isDragging}
				onDraggingChange={setIsDragging}
				onFiles={HandleFiles}
				title="Drop plant files here"
			/>
			{queue.length ? (
				<>
					<div className="mt-4 flex flex-wrap gap-2">
						<Button
							disabled={!readyItems.length || isBusy}
							icon={isBusy ? RefreshCw : UploadCloud}
							onClick={UploadSelected}
							type="button"
						>
							{isUploading ? "Uploading" : isAnalysing ? "Analysing" : "Upload"}
						</Button>
						<Button
							disabled={isBusy}
							onClick={() => setQueue([])}
							type="button"
							variant="secondary"
						>
							Clear Queue
						</Button>
					</div>
					<UploadQueue
						items={queue}
						isBusy={isBusy}
						onRemove={(id) =>
							setQueue((items) => items.filter((item) => item.id !== id))
						}
					/>
					<p className="mt-3 text-xs text-app-muted">
						{selectedCount} selected, {failedCount} need attention.
					</p>
				</>
			) : null}
		</DataCard>
	);
}

function UploadNoticeMessage({ notice }: { notice: UploadNotice }) {
	const toneClass = {
		error: "border-tone-red-border bg-tone-red-bg text-tone-red-text",
		info: "border-app-border bg-app-panel text-app-muted",
		success:
			"border-tone-emerald-border bg-tone-emerald-bg text-tone-emerald-text",
	}[notice.tone];

	return (
		<div
			className={`mb-4 flex min-w-0 gap-2 rounded-lg border p-3 text-sm font-semibold ${toneClass}`}
		>
			<AppIcon className="mt-0.5 size-4" icon={notice.icon} />
			<span className="min-w-0 break-words">{notice.message}</span>
		</div>
	);
}

async function NotifyWorkspaceChanged(
	onUploaded: (() => Promise<unknown> | unknown) | undefined,
) {
	try {
		await onUploaded?.();
	} catch {
		// The data refresh layer reports its own visible error state.
	}
	window.dispatchEvent(new Event(DataRefreshEvent));
}

function FormatAnalysisSuccess(analysis: AnalysisStatus) {
	return `Upload and analysis complete: ${analysis.assets} assets, ${analysis.timeline_events} events, ${analysis.compliance_gaps} gaps, ${analysis.contradictions} contradictions.`;
}

function FileQueueId(file: File) {
	return `${FileDisplayName(file)}-${file.lastModified}-${file.size}`;
}

function FileDisplayName(file: File) {
	return (file as FileWithRelativePath).webkitRelativePath || file.name;
}

function UploadQueue({
	isBusy,
	items,
	onRemove,
}: {
	isBusy: boolean;
	items: UploadItem[];
	onRemove: (id: string) => void;
}) {
	return (
		<div className="mt-4 overflow-hidden rounded-lg border border-app-border">
			{items.map((item) => {
				const StatusIcon =
					item.status === "uploaded" ||
					item.status === "indexed" ||
					item.status === "duplicate"
						? CheckCircle2
						: item.status === "failed"
							? XCircle
							: FileText;
				return (
					<div
						className="flex min-w-0 items-center gap-3 border-b border-app-border bg-app-panel p-3 last:border-b-0"
						key={item.id}
					>
						<AppIcon className="size-4 text-app-subtle" icon={StatusIcon} />
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm font-semibold text-app-text">
								{FileDisplayName(item.file)}
							</p>
							<p className="mt-1 text-xs leading-5 text-app-muted">
								{item.message}
								{item.status === "uploading" ? (
									<span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-app-border">
										<span
											className="block h-full bg-app-primary"
											style={{ width: `${Math.max(2, item.progress)}%` }}
										/>
									</span>
								) : null}
							</p>
						</div>
						<div className="flex shrink-0 items-center gap-2">
							<StatusBadge
								className="h-9 shrink-0 rounded-md px-3"
								value={item.status}
							/>
							<IconButton
								disabled={isBusy}
								icon={X}
								label={`Remove ${FileDisplayName(item.file)}`}
								onClick={() => onRemove(item.id)}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

async function UploadViaMultipart(
	selected: UploadItem[],
	update: (id: string, patch: Partial<UploadItem>) => void,
) {
	const result = await UploadDocuments(selected.map((item) => item.file));
	let missingResults = 0;
	selected.forEach((item, index) => {
		const outcome = result.items[index];
		if (!outcome) {
			missingResults += 1;
			update(item.id, {
				status: "failed",
				message: "Upload result missing. Retry this file.",
			});
			return;
		}
		update(item.id, {
			status: outcome.status === "uploaded" ? "indexed" : outcome.status,
			progress: outcome.status === "failed" ? item.progress : 100,
			message: outcome.message,
		});
	});
	return {
		indexed: result.uploaded_count,
		duplicates: result.duplicate_count,
		failed: result.failed_count + missingResults,
	};
}
