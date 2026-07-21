"use client";

import dynamic from "next/dynamic";
import { useMemo, useRef, useState } from "react";
import {
	MarkerType,
	Position,
	type Edge,
	type Node,
	type ReactFlowInstance,
} from "reactflow";
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

type NodePaletteEntry = { border: string; bg: string; text: string };

const NodePalette: Record<string, NodePaletteEntry> = {
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
const GraphFitPadding = 0.18;
const GraphMinZoom = 0.22;
const GraphColumnGap = 292;
const GraphLaneMinHeight = 188;
const GraphNodeWidth = 224;
const GraphStackGap = 112;
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
const GraphColumnByType: Record<string, number> = {
	Equipment: 0,
	Location: 1,
	"Historian Signal": 1,
	"Process Parameter": 1,
	"Failure Mode": 2,
	"Safety Hazard": 2,
	"Maintenance Activity": 3,
	"Maintenance Event": 3,
	"Work Order": 3,
	"Spare Part": 3,
	"Permit Control": 4,
	"PPE Requirement": 4,
	Regulation: 4,
	"Compliance Gap": 5,
	Contradiction: 5,
	"Audit Status": 5,
	"Inspection Date": 5,
	"Document Date": 5,
	Person: 5,
	Document: 6,
};
const TypeSortOrder = [
	"Equipment",
	"Location",
	"Historian Signal",
	"Process Parameter",
	"Failure Mode",
	"Safety Hazard",
	"Maintenance Activity",
	"Maintenance Event",
	"Work Order",
	"Spare Part",
	"Permit Control",
	"PPE Requirement",
	"Regulation",
	"Compliance Gap",
	"Contradiction",
	"Document",
];

type GraphData = {
	graph: GraphResponse;
	paths: GraphPath[];
};

type GraphEdgeRecord = GraphResponse["edges"][number];
type GraphNodeRecord = GraphResponse["nodes"][number];

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
	const visibleGraphNodes = useMemo(() => {
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
			.filter((node) => !focusedMode || connectedNodeIds.has(node.id));
	}, [connectedNodeIds, filter, focusedMode, graph.nodes, search]);
	const visibleGraphNodeIds = useMemo(
		() => new Set(visibleGraphNodes.map((node) => node.id)),
		[visibleGraphNodes],
	);
	const visibleGraphEdges = useMemo(
		() =>
			graph.edges.filter(
				(edge) =>
					visibleGraphNodeIds.has(edge.source) &&
					visibleGraphNodeIds.has(edge.target),
			),
		[graph.edges, visibleGraphNodeIds],
	);
	const graphLayout = useMemo(
		() => BuildReadableGraphLayout(visibleGraphNodes, visibleGraphEdges),
		[visibleGraphEdges, visibleGraphNodes],
	);
	const selectionActive = Boolean(selectedNode || selectedEdge);
	const nodes: Node[] = useMemo(
		() =>
			visibleGraphNodes.map((node) => {
				const palette = NodePalette[node.data.type] ?? {
					border: "var(--app-border)",
					bg: "var(--app-surface)",
					text: "var(--app-text)",
				};
				const isDocument = node.data.type === "Document";
				const isEquipment = node.data.type === "Equipment";
				return {
					ariaLabel: `Graph node ${node.data.label} (${node.data.type})`,
					className: "evidence-flow-node",
					id: node.id,
					data: {
						degree: graphLayout.degreeByNode.get(node.id) ?? 0,
						details: node.data.details,
						dimmed:
							selectionActive && !connectedNodeIds.has(node.id)
								? true
								: undefined,
						label: node.data.label,
						palette,
						title: node.data.label,
						type: node.data.type,
					},
					position: graphLayout.positions[node.id] ?? node.position,
					sourcePosition: Position.Right,
					style: {
						width: isDocument ? 252 : isEquipment ? 244 : GraphNodeWidth,
					},
					targetPosition: Position.Left,
					type: "evidence",
				};
			}),
		[
			connectedNodeIds,
			graphLayout.degreeByNode,
			graphLayout.positions,
			selectionActive,
			visibleGraphNodes,
		],
	);
	const edges: Edge[] = useMemo(
		() =>
			visibleGraphEdges.map((edge) => {
				const stroke = EdgeStroke(edge.validation_status);
				const isHighlighted =
					selectedEdge?.id === edge.id ||
					Boolean(
						selectedNode &&
						(edge.source === selectedNode.id ||
							edge.target === selectedNode.id),
					);
				const isDimmed = selectionActive && !isHighlighted;
				return {
					ariaLabel: `Graph edge ${edge.source_node ?? edge.source} ${FormatDisplayLabel(edge.relation_type)} ${edge.target_node ?? edge.target}`,
					data: { original: edge },
					id: edge.id,
					interactionWidth: 28,
					label: isHighlighted ? FormatDisplayLabel(edge.label) : undefined,
					labelBgBorderRadius: 6,
					labelBgPadding: [8, 4],
					labelBgStyle: { fill: "var(--app-surface)" },
					labelStyle: {
						fill: "var(--app-text)",
						fontSize: 11,
						fontWeight: 700,
					},
					markerEnd: {
						color: stroke,
						height: 14,
						type: MarkerType.ArrowClosed,
						width: 14,
					},
					source: edge.source,
					style: {
						stroke,
						strokeOpacity: isDimmed ? 0.14 : 0.78,
						strokeWidth: isHighlighted ? 2.8 : 1.6,
					},
					target: edge.target,
					type: "smoothstep",
					zIndex: isHighlighted ? 8 : 1,
				};
			}),
		[selectionActive, selectedEdge, selectedNode, visibleGraphEdges],
	);
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

				<div className="min-h-[min(76vh,820px)]">
					<div
						className="relative h-[min(76vh,820px)] min-h-[560px] bg-app-graph-bg"
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

					<div className="grid min-w-0 gap-4 border-t border-app-border bg-app-panel p-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
						<SelectedNodePanel
							path={selectedPath}
							selectedEdge={selectedEdge}
							selectedDetails={selectedDetails}
							selectedNode={selectedNode}
						/>
						<GraphLegend />
					</div>
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

function BuildReadableGraphLayout(
	graphNodes: GraphNodeRecord[],
	graphEdges: GraphEdgeRecord[],
) {
	const positions: Record<string, { x: number; y: number }> = {};
	const nodeById = new Map(graphNodes.map((node) => [node.id, node]));
	const degreeByNode = new Map(graphNodes.map((node) => [node.id, 0]));
	const relatedAssetCountsByNode = new Map<string, Map<string, number>>();

	graphEdges.forEach((edge) => {
		const source = nodeById.get(edge.source);
		const target = nodeById.get(edge.target);
		if (!source || !target) return;
		degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1);
		degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1);

		if (source.data.type === "Equipment" && target.data.type !== "Equipment") {
			AddRelatedAsset(relatedAssetCountsByNode, target.id, source.id);
		}
		if (target.data.type === "Equipment" && source.data.type !== "Equipment") {
			AddRelatedAsset(relatedAssetCountsByNode, source.id, target.id);
		}
	});

	const equipmentNodes = graphNodes
		.filter((node) => node.data.type === "Equipment")
		.sort((a, b) => CompareGraphNodes(a, b, degreeByNode));
	const assetRank = new Map(
		equipmentNodes.map((node, index) => [node.id, index]),
	);
	const laneOrder = equipmentNodes.map((node) => node.id);
	const laneByNode = new Map(equipmentNodes.map((node) => [node.id, node.id]));
	const fallbackLane = "__unlinked__";
	let hasFallbackLane = false;

	graphNodes.forEach((node) => {
		if (laneByNode.has(node.id)) return;
		const lane = PickAssetLane(
			relatedAssetCountsByNode.get(node.id),
			assetRank,
		);
		if (lane) {
			laneByNode.set(node.id, lane);
			return;
		}
		laneByNode.set(node.id, fallbackLane);
		hasFallbackLane = true;
	});

	if (hasFallbackLane || (!laneOrder.length && graphNodes.length)) {
		laneOrder.push(fallbackLane);
	}

	const bucketsByLane = new Map<string, Map<number, GraphNodeRecord[]>>();
	graphNodes.forEach((node) => {
		const lane = laneByNode.get(node.id) ?? fallbackLane;
		const column = GraphColumn(node);
		if (!bucketsByLane.has(lane)) bucketsByLane.set(lane, new Map());
		const buckets = bucketsByLane.get(lane);
		if (!buckets?.has(column)) buckets?.set(column, []);
		buckets?.get(column)?.push(node);
	});

	const minColumn = graphNodes.length
		? Math.min(...graphNodes.map(GraphColumn))
		: 0;
	let yCursor = 0;

	laneOrder.forEach((lane) => {
		const buckets = bucketsByLane.get(lane);
		if (!buckets) return;
		const maxStack = Math.max(
			1,
			...Array.from(buckets.values()).map((nodes) => nodes.length),
		);
		const laneHeight = Math.max(
			GraphLaneMinHeight,
			maxStack * GraphStackGap + 48,
		);

		Array.from(buckets.entries())
			.sort(([columnA], [columnB]) => columnA - columnB)
			.forEach(([column, nodes]) => {
				nodes.sort((a, b) => CompareGraphNodes(a, b, degreeByNode));
				const stackHeight = (nodes.length - 1) * GraphStackGap;
				const startY =
					yCursor + Math.max(24, (laneHeight - stackHeight - 92) / 2);

				nodes.forEach((node, index) => {
					positions[node.id] = {
						x: (column - minColumn) * GraphColumnGap,
						y: Math.round(startY + index * GraphStackGap),
					};
				});
			});

		yCursor += laneHeight;
	});

	return { degreeByNode, positions };
}

function AddRelatedAsset(
	relatedAssetCountsByNode: Map<string, Map<string, number>>,
	nodeId: string,
	assetId: string,
) {
	if (!relatedAssetCountsByNode.has(nodeId)) {
		relatedAssetCountsByNode.set(nodeId, new Map());
	}
	const counts = relatedAssetCountsByNode.get(nodeId);
	counts?.set(assetId, (counts.get(assetId) ?? 0) + 1);
}

function PickAssetLane(
	assetCounts: Map<string, number> | undefined,
	assetRank: Map<string, number>,
) {
	if (!assetCounts?.size) return null;
	return (
		Array.from(assetCounts.entries())
			.filter(([assetId]) => assetRank.has(assetId))
			.sort(([assetA, countA], [assetB, countB]) => {
				if (countA !== countB) return countB - countA;
				return (assetRank.get(assetA) ?? 0) - (assetRank.get(assetB) ?? 0);
			})[0]?.[0] ?? null
	);
}

function GraphColumn(node: GraphNodeRecord) {
	return GraphColumnByType[node.data.type] ?? 6;
}

function CompareGraphNodes(
	a: GraphNodeRecord,
	b: GraphNodeRecord,
	degreeByNode: Map<string, number>,
) {
	const degreeDelta =
		(degreeByNode.get(b.id) ?? 0) - (degreeByNode.get(a.id) ?? 0);
	if (degreeDelta) return degreeDelta;

	const typeDelta = TypeRank(a.data.type) - TypeRank(b.data.type);
	if (typeDelta) return typeDelta;

	return a.data.label.localeCompare(b.data.label, undefined, {
		numeric: true,
		sensitivity: "base",
	});
}

function TypeRank(type: string) {
	const index = TypeSortOrder.indexOf(type);
	return index >= 0 ? index : TypeSortOrder.length;
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
