"use client";

import { FormEvent, useMemo, useState } from "react";
import {
	Bot,
	ClipboardList,
	Copy,
	FileSearch,
	FileText,
	MessageSquareText,
	Network,
	Send,
	Sparkles,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import { EvidenceReferenceCard } from "@/components/Evidence";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
	AppIcon,
	Button,
	ChoiceChip,
	EmptyState,
	PanelButton,
	SkeletonBlock,
	TextAreaField,
	type IconType,
} from "@/components/UI";
import { AskQuestion } from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type { ChatResponse, GraphPath } from "@/lib/types";

type ChatTurn = {
	id: string;
	question: string;
	response?: ChatResponse;
	status: "loading" | "complete" | "failed";
	error?: string;
};

const PromptStarters = [
	"Which assets are high risk and what evidence supports it?",
	"Summarise open compliance gaps by asset.",
	"What inspections or events mention pump seal failure?",
	"Which corrective actions should be handled first?",
];

export default function ChatPage() {
	const [question, setQuestion] = useState("");
	const [turns, setTurns] = useState<ChatTurn[]>([]);
	const [copyStatus, setCopyStatus] = useState("");

	const latestTurn = useMemo(
		() => [...turns].reverse().find((turn) => turn.status === "complete"),
		[turns],
	);
	const currentTurn = turns[turns.length - 1];
	const hasLoadingTurn = turns.some((turn) => turn.status === "loading");
	const latestResponse = latestTurn?.response;

	async function HandleSubmit(event?: FormEvent) {
		event?.preventDefault();
		const trimmedQuestion = question.trim();
		if (!trimmedQuestion) return;
		const id = `${Date.now()}-${trimmedQuestion}`;
		setTurns((items) => [
			...items,
			{ id, question: trimmedQuestion, status: "loading" },
		]);
		setCopyStatus("");
		try {
			const result = await AskQuestion(trimmedQuestion);
			setTurns((items) =>
				items.map((item) =>
					item.id === id
						? { ...item, response: result, status: "complete" }
						: item,
				),
			);
		} catch (error) {
			setTurns((items) =>
				items.map((item) =>
					item.id === id
						? {
								...item,
								error: error instanceof Error ? error.message : "Chat failed",
								status: "failed",
							}
						: item,
				),
			);
		}
	}

	async function CopyAnswer() {
		if (!latestTurn?.response?.answer) return;
		try {
			await navigator.clipboard.writeText(latestTurn.response.answer);
			setCopyStatus("Copied");
		} catch {
			setCopyStatus("Copy Failed");
		}
		window.setTimeout(() => setCopyStatus(""), 1800);
	}

	return (
		<>
			<PageHeader
				actions={
					<Button
						disabled={!latestTurn?.response?.answer}
						icon={Copy}
						onClick={CopyAnswer}
						type="button"
						variant="secondary"
					>
						{copyStatus || "Copy Answer"}
					</Button>
				}
				icon={MessageSquareText}
				title="Ask With Citations"
				subtitle="Ask plant questions and get cited answers from uploaded evidence."
			/>
			<div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(23rem,0.85fr)]">
				<div className="space-y-4">
					<DataCard
						action={
							<StatusBadge value={hasLoadingTurn ? "Retrieving" : "Ready"} />
						}
						description="Questions are answered from retrieved workspace evidence, not canned demo text."
						eyebrow="Query Console"
						title="Ask Industrial Ops Brain"
					>
						<form onSubmit={HandleSubmit}>
							<TextAreaField
								ariaLabel="Question"
								placeholder="Ask about an asset, inspection, safety control, spare part, or compliance issue"
								value={question}
								onValueChange={setQuestion}
							/>
							<div className="mt-3 flex flex-wrap gap-2">
								{PromptStarters.map((prompt) => (
									<ChoiceChip
										key={prompt}
										onClick={() => setQuestion(prompt)}
										selected={question === prompt}
									>
										{prompt}
									</ChoiceChip>
								))}
							</div>
							<div className="mt-4 flex justify-end">
								<Button
									className="w-full sm:w-auto"
									disabled={!question.trim() || hasLoadingTurn}
									icon={Send}
									type="submit"
								>
									Ask With Citations
								</Button>
							</div>
						</form>
					</DataCard>

					<DataCard
						action={
							<StatusBadge
								value={
									latestTurn
										? `${Math.round((latestResponse?.confidence ?? 0) * 100)}% Confidence`
										: "No Answer"
								}
							/>
						}
						description="The latest response stays prominent so it can be judged without expanding sections."
						eyebrow="Answer"
						title="Cited Response"
					>
						{currentTurn ? (
							<ChatTurnCard turn={currentTurn} />
						) : (
							<EmptyState
								icon={MessageSquareText}
								message="Upload relevant documents, analyse the workspace, and enter a question."
								title="No Questions Yet"
							/>
						)}
					</DataCard>
				</div>

				<div className="space-y-4">
					<DataCard
						action={
							<StatusBadge value={`${latestResponse?.citations.length ?? 0}`} />
						}
						description="Page level evidence behind the latest completed answer."
						eyebrow="Sources"
						title="Citations"
					>
						{latestResponse?.citations.length ? (
							<div className="grid gap-3">
								{latestResponse.citations.map((citation, index) => (
									<EvidenceReferenceCard
										evidence={{
											document: citation.document,
											page: citation.page,
											snippet: citation.snippet,
											status: "accepted",
										}}
										key={`${citation.document}-${citation.page}-${index}`}
									/>
								))}
							</div>
						) : (
							<EmptyState
								icon={FileText}
								message="Citations appear after an answer is generated."
								title="No Citations Selected"
							/>
						)}
					</DataCard>

					<DataCard
						action={
							<StatusBadge
								value={`${latestResponse?.graph_paths.length ?? 0}`}
							/>
						}
						description="Entity relationships linked to the answer."
						eyebrow="Trace"
						title="Graph Paths"
					>
						{latestResponse?.graph_paths.length ? (
							<GraphPathsPanel paths={latestResponse.graph_paths} />
						) : (
							<EmptyState
								icon={Network}
								message="Graph paths appear when the answer is linked to generated asset relationships."
								title="No Graph Path Selected"
							/>
						)}
					</DataCard>

					<DataCard
						action={<StatusBadge value={turns.length} />}
						description="Recent questions help recover useful judge prompts quickly."
						eyebrow="History"
						title="Recent Questions"
					>
						{turns.length ? (
							<div className="space-y-2">
								{turns
									.slice()
									.reverse()
									.map((turn) => (
										<PanelButton
											className="bg-app-panel p-3 hover:bg-app-hover"
											key={turn.id}
											onClick={() => setQuestion(turn.question)}
										>
											<div className="flex items-start justify-between gap-2">
												<p className="line-clamp-2 text-sm font-semibold text-app-text">
													{turn.question}
												</p>
												<StatusBadge value={turn.status} />
											</div>
										</PanelButton>
									))}
							</div>
						) : (
							<EmptyState
								icon={ClipboardList}
								message="Asked questions are kept here until this tab is refreshed."
								title="No Recent Questions"
							/>
						)}
					</DataCard>
				</div>
			</div>
		</>
	);
}

function GraphPathsPanel({ paths }: { paths: GraphPath[] }) {
	return (
		<div className="divide-y divide-app-border">
			{paths.map((path) => (
				<article className="py-3" key={`${path.asset_id}-${path.title}`}>
					<div className="flex flex-wrap items-start justify-between gap-2">
						<div className="min-w-0">
							<p className="break-words text-sm font-semibold text-app-text">
								{path.title}
							</p>
							<p className="mt-1 font-mono text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-app-subtle">
								{path.asset_id} / {Math.round(path.confidence * 100)}%
							</p>
						</div>
						<StatusBadge value={`${path.edges.length} Links`} />
					</div>
					<p className="mt-3 text-sm leading-6 text-app-muted">
						{path.summary}
					</p>
					<div className="mt-3 space-y-1.5">
						{path.edges.slice(0, 5).map((edge) => (
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
								key={`${edge.source}-${edge.label}-${edge.target}`}
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
	);
}

function ChatTurnCard({ turn }: { turn: ChatTurn }) {
	return (
		<article className="space-y-4">
			<div>
				<p className="mb-1 text-xs font-semibold text-app-subtle">
					Asked Question
				</p>
				<p className="min-w-0 break-words text-sm font-semibold leading-6 text-app-text">
					{turn.question}
				</p>
			</div>
			<div className="min-w-0 border-t border-app-border pt-4">
				<p className="mb-3 flex items-center gap-2 text-sm font-semibold text-app-text">
					<AppIcon className="size-4 text-app-primary" icon={Bot} />
					Answer
				</p>
				{turn.status === "loading" ? (
					<div className="space-y-3">
						<p className="flex items-center gap-2 text-sm font-semibold text-app-muted">
							<AppIcon
								className="size-4 text-app-subtle"
								icon={FileSearch}
								strokeWidth={1.8}
							/>
							Retrieving evidence
						</p>
						<SkeletonBlock className="h-4" />
						<SkeletonBlock className="h-4 w-4/5" />
					</div>
				) : turn.status === "failed" ? (
					<p className="text-sm font-semibold text-tone-red-text">
						{turn.error}
					</p>
				) : (
					<>
						<p className="break-words whitespace-pre-wrap text-sm leading-7 text-app-text">
							{turn.response?.answer}
						</p>
						<AnswerMeta response={turn.response} />
					</>
				)}
			</div>
		</article>
	);
}

function AnswerMeta({ response }: { response?: ChatResponse }) {
	if (!response) return null;
	const confidence = Math.round(response.confidence * 100);
	const relatedEntities = response.related_entities;

	return (
		<div className="mt-4 border-t border-app-border pt-3">
			<div className="grid gap-3 sm:grid-cols-3">
				<AnswerMetric
					icon={Sparkles}
					label="Confidence"
					value={`${confidence}%`}
				/>
				<AnswerMetric
					icon={FileText}
					label="Citations"
					value={response.citations.length}
				/>
				<AnswerMetric
					icon={Network}
					label="Graph Paths"
					value={response.graph_paths.length}
				/>
			</div>
			{relatedEntities.length ? (
				<div className="mt-3">
					<p className="text-xs font-semibold text-app-subtle">Related Terms</p>
					<div className="mt-2 flex flex-wrap gap-1.5">
						{relatedEntities.map((entity) => (
							<StatusBadge key={entity} value={entity} />
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}

function AnswerMetric({
	icon: Icon,
	label,
	value,
}: {
	icon: IconType;
	label: string;
	value: number | string;
}) {
	return (
		<div className="rounded-lg border border-app-border bg-app-panel p-3">
			<div className="flex items-center gap-2">
				<AppIcon className="size-4 text-app-subtle" icon={Icon} />
				<p className="truncate text-xs font-semibold text-app-subtle">
					{label}
				</p>
			</div>
			<p className="mt-2 font-mono text-xl font-semibold leading-tight text-app-text">
				{value}
			</p>
		</div>
	);
}
