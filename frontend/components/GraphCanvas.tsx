"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import ReactFlow, {
	Background,
	Controls,
	Handle,
	Position,
	getNodesBounds,
	type Edge,
	type Node,
	type NodeProps,
	type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

type EvidenceNodeData = {
	degree?: number;
	dimmed?: boolean;
	label: string;
	palette?: { border: string; bg: string; text: string };
	title?: string;
	type: string;
};

export function GraphCanvas({
	edges,
	nodes,
	onEdgeClick,
	onInit,
	onNodeClick,
}: {
	edges: Edge[];
	nodes: Node[];
	onEdgeClick?: (edge: Edge) => void;
	onInit: (instance: ReactFlowInstance) => void;
	onNodeClick: (node: Node) => void;
}) {
	const flowInstanceRef = useRef<ReactFlowInstance | null>(null);
	const viewportRef = useRef<HTMLDivElement | null>(null);
	const nodeTypes = useMemo(() => ({ evidence: EvidenceNode }), []);

	const fitInitialView = useCallback((instance: ReactFlowInstance) => {
		const viewport = viewportRef.current?.getBoundingClientRect();
		const graphNodes = instance.getNodes();
		if (!viewport || !graphNodes.length) return;
		const bounds = getNodesBounds(graphNodes);
		if (!bounds.width || !bounds.height) {
			instance.fitView({ padding: 0.24 });
			return;
		}
		const zoom = Math.max(
			0.42,
			Math.min(0.92, viewport.width / (bounds.width * 1.12)),
		);
		instance.setViewport(
			{
				x: (viewport.width - bounds.width * zoom) / 2 - bounds.x * zoom,
				y: 32 - bounds.y * zoom,
				zoom,
			},
			{ duration: 180 },
		);
	}, []);

	useEffect(() => {
		const instance = flowInstanceRef.current;
		if (!instance) return;

		const frame = window.requestAnimationFrame(() => {
			fitInitialView(instance);
		});
		return () => window.cancelAnimationFrame(frame);
	}, [fitInitialView, nodes]);

	const handleInit = useCallback(
		(instance: ReactFlowInstance) => {
			flowInstanceRef.current = instance;
			onInit(instance);
			window.requestAnimationFrame(() => {
				fitInitialView(instance);
			});
		},
		[fitInitialView, onInit],
	);

	return (
		<div
			className="h-full w-full"
			data-testid="evidence-graph"
			ref={viewportRef}
		>
			<ReactFlow
				edges={edges}
				fitView
				fitViewOptions={{ padding: 0.24 }}
				minZoom={0.22}
				nodes={nodes}
				nodesDraggable={false}
				nodeTypes={nodeTypes}
				onInit={handleInit}
				onEdgeClick={(_, edge) => onEdgeClick?.(edge)}
				onNodeClick={(_, node) => onNodeClick(node)}
				proOptions={{ hideAttribution: true }}
				style={{ background: "var(--app-graph-bg)" }}
			>
				<Background color="var(--app-chart-grid)" gap={28} size={0.65} />
				<Controls
					position="bottom-left"
					showInteractive={false}
					style={{
						border: "1px solid var(--app-border)",
						borderRadius: 8,
						boxShadow: "var(--app-shadow-panel)",
						overflow: "hidden",
					}}
				/>
			</ReactFlow>
		</div>
	);
}

function EvidenceNode({ data, selected }: NodeProps<EvidenceNodeData>) {
	const palette = data.palette ?? {
		border: "var(--app-border-strong)",
		bg: "var(--app-surface)",
		text: "var(--app-text)",
	};
	const title = data.title ?? data.label;

	return (
		<div
			className={[
				"evidence-graph-node relative min-h-[92px] rounded-lg border px-3 py-3 shadow-[var(--app-shadow-tight)] transition-all duration-150",
				selected ? "ring-2 ring-app-focus/45" : "",
				data.dimmed ? "opacity-25" : "opacity-100",
			].join(" ")}
			style={{
				background: palette.bg,
				borderColor: palette.border,
			}}
		>
			<Handle
				className="evidence-node-handle"
				position={Position.Left}
				type="target"
			/>
			<div className="flex min-w-0 items-start gap-2">
				<span
					className="mt-1 size-2 shrink-0 rounded-sm"
					style={{ background: palette.border }}
				/>
				<div className="min-w-0">
					<p className="line-clamp-3 break-words text-[13px] font-semibold leading-5 text-app-text">
						{title}
					</p>
					<div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
						<span
							className="min-w-0 truncate text-[10px] font-bold uppercase leading-4 tracking-[0.08em]"
							style={{ color: palette.text }}
						>
							{data.type}
						</span>
						{data.degree ? (
							<span className="rounded-sm bg-app-surface/70 px-1.5 py-0.5 text-[10px] font-bold leading-4 text-app-subtle">
								{data.degree} links
							</span>
						) : null}
					</div>
				</div>
			</div>
			<Handle
				className="evidence-node-handle"
				position={Position.Right}
				type="source"
			/>
		</div>
	);
}
