"use client";

import { FormEvent, useState } from "react";
import {
	ClipboardCheck,
	Network,
	Printer,
	Route,
	SearchCheck,
	Send,
	ShieldCheck,
	Wrench,
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
	SelectField,
	SkeletonBlock,
	TextAreaField,
	type IconType,
} from "@/components/UI";
import { GetAssets, RunRCA } from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type { Asset, GraphPath, RCAResponse } from "@/lib/types";
import { useAsyncResource } from "@/lib/useAsyncResource";

export default function RCAPage() {
	const [asset, setAsset] = useState("");
	const [symptom, setSymptom] = useState("");
	const [report, setReport] = useState<RCAResponse | null>(null);
	const [checkedActions, setCheckedActions] = useState<Record<string, boolean>>(
		{},
	);
	const [status, setStatus] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const { data: assets = [], error: assetsError } = useAsyncResource<Asset[]>(
		"rca-assets",
		GetAssets,
	);

	async function HandleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!asset.trim() || !symptom.trim()) return;
		setIsLoading(true);
		setStatus("");
		setCheckedActions({});
		try {
			setReport(await RunRCA(asset.trim(), symptom.trim()));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "RCA failed");
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<>
			<PageHeader
				actions={
					report ? (
						<Button
							icon={Printer}
							onClick={() => window.print()}
							type="button"
							variant="secondary"
						>
							Print Report
						</Button>
					) : null
				}
				icon={Wrench}
				title="Root Cause Analysis"
				subtitle="Generate a cited engineering brief for one asset and symptom."
			/>
			<div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
				<DataCard
					className="print-hidden xl:sticky xl:top-4 xl:self-start"
					description="Choose a generated asset and describe the symptom exactly as the operator would report it."
					eyebrow="Input"
					title="RCA Builder"
				>
					<form className="space-y-4" onSubmit={HandleSubmit}>
						<div>
							<label
								className="text-sm font-semibold text-app-muted"
								htmlFor="asset"
							>
								Asset
							</label>
							<SelectField
								ariaLabel="Asset"
								className="mt-2"
								disabled={!assets.length}
								id="asset"
								options={assets.map((item) => ({
									label: `${item.id} / ${item.name}`,
									value: item.id,
								}))}
								placeholder="Select analysed asset"
								value={asset}
								onValueChange={setAsset}
							/>
						</div>
						<div>
							<label
								className="text-sm font-semibold text-app-muted"
								htmlFor="symptom"
							>
								Symptom
							</label>
							<TextAreaField
								ariaLabel="Symptom"
								className="mt-2"
								id="symptom"
								placeholder="Describe the symptom"
								value={symptom}
								onValueChange={setSymptom}
							/>
						</div>
						<Button
							className="w-full"
							disabled={isLoading || !asset || !symptom.trim()}
							icon={Send}
							type="submit"
						>
							{isLoading ? "Generating" : "Generate RCA"}
						</Button>
						{status || assetsError ? (
							<div className="break-words rounded-lg border border-tone-red-border bg-tone-red-bg p-3 text-sm font-semibold text-tone-red-text">
								{status || assetsError}
							</div>
						) : null}
					</form>
				</DataCard>

				<div className="min-w-0 space-y-4">
					<DataCard
						action={
							report ? (
								<div className="flex flex-wrap gap-2">
									<StatusBadge value={report.asset} />
									<StatusBadge
										value={`${report.cited_documents.length} Cited Docs`}
									/>
								</div>
							) : null
						}
						className="print-card"
						description="The report keeps causes, checks, preventive actions, evidence, and graph trace together."
						eyebrow="Report"
						title="RCA Brief"
					>
						{isLoading ? (
							<div className="space-y-3">
								<SkeletonBlock className="h-12" />
								<SkeletonBlock className="h-28" />
								<SkeletonBlock className="h-28" />
							</div>
						) : report ? (
							<div className="space-y-4">
								<div>
									<p className="text-xs font-semibold text-app-subtle">
										Symptom
									</p>
									<p className="mt-2 break-words text-sm font-semibold leading-6 text-app-text">
										{report.symptom}
									</p>
								</div>
								<div className="grid gap-4 xl:grid-cols-3">
									<ReportList
										icon={SearchCheck}
										items={report.likely_causes}
										title="Likely Causes"
									/>
									<ReportList
										icon={ClipboardCheck}
										items={report.recommended_checks}
										title="Recommended Checks"
									/>
									<ActionList
										checkedActions={checkedActions}
										items={report.preventive_actions}
										onChange={setCheckedActions}
									/>
								</div>
							</div>
						) : (
							<EmptyState
								icon={Route}
								message="Enter an asset and symptom to generate a cited root cause report."
								title="No RCA Report Yet"
							/>
						)}
					</DataCard>

					{report ? (
						<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.75fr)]">
							<DataCard
								action={
									<StatusBadge value={report.supporting_evidence.length} />
								}
								className="print-card"
								description="Source snippets used to support the generated report."
								eyebrow="Evidence"
								title="Supporting Evidence"
							>
								<div className="grid gap-3">
									{report.supporting_evidence.map((evidence, index) => (
										<EvidenceReferenceCard
											evidence={{
												document: evidence.document,
												page: evidence.page,
												snippet: evidence.snippet,
												status: "accepted",
											}}
											key={`${evidence.document}-${index}`}
										/>
									))}
								</div>
							</DataCard>
							<DataCard
								action={<StatusBadge value={report.graph_paths.length} />}
								className="print-card"
								description="Relationship trace attached to this RCA."
								eyebrow="Trace"
								title="Graph Path"
							>
								<GraphPathPanel paths={report.graph_paths} />
							</DataCard>
						</div>
					) : null}
				</div>
			</div>
		</>
	);
}

function GraphPathPanel({ paths }: { paths: GraphPath[] }) {
	return paths.length ? (
		<div className="divide-y divide-app-border">
			{paths.map((path) => (
				<article className="py-3" key={`${path.asset_id}-${path.title}`}>
					<p className="font-semibold text-app-text">{path.title}</p>
					<p className="mt-2 text-sm leading-6 text-app-muted">
						{path.summary}
					</p>
					<div className="mt-3 space-y-1.5">
						{path.edges.slice(0, 5).map((edge, index) => (
							<EvidenceReferenceCard
								className="bg-app-panel"
								evidence={{
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
								}}
								key={`${edge.source}-${edge.label}-${edge.target}-${index}`}
							/>
						))}
						{path.edges.length > 5 ? (
							<p className="text-xs font-semibold text-app-subtle">
								+{path.edges.length - 5} more links
							</p>
						) : null}
					</div>
				</article>
			))}
		</div>
	) : (
		<EmptyState
			icon={Network}
			message="No graph path is linked to this RCA report."
			title="No Graph Path"
		/>
	);
}

function ReportList({
	title,
	items,
	icon: Icon,
}: {
	title: string;
	items: string[];
	icon: IconType;
}) {
	return (
		<section>
			<div className="flex min-w-0 items-center gap-2">
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
				<h3 className="text-sm font-semibold text-app-text">{title}</h3>
			</div>
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
		</section>
	);
}

function ActionList({
	items,
	checkedActions,
	onChange,
}: {
	items: string[];
	checkedActions: Record<string, boolean>;
	onChange: (value: Record<string, boolean>) => void;
}) {
	return (
		<section>
			<div className="flex min-w-0 items-center gap-2">
				<AppIcon className="size-4 text-app-subtle" icon={ShieldCheck} />
				<h3 className="text-sm font-semibold text-app-text">
					Preventive Actions
				</h3>
			</div>
			<div className="mt-3 space-y-2">
				{items.map((item) => (
					<CustomCheckbox
						checked={checkedActions[item] ?? false}
						key={item}
						onCheckedChange={(checked) =>
							onChange({ ...checkedActions, [item]: checked })
						}
					>
						{item}
					</CustomCheckbox>
				))}
			</div>
		</section>
	);
}
