import type {
	Asset,
	AnalysisStatus,
	BatchUploadResponse,
	ChatResponse,
	ComplianceGap,
	Contradiction,
	DashboardSummary,
	DocumentSummary,
	Entity,
	EvidencePack,
	GraphExport,
	GraphPath,
	GraphResponse,
	HealthResponse,
	RCAResponse,
	TimelineEvent,
} from "@/lib/types";
import { ApiFetch } from "@/lib/api-client";

export function GetDashboard(): Promise<DashboardSummary> {
	return ApiFetch<DashboardSummary>("/dashboard");
}

export function GetHealth(): Promise<HealthResponse> {
	return ApiFetch<HealthResponse>("/health");
}

export function GetAnalysisStatus(): Promise<AnalysisStatus> {
	return ApiFetch<AnalysisStatus>("/analysis/status");
}

export function RegenerateAnalysis(): Promise<AnalysisStatus> {
	return ApiFetch<AnalysisStatus>("/analysis/regenerate", { method: "POST" });
}

export function GetDocuments(): Promise<DocumentSummary[]> {
	return ApiFetch<DocumentSummary[]>("/documents");
}

export function UploadDocuments(files: File[]): Promise<BatchUploadResponse> {
	const formData = new FormData();
	files.forEach((file) => {
		const filename = (file as File & { webkitRelativePath?: string })
			.webkitRelativePath;
		formData.append("files", file, filename || file.name);
	});
	return ApiFetch<BatchUploadResponse>("/documents/upload-batch", {
		method: "POST",
		body: formData,
	});
}

export function ClearWorkspace(): Promise<{ status: string }> {
	return ApiFetch<{ status: string }>("/workspace", { method: "DELETE" });
}

export function GetEntities(): Promise<Entity[]> {
	return ApiFetch<Entity[]>("/entities");
}

export function AskQuestion(question: string): Promise<ChatResponse> {
	return ApiFetch<ChatResponse>("/chat", {
		method: "POST",
		body: JSON.stringify({ question, filters: {} }),
	});
}

export function GetAssets(): Promise<Asset[]> {
	return ApiFetch<Asset[]>("/assets");
}

export function GetAssetTimeline(assetId: string): Promise<TimelineEvent[]> {
	return ApiFetch<TimelineEvent[]>(
		`/assets/${encodeURIComponent(assetId)}/timeline`,
	);
}

export function GetAssetRiskSummary(assetId: string): Promise<{
	asset_id: string;
	risk_level: string;
	last_inspection: string | null;
	open_compliance_gaps: ComplianceGap[];
	failure_patterns: string[];
	maintenance_history: TimelineEvent[];
	suggested_next_actions: string[];
	source_document: string;
	source_page: number;
	evidence_text: string;
	suggested_action_evidence: {
		action: string;
		evidence: { document: string; page: number; snippet: string }[];
	}[];
	graph_paths: GraphPath[];
	contradictions: Contradiction[];
}> {
	return ApiFetch<{
		asset_id: string;
		risk_level: string;
		last_inspection: string | null;
		open_compliance_gaps: ComplianceGap[];
		failure_patterns: string[];
		maintenance_history: TimelineEvent[];
		suggested_next_actions: string[];
		source_document: string;
		source_page: number;
		evidence_text: string;
		suggested_action_evidence: {
			action: string;
			evidence: { document: string; page: number; snippet: string }[];
		}[];
		graph_paths: GraphPath[];
		contradictions: Contradiction[];
	}>(`/assets/${encodeURIComponent(assetId)}/risk-summary`);
}

export function GetGraph(): Promise<GraphResponse> {
	return ApiFetch<GraphResponse>("/graph");
}

export function GetGraphExport(
	format: "json" | "cypher",
): Promise<GraphExport> {
	return ApiFetch<GraphExport>(
		`/graph/export?format=${encodeURIComponent(format)}`,
	);
}

export function GetGraphPaths(assetId?: string): Promise<GraphPath[]> {
	const suffix = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : "";
	return ApiFetch<GraphPath[]>(`/graph/paths${suffix}`);
}

export function GetContradictions(assetId?: string): Promise<Contradiction[]> {
	const suffix = assetId ? `?asset_id=${encodeURIComponent(assetId)}` : "";
	return ApiFetch<Contradiction[]>(`/contradictions${suffix}`);
}

export function GetComplianceGaps(): Promise<ComplianceGap[]> {
	return ApiFetch<ComplianceGap[]>("/compliance/gaps");
}

export function GetComplianceEvidencePack(): Promise<EvidencePack> {
	return ApiFetch<EvidencePack>("/compliance/evidence-pack");
}

export function GetAssetEvidencePack(assetId: string): Promise<EvidencePack> {
	return ApiFetch<EvidencePack>(
		`/assets/${encodeURIComponent(assetId)}/evidence-pack`,
	);
}

export function CheckCompliance(
	query: string,
): Promise<{ summary: string; gaps: ComplianceGap[] }> {
	return ApiFetch<{ summary: string; gaps: ComplianceGap[] }>(
		"/compliance/check",
		{
			method: "POST",
			body: JSON.stringify({ query }),
		},
	);
}

export function RunRCA(asset: string, symptom: string): Promise<RCAResponse> {
	return ApiFetch<RCAResponse>("/rca", {
		method: "POST",
		body: JSON.stringify({ asset, symptom }),
	});
}
