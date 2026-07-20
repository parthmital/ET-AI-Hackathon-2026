import type { Metadata } from "next";
import { Brand } from "@/lib/brand";

export type PageSeo = {
	description: string;
	path: string;
	priority: number;
	title: string;
};

export const AppRoutes = [
	{
		description:
			"Monitor evidence readiness, industrial asset risk, compliance exposure, and cited next actions.",
		path: "/",
		priority: 1,
		title: "Command Centre",
	},
	{
		description:
			"Upload plant records, run extraction, and review source files, entities, assets, gaps, and contradictions.",
		path: "/documents",
		priority: 0.9,
		title: "Evidence Workspace",
	},
	{
		description:
			"Ask operational questions and review grounded answers with citations, confidence, related entities, and graph paths.",
		path: "/chat",
		priority: 0.85,
		title: "Ask With Citations",
	},
	{
		description:
			"Review generated industrial assets with risk levels, timelines, compliance gaps, recommended actions, and provenance.",
		path: "/assets",
		priority: 0.85,
		title: "Asset Risk Register",
	},
	{
		description:
			"Explore generated relationships between assets, documents, failures, controls, compliance gaps, and operational events.",
		path: "/graph",
		priority: 0.8,
		title: "Evidence Graph",
	},
	{
		description:
			"Run compliance checks, filter findings, and export cited corrective action evidence packs.",
		path: "/compliance",
		priority: 0.8,
		title: "Compliance Review",
	},
	{
		description:
			"Generate cited root cause analysis briefs for industrial assets, symptoms, checks, and preventive actions.",
		path: "/rca",
		priority: 0.8,
		title: "Root Cause Analysis",
	},
] as const satisfies readonly PageSeo[];

export const RouteSeo = {
	home: AppRoutes[0],
	documents: AppRoutes[1],
	chat: AppRoutes[2],
	assets: AppRoutes[3],
	graph: AppRoutes[4],
	compliance: AppRoutes[5],
	rca: AppRoutes[6],
} as const;

const Keywords = [
	"industrial operations intelligence",
	"industrial evidence workbench",
	"root cause analysis",
	"RCA",
	"compliance review",
	"knowledge graph",
	"asset risk register",
	"cited AI answers",
	"plant maintenance",
	"ET AI Hackathon 2026",
];

export function BuildRootMetadata(): Metadata {
	return {
		applicationName: Brand.name,
		category: "technology",
		description: Brand.description,
		formatDetection: {
			telephone: false,
		},
		icons: {
			apple: "/apple-icon.png",
			icon: [
				{ url: "/favicon.ico" },
				{ url: "/icon.svg", type: "image/svg+xml" },
			],
			shortcut: "/favicon.ico",
		},
		keywords: Keywords,
		manifest: "/manifest.webmanifest",
		title: {
			default: `${Brand.name} | Evidence Workbench`,
			template: `%s | ${Brand.name}`,
		},
	};
}

export function BuildPageMetadata(page: PageSeo): Metadata {
	return {
		description: page.description,
		title:
			page.path === "/"
				? { absolute: `${Brand.name} | ${page.title}` }
				: page.title,
	};
}
