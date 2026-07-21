"use client";

import { useCallback, useEffect, useRef } from "react";
import ReactFlow, {
	Controls,
	getNodesBounds,
	type Edge,
	type Node,
	type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";

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

	const fitInitialView = useCallback((instance: ReactFlowInstance) => {
		const viewport = viewportRef.current?.getBoundingClientRect();
		const graphNodes = instance.getNodes();
		if (!viewport || !graphNodes.length) {
			instance.fitView({ padding: 0.24 });
			return;
		}
		if (graphNodes.length <= 36) {
			instance.fitView({ padding: 0.24 });
			return;
		}

		const bounds = getNodesBounds(graphNodes);
		if (!bounds.width || !bounds.height) {
			instance.fitView({ padding: 0.24 });
			return;
		}
		const zoom = Math.max(
			0.32,
			Math.min(0.92, viewport.width / (bounds.width * 1.18)),
		);
		instance.setViewport(
			{
				x: viewport.width / 2 - (bounds.x + bounds.width / 2) * zoom,
				y: 28 - bounds.y * zoom,
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
				minZoom={0.08}
				nodes={nodes}
				onInit={handleInit}
				onEdgeClick={(_, edge) => onEdgeClick?.(edge)}
				onNodeClick={(_, node) => onNodeClick(node)}
				proOptions={{ hideAttribution: true }}
				style={{ background: "var(--app-graph-bg)" }}
			>
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
