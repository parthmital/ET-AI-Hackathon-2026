"use client";

import { useState } from "react";
import {
	AlertTriangle,
	CheckCircle2,
	FileText,
	RefreshCw,
	UploadCloud,
	X,
	XCircle,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import { AppIcon, Button, FileDropZone, IconButton } from "@/components/UI";
import { UploadDocuments } from "@/lib/api";
import { DataRefreshEvent } from "@/lib/useAsyncResource";
import { StatusBadge } from "@/components/StatusBadge";

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

export function DocumentUploader({
	intro = "Select files or a folder containing PDF, DOCX, TXT, CSV, or XLSX files. Uploading does not run generated analysis.",
	onUploaded,
}: {
	intro?: string;
	onUploaded?: () => Promise<unknown> | unknown;
}) {
	const [queue, setQueue] = useState<UploadItem[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const [status, setStatus] = useState("");
	const [isUploading, setIsUploading] = useState(false);
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
		setStatus("");
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
		const selected = readyItems;
		if (!selected.length) return;
		setIsUploading(true);
		setStatus("");
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
			setStatus(
				`Indexed: ${result.indexed}. Duplicates: ${result.duplicates}. Failed: ${result.failed}.`,
			);
			await onUploaded?.();
			window.dispatchEvent(new Event(DataRefreshEvent));
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
		} finally {
			setIsUploading(false);
		}
	}

	function UpdateQueueItem(id: string, patch: Partial<UploadItem>) {
		setQueue((items) =>
			items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
		);
	}

	return (
		<DataCard
			action={<StatusBadge value={`${readyItems.length} Ready`} />}
			description={intro}
			eyebrow="Evidence Intake"
			title="Upload Evidence"
		>
			{status ? (
				<div className="mb-4 flex min-w-0 gap-2 rounded-lg border border-app-border bg-app-panel p-3 text-sm font-semibold text-app-muted">
					<AppIcon className="mt-0.5 size-4" icon={AlertTriangle} />
					<span className="min-w-0 break-words">{status}</span>
				</div>
			) : null}
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
							disabled={!readyItems.length || isUploading}
							icon={isUploading ? RefreshCw : UploadCloud}
							onClick={UploadSelected}
							type="button"
						>
							{isUploading ? "Uploading" : `Upload ${readyItems.length} files`}
						</Button>
						<Button
							disabled={isUploading}
							onClick={() => setQueue([])}
							type="button"
							variant="secondary"
						>
							Clear Queue
						</Button>
					</div>
					<UploadQueue
						items={queue}
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

function FileQueueId(file: File) {
	return `${FileDisplayName(file)}-${file.lastModified}-${file.size}`;
}

function FileDisplayName(file: File) {
	return (file as FileWithRelativePath).webkitRelativePath || file.name;
}

function UploadQueue({
	items,
	onRemove,
}: {
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
								disabled={item.status === "uploading"}
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
	selected.forEach((item, index) => {
		const outcome = result.items[index];
		if (!outcome) return;
		update(item.id, {
			status: outcome.status === "uploaded" ? "indexed" : outcome.status,
			progress: outcome.status === "failed" ? item.progress : 100,
			message: outcome.message,
		});
	});
	return {
		indexed: result.uploaded_count,
		duplicates: result.duplicate_count,
		failed: result.failed_count,
	};
}
