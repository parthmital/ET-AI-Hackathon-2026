"use client";

import { FileText } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { AppIcon, cn } from "@/components/UI";
import type { EvidenceReference } from "@/lib/types";

export function EvidenceReferenceCard({
	className,
	evidence,
}: {
	className?: string;
	evidence: EvidenceReference;
}) {
	return (
		<article
			className={cn(
				"min-w-0 rounded-lg border border-app-border bg-app-surface p-3",
				className,
			)}
		>
			<div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 items-start gap-2">
					<AppIcon className="mt-0.5 size-4 text-app-subtle" icon={FileText} />
					<div className="min-w-0">
						<p className="break-words text-sm font-semibold text-app-text">
							{evidence.document || "Source not available"}
						</p>
						<p className="mt-0.5 text-xs font-semibold text-app-subtle">
							Page {evidence.page || 1}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 flex-wrap justify-end gap-1.5">
					{evidence.status ? <StatusBadge value={evidence.status} /> : null}
					{typeof evidence.confidence === "number" ? (
						<StatusBadge value={`${Math.round(evidence.confidence * 100)}%`} />
					) : null}
				</div>
			</div>
			{evidence.snippet ? (
				<p className="mt-2 line-clamp-4 break-words text-sm leading-6 text-app-muted">
					{evidence.snippet}
				</p>
			) : (
				<p className="mt-2 text-sm text-app-muted">No snippet captured.</p>
			)}
			{evidence.reason ? (
				<p className="mt-2 break-words text-xs font-semibold leading-5 text-app-subtle">
					{evidence.reason}
				</p>
			) : null}
		</article>
	);
}

export function EvidenceList({
	evidence,
	empty,
}: {
	evidence: EvidenceReference[];
	empty?: string;
}) {
	if (!evidence.length) {
		return (
			<p className="rounded-lg border border-dashed border-app-border bg-app-panel p-3 text-sm text-app-muted">
				{empty ?? "No source evidence is available."}
			</p>
		);
	}
	return (
		<div className="grid gap-2">
			{evidence.map((item, index) => (
				<EvidenceReferenceCard
					evidence={item}
					key={`${item.document}-${item.page}-${index}`}
				/>
			))}
		</div>
	);
}
