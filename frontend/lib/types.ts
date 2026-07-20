export type DocumentSummary = {
	id: number;
	filename: string;
	document_type: string;
	upload_time: string;
	page_count: number;
	character_count: number;
	parser: string;
	ocr_used: boolean;
	ocr_engine: string;
	ocr_confidence: number | null;
	extracted_tables_count: number;
	extracted_images_count: number;
	extraction_warnings: string[];
};

export type Entity = {
	id: number;
	document_id: number;
	filename: string;
	page: number;
	entity_type: string;
	value: string;
	confidence: number;
	context: string;
};

export type AnalysisStatus = {
	analysis_status:
		"not_run" | "running" | "complete" | "failed" | "stale" | string;
	analysis_message: string;
	analysis_source: string;
	analysis_started_at: string | null;
	analysis_completed_at: string | null;
	documents_ingested: number;
	entities_extracted: number;
	assets: number;
	timeline_events: number;
	compliance_gaps: number;
	contradictions: number;
	agent_stages?: AnalysisAgentStatus[];
};

export type AnalysisAgentStatus = {
	stage: string;
	status: string;
	records: number;
	message: string;
};

export type BatchUploadItem = {
	filename: string;
	stored_filename?: string;
	status: "uploaded" | "duplicate" | "failed";
	document_id?: number;
	document_type?: string;
	chunk_count?: number;
	page_count?: number;
	message: string;
};

export type BatchUploadResponse = {
	total_files: number;
	uploaded_count: number;
	duplicate_count: number;
	failed_count: number;
	items: BatchUploadItem[];
};

export type Citation = {
	document: string;
	page: number;
	snippet: string;
};

export type EvidenceStatus = "accepted" | "weak" | "rejected" | string;

export type EvidenceReference = {
	document: string;
	page: number;
	snippet: string;
	confidence?: number;
	status?: EvidenceStatus;
	reason?: string;
};

export type ChatResponse = {
	answer: string;
	citations: Citation[];
	confidence: number;
	related_entities: string[];
	graph_paths: GraphPath[];
};

export type Asset = {
	id: string;
	name: string;
	asset_type: string;
	location: string;
	risk_level: string;
	last_inspection: string | null;
	open_compliance_gaps: number;
	suggested_actions: string[];
	source_document: string;
	source_page: number;
	evidence_text: string;
};

export type TimelineEvent = {
	id: number;
	asset_id: string;
	event_date: string;
	event_type: string;
	title: string;
	description: string;
	source_document: string;
	source_page: number;
};

export type ComplianceGap = {
	id: number;
	asset_id: string;
	severity: string;
	gap_type: string;
	description: string;
	evidence: string;
	corrective_action: string;
	status: string;
	source_document: string;
	source_page: number;
	evidence_status?: EvidenceStatus;
	confidence?: number;
};

export type DashboardSummary = {
	total_documents: number;
	total_assets: number;
	detected_compliance_gaps: number;
	high_risk_assets: number;
	recent_uploads: DocumentSummary[];
	top_failure_modes: { failure_mode: string; count: number }[];
};

export type GraphResponse = {
	nodes: {
		id: string;
		data: { label: string; type: string; details: Record<string, unknown> };
		position: { x: number; y: number };
	}[];
	edges: {
		id: string;
		source: string;
		target: string;
		source_node: string;
		target_node: string;
		label: string;
		relation_type: string;
		confidence: number;
		source_document: string;
		source_page: number;
		evidence_text: string;
		validation_status: EvidenceStatus;
		validation_reason: string;
	}[];
	edge_audit?: {
		accepted: number;
		weak: number;
		rejected: number;
		total: number;
	};
};

export type GraphPath = {
	asset_id: string;
	title: string;
	summary: string;
	nodes: { id: string; label: string; type: string }[];
	edges: {
		source: string;
		target: string;
		source_node?: string;
		target_node?: string;
		label: string;
		relation_type?: string;
		confidence?: number;
		source_document?: string;
		source_page?: number;
		evidence_text?: string;
		validation_status?: EvidenceStatus;
		validation_reason?: string;
	}[];
	confidence: number;
};

export type Contradiction = {
	id: number;
	asset_id: string;
	severity: string;
	contradiction_type: string;
	description: string;
	evidence_a: string;
	source_document_a: string;
	source_page_a: number;
	evidence_b: string;
	source_document_b: string;
	source_page_b: number;
	status: string;
};

export type RCAResponse = {
	asset: string;
	symptom: string;
	likely_causes: string[];
	supporting_evidence: Citation[];
	recommended_checks: string[];
	preventive_actions: string[];
	cited_documents: string[];
	graph_paths: GraphPath[];
	contradictions?: Contradiction[];
	likely_cause_evidence?: { text: string; evidence: Citation[] }[];
	recommended_check_evidence?: { text: string; evidence: Citation[] }[];
	preventive_action_evidence?: { text: string; evidence: Citation[] }[];
};

export type HealthResponse = {
	status: string;
	service: string;
	llm_provider?: string;
	llm_model?: string;
	llm_configured: boolean;
	live_only: boolean;
	provider_status: string;
	active_provider: string;
	active_model: string;
	provider_chain: { provider: string; model: string }[];
	json_schema_enabled: boolean;
	last_error: {
		provider: string;
		model: string;
		message: string;
		retryable: boolean;
		status_code: number | null;
		diagnostics: string;
		at: string;
	} | null;
	ocr: {
		enabled: boolean;
		available: boolean;
		engine: string;
		message: string;
	};
	analysis: AnalysisStatus;
};

export type EvidencePack = {
	filename: string;
	markdown: string;
};

export type GraphExport = {
	filename: string;
	format: "json" | "cypher" | string;
	content: string;
};
