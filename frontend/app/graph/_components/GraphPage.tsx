"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import { type Edge, type Node, type ReactFlowInstance } from "reactflow";
import {
	Crosshair,
	Download,
	Info,
	Network,
	RefreshCcw,
	Search,
} from "lucide-react";
import { DataCard } from "@/components/DataCard";
import { EvidenceReferenceCard } from "@/components/Evidence";
import { PageHeader } from "@/components/PageHeader";
import { StatusBadge } from "@/components/StatusBadge";
import {
	Button,
	EmptyState,
	SearchInput,
	SelectField,
	SkeletonBlock,
	cn,
} from "@/components/UI";
import { GetGraph, GetGraphExport, GetGraphPaths } from "@/lib/api";
import { FormatDisplayLabel } from "@/lib/format";
import type { GraphPath, GraphResponse } from "@/lib/types";
import { useAsyncResource } from "@/lib/useAsyncResource";

const LazyGraphCanvas = dynamic(
	() => import("@/components/GraphCanvas").then((module) => module.GraphCanvas),
	{
		loading: () => <GraphLoading />,
		ssr: false,
	},
);

const NodePalette: Record<
	string,
	{ border: string; bg: string; text: string }
> = {
	Equipment: {
		border: "var(--tone-teal-text)",
		bg: "var(--tone-teal-bg)",
		text: "var(--tone-teal-text)",
	},
	Document: {
		border: "var(--tone-indigo-text)",
		bg: "var(--tone-indigo-bg)",
		text: "var(--tone-indigo-text)",
	},
	"Failure Mode": {
		border: "var(--tone-red-text)",
		bg: "var(--tone-red-bg)",
		text: "var(--tone-red-text)",
	},
	"Safety Hazard": {
		border: "var(--tone-red-text)",
		bg: "var(--tone-red-bg)",
		text: "var(--tone-red-text)",
	},
	Regulation: {
		border: "var(--tone-amber-text)",
		bg: "var(--tone-amber-bg)",
		text: "var(--tone-amber-text)",
	},
	"Compliance Gap": {
		border: "var(--tone-red-text)",
		bg: "var(--tone-red-bg)",
		text: "var(--tone-red-text)",
	},
	"Spare Part": {
		border: "var(--tone-slate-text)",
		bg: "var(--tone-slate-bg)",
		text: "var(--tone-slate-text)",
	},
	"Maintenance Activity": {
		border: "var(--tone-teal-text)",
		bg: "var(--tone-teal-bg)",
		text: "var(--tone-teal-text)",
	},
	"Maintenance Event": {
		border: "var(--tone-teal-text)",
		bg: "var(--tone-teal-bg)",
		text: "var(--tone-teal-text)",
	},
	"Historian Signal": {
		border: "var(--tone-emerald-text)",
		bg: "var(--tone-emerald-bg)",
		text: "var(--tone-emerald-text)",
	},
	"Process Parameter": {
		border: "var(--tone-emerald-text)",
		bg: "var(--tone-emerald-bg)",
		text: "var(--tone-emerald-text)",
	},
	"Permit Control": {
		border: "var(--tone-amber-text)",
		bg: "var(--tone-amber-bg)",
		text: "var(--tone-amber-text)",
	},
	"PPE Requirement": {
		border: "var(--tone-amber-text)",
		bg: "var(--tone-amber-bg)",
		text: "var(--tone-amber-text)",
	},
	"Audit Status": {
		border: "var(--tone-indigo-text)",
		bg: "var(--tone-indigo-bg)",
		text: "var(--tone-indigo-text)",
	},
	"Inspection Date": {
		border: "var(--tone-slate-text)",
		bg: "var(--tone-slate-bg)",
		text: "var(--tone-slate-text)",
	},
	"Document Date": {
		border: "var(--tone-slate-text)",
		bg: "var(--tone-slate-bg)",
		text: "var(--tone-slate-text)",
	},
	"Work Order": {
		border: "var(--tone-indigo-text)",
		bg: "var(--tone-indigo-bg)",
		text: "var(--tone-indigo-text)",
	},
	Location: {
		border: "var(--tone-slate-text)",
		bg: "var(--tone-slate-bg)",
		text: "var(--tone-slate-text)",
	},
	Person: {
		border: "var(--tone-slate-text)",
		bg: "var(--tone-slate-bg)",
		text: "var(--tone-slate-text)",
	},
};

const EmptyGraph: GraphResponse = { nodes: [], edges: [] };
const GraphFitPadding = 0.24;
const GraphMinZoom = 0.08;
const CoreExcludedTypes = new Set([
	"Audit Status",
	"Document",
	"Document Date",
	"Inspection Date",
	"Location",
	"Maintenance Activity",
	"Maintenance Event",
	"Process Parameter",
]);

type GraphData = {
	graph: GraphResponse;
	paths: GraphPath[];
};

type GraphEdgeRecord = GraphResponse["edges"][number];

async function LoadGraphData(): Promise<GraphData> {
	const [graph, paths] = await Promise.all([GetGraph(), GetGraphPaths()]);
	return { graph, paths };
}

export default function GraphPage() {
	const [filter, setFilter] = useState("Core");
	const [search, setSearch] = useState("");
	const [selectedNode, setSelectedNode] = useState<Node | null>(null);
	const [selectedEdge, setSelectedEdge] = useState<GraphEdgeRecord | null>(
		null,
	);
	const [exportStatus, setExportStatus] = useState("");
	const [focusedMode, setFocusedMode] = useState(false);
	const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(
		null,
	);
	const graphViewportRef = useRef<HTMLDivElement | null>(null);
	const {
		data: graphData,
		error,
		isLoading,
		isRefreshing,
	} = useAsyncResource<GraphData>("graph", LoadGraphData);
	const graph = graphData?.graph ?? EmptyGraph;
	const graphPaths = useMemo(() => graphData?.paths ?? [], [graphData?.paths]);

	const nodeTypes = useMemo(
		() => [
			"Core",
			"All",
			...Array.from(new Set(graph.nodes.map((node) => node.data.type))).sort(),
		],
		[graph.nodes],
	);
	const connectedNodeIds = useMemo(() => {
		if (!selectedNode && !selectedEdge) return new Set<string>();
		const ids = new Set<string>();
		if (selectedNode) ids.add(selectedNode.id);
		if (selectedEdge) {
			ids.add(selectedEdge.source);
			ids.add(selectedEdge.target);
		}
		graph.edges.forEach((edge) => {
			if (selectedNode && edge.source === selectedNode.id) ids.add(edge.target);
			if (selectedNode && edge.target === selectedNode.id) ids.add(edge.source);
		});
		return ids;
	}, [graph.edges, selectedEdge, selectedNode]);
	const nodes: Node[] = useMemo(() => {
		const query = search.trim().toLowerCase();
		return graph.nodes
			.filter((node) => {
				if (filter === "Core") return !CoreExcludedTypes.has(node.data.type);
				return filter === "All" || node.data.type === filter;
			})
			.filter((node) => {
				if (!query) return true;
				return (
					node.data.label.toLowerCase().includes(query) ||
					node.data.type.toLowerCase().includes(query)
				);
			})
			.filter((node) => !focusedMode || connectedNodeIds.has(node.id))
			.map((node) => {
				const palette = NodePalette[node.data.type] ?? {
					border: "var(--app-border)",
					bg: "var(--app-surface)",
					text: "var(--app-text)",
				};
				const nodeBackground = `linear-gradient(${palette.bg}, ${palette.bg}), var(--app-graph-bg)`;
				const isDocument = node.data.type === "Document";
				const isEquipment = node.data.type === "Equipment";
				return {
					ariaLabel: `Graph node ${node.data.label} (${node.data.type})`,
					id: node.id,
					data: {
						label: `${node.data.label}\n${node.data.type}`,
						details: node.data.details,
						type: node.data.type,
					},
					position: node.position,
					style: {
						background: nodeBackground,
						border: `1px solid ${palette.border}`,
						borderRadius: 8,
						color: palette.text,
						fontSize: isEquipment ? 13 : 11,
						fontWeight: 700,
						lineHeight: 1.35,
						minHeight: isEquipment ? 76 : 62,
						padding: isEquipment ? 12 : 9,
						whiteSpace: "pre-line",
						width: isDocument ? 220 : isEquipment ? 210 : 180,
					},
				};
			});
	}, [connectedNodeIds, filter, focusedMode, graph.nodes, search]);
	const edges: Edge[] = useMemo(() => {
		const visibleNodeIds = new Set(nodes.map((node) => node.id));
		return graph.edges
			.filter(
				(edge) =>
					visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
			)
			.map((edge) => ({
				ariaLabel: `Graph edge ${edge.source_node ?? edge.source} ${FormatDisplayLabel(edge.relation_type)} ${edge.target_node ?? edge.target}`,
				id: edge.id,
				interactionWidth: 24,
				label:
					(selectedNode &&
						(edge.source === selectedNode.id ||
							edge.target === selectedNode.id)) ||
					selectedEdge?.id === edge.id
						? FormatDisplayLabel(edge.label)
						: undefined,
				source: edge.source,
				target: edge.target,
				data: { original: edge },
				labelBgStyle: { fill: "var(--app-surface)" },
				labelStyle: { fill: "var(--app-muted)", fontWeight: 700 },
				style: {
					stroke: EdgeStroke(edge.validation_status),
					strokeWidth: selectedEdge?.id === edge.id ? 2.8 : 1.8,
				},
				type: "smoothstep",
			}));
	}, [graph.edges, nodes, selectedEdge, selectedNode]);
	const selectedDetails = selectedNode?.data.details as
		Record<string, unknown> | undefined;
	const selectedPath = useMemo(() => {
		if (!selectedNode) return null;
		const selectedId = selectedNode.id.replace(/^Compliance Gap:\d+$/, "");
		return (
			graphPaths.find(
				(path) =>
					path.asset_id === selectedNode.id ||
					path.nodes.some((node) => node.id === selectedNode.id) ||
					path.nodes.some((node) => node.label === selectedId),
			) ?? null
		);
	}, [graphPaths, selectedNode]);

	function FitView() {
		flowInstance?.fitView({
			duration: 240,
			minZoom: GraphMinZoom,
			padding: GraphFitPadding,
		});
	}

	function ResetView() {
		setFilter("Core");
		setSearch("");
		setFocusedMode(false);
		setSelectedNode(null);
		setSelectedEdge(null);
		setExportStatus("");
		window.setTimeout(FitView, 0);
	}

	async function ExportGraph(format: "json" | "cypher") {
		setExportStatus("");
		try {
			const exported = await GetGraphExport(format);
			DownloadText(exported.filename, exported.content);
			setExportStatus(`${FormatDisplayLabel(format)} graph exported`);
		} catch (error) {
			setExportStatus(error instanceof Error ? error.message : "Export failed");
		}
	}

	return (
		<>
			<PageHeader
				actions={
					<div className="flex flex-wrap gap-2">
						<StatusBadge value={`${graph.nodes.length} Nodes`} />
						<StatusBadge value={`${graph.edges.length} Links`} />
						{graph.edge_audit ? (
							<>
								<StatusBadge value={`${graph.edge_audit.accepted} accepted`} />
								<StatusBadge value={`${graph.edge_audit.weak} weak`} />
								<StatusBadge value={`${graph.edge_audit.rejected} rejected`} />
							</>
						) : null}
						<Button
							disabled={!graph.edges.length}
							icon={Download}
							onClick={() => void ExportGraph("json")}
							type="button"
							variant="secondary"
						>
							JSON
						</Button>
						<Button
							disabled={!graph.edges.length}
							icon={Download}
							onClick={() => void ExportGraph("cypher")}
							type="button"
							variant="secondary"
						>
							Cypher
						</Button>
					</div>
				}
				icon={Network}
				title="Evidence Graph"
				subtitle="Explore generated relationships between assets, documents, failures, controls, compliance gaps, and operational events."
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

			<DataCard
				description="Search and filter the graph, then select a node to inspect its details and graph path."
				eyebrow="Trace Explorer"
				padded={false}
				title="Evidence Graph"
			>
				<div className="border-b border-app-border p-4">
					<div className="grid gap-3 2xl:grid-cols-[minmax(18rem,1fr)_auto] 2xl:items-end">
						<div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
							<div className="min-w-0">
								<label className="mb-1 block text-xs font-semibold text-app-subtle">
									Search
								</label>
								<SearchInput
									icon={Search}
									onValueChange={setSearch}
									placeholder="Search graph"
									value={search}
								/>
							</div>
							<div className="min-w-0">
								<span className="mb-1 block text-xs font-semibold text-app-subtle">
									Type
								</span>
								<SelectField
									ariaLabel="Type"
									onValueChange={setFilter}
									options={nodeTypes}
									value={filter}
								/>
							</div>
						</div>
						<div className="flex min-w-0 flex-wrap gap-2 2xl:justify-end">
							<Button
								className="min-w-24 flex-1 md:flex-none"
								disabled={!selectedNode}
								icon={Crosshair}
								onClick={() => setFocusedMode((value) => !value)}
								type="button"
								variant={focusedMode ? "soft" : "secondary"}
							>
								{focusedMode ? "Focused" : "Focus Node"}
							</Button>
							<Button
								className="min-w-24 flex-1 md:flex-none"
								icon={Network}
								onClick={FitView}
								type="button"
								variant="secondary"
							>
								Fit
							</Button>
							<Button
								className="min-w-24 flex-1 md:flex-none"
								icon={RefreshCcw}
								onClick={ResetView}
								type="button"
								variant="secondary"
							>
								Reset
							</Button>
						</div>
					</div>
				</div>

				<div className="grid min-h-[min(74vh,760px)] gap-0 xl:grid-cols-[minmax(0,1fr)_24rem]">
					<div
						className="relative h-[min(74vh,760px)] min-h-[520px] bg-app-graph-bg xl:min-h-[680px]"
						ref={graphViewportRef}
					>
						{isLoading && !graph.nodes.length ? (
							<GraphLoading />
						) : nodes.length ? (
							<LazyGraphCanvas
								edges={edges}
								nodes={nodes}
								onEdgeClick={(edge) => {
									const original = edge.data?.original as
										GraphEdgeRecord | undefined;
									if (original) {
										setSelectedEdge(original);
										setSelectedNode(null);
									}
								}}
								onInit={setFlowInstance}
								onNodeClick={(node) => {
									setSelectedNode(node);
									setSelectedEdge(null);
								}}
							/>
						) : (
							<div className="p-4">
								<EmptyState
									icon={Network}
									message="No nodes match the active search or filter."
									title="No Graph Nodes"
								/>
							</div>
						)}
					</div>

					<aside className="min-w-0 border-t border-app-border bg-app-panel p-4 xl:border-l xl:border-t-0">
						<SelectedNodePanel
							path={selectedPath}
							selectedEdge={selectedEdge}
							selectedDetails={selectedDetails}
							selectedNode={selectedNode}
						/>
						<GraphLegend className="mt-4" />
					</aside>
				</div>
			</DataCard>
		</>
	);
}

function SelectedNodePanel({
	path,
	selectedEdge,
	selectedDetails,
	selectedNode,
}: {
	path: GraphPath | null;
	selectedEdge: GraphEdgeRecord | null;
	selectedDetails: Record<string, unknown> | undefined;
	selectedNode: Node | null;
}) {
	if (selectedEdge) {
		return (
			<div className="space-y-4">
				<section>
					<div className="flex flex-wrap gap-2">
						<StatusBadge value={selectedEdge.validation_status} />
						<StatusBadge
							value={`${Math.round(selectedEdge.confidence * 100)}%`}
						/>
					</div>
					<h3 className="mt-3 break-words text-lg font-semibold leading-tight text-app-text">
						{FormatDisplayLabel(selectedEdge.relation_type)}
					</h3>
					<p className="mt-2 break-words text-sm leading-6 text-app-muted">
						{selectedEdge.source_node ?? selectedEdge.source} /{" "}
						{selectedEdge.target_node ?? selectedEdge.target}
					</p>
				</section>
				<EvidenceReferenceCard
					evidence={{
						confidence: selectedEdge.confidence,
						document: selectedEdge.source_document,
						page: selectedEdge.source_page,
						reason: selectedEdge.validation_reason,
						snippet: selectedEdge.evidence_text,
						status: selectedEdge.validation_status,
					}}
				/>
			</div>
		);
	}

	if (!selectedNode) {
		return (
			<EmptyState
				icon={Info}
				message="Select any node to inspect generated details and linked paths."
				title="No Node Selected"
			/>
		);
	}

	return (
		<div className="space-y-4">
			<section>
				<div className="flex flex-wrap gap-2">
					<StatusBadge value={String(selectedNode.data.type)} />
					{path ? <StatusBadge value={`${path.edges.length} Links`} /> : null}
				</div>
				<h3 className="mt-3 break-words text-lg font-semibold leading-tight text-app-text">
					{String(selectedNode.data.label).split("\n")[0]}
				</h3>
			</section>

			<section>
				<h4 className="text-sm font-semibold text-app-text">Node Details</h4>
				<div className="mt-3 divide-y divide-app-border border-y border-app-border">
					{selectedDetails && Object.entries(selectedDetails).length ? (
						Object.entries(selectedDetails).map(([key, value]) => (
							<div
								className="grid gap-1 py-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]"
								key={key}
							>
								<p className="font-semibold text-app-subtle">
									{FormatDisplayLabel(key)}
								</p>
								<p className="break-words leading-6 text-app-text">
									{typeof value === "string" || typeof value === "number"
										? value
										: JSON.stringify(value)}
								</p>
							</div>
						))
					) : (
						<p className="text-sm text-app-muted">
							No extra details are available.
						</p>
					)}
				</div>
			</section>

			{path ? (
				<section>
					<h4 className="text-sm font-semibold text-app-text">
						Focused Graph Path
					</h4>
					<p className="mt-2 text-sm leading-6 text-app-muted">
						{path.summary}
					</p>
					<div className="mt-3 grid gap-2">
						{path.edges.slice(0, 5).map((edge, index) => (
							<div
								className="break-words border-l-2 border-app-border pl-2 text-xs font-semibold leading-5 text-app-muted"
								key={`${edge.source}-${edge.label}-${edge.target}-${index}`}
							>
								{edge.source} / {FormatDisplayLabel(edge.label)} / {edge.target}
							</div>
						))}
						{path.edges.length > 5 ? (
							<p className="text-xs font-semibold text-app-subtle">
								+{path.edges.length - 5} more links
							</p>
						) : null}
					</div>
				</section>
			) : null}
		</div>
	);
}

function GraphLegend({ className }: { className?: string }) {
	const rows = [
		["Equipment", NodePalette.Equipment],
		["Document", NodePalette.Document],
		["Failure", NodePalette["Failure Mode"]],
		["Control", NodePalette.Regulation],
		["Signal", NodePalette["Historian Signal"]],
	] as const;

	return (
		<section className={cn("border-t border-app-border pt-4", className)}>
			<h3 className="text-sm font-semibold text-app-text">Legend</h3>
			<div className="mt-3 grid gap-2">
				{rows.map(([label, palette]) => (
					<div
						className="flex items-center gap-2 text-sm text-app-muted"
						key={label}
					>
						<span
							className="size-3 rounded-sm border"
							style={{
								background: palette.bg,
								borderColor: palette.border,
							}}
						/>
						<span className="font-semibold">{label}</span>
					</div>
				))}
			</div>
		</section>
	);
}

function GraphLoading() {
	return (
		<div className="p-4">
			<SkeletonBlock className="h-[min(66vh,650px)] min-h-[420px]" />
		</div>
	);
}

function EdgeStroke(status: string) {
	const key = status.toLowerCase();
	if (key.includes("accepted")) return "var(--tone-emerald-text)";
	if (key.includes("weak")) return "var(--tone-amber-text)";
	if (key.includes("rejected")) return "var(--tone-red-text)";
	return "var(--app-graph-edge)";
}

function DownloadText(filename: string, content: string) {
	const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
