import type { Metadata } from "next";
import GraphPage from "./_components/GraphPage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.graph);

export default GraphPage;
