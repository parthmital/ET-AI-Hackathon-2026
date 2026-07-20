import type { Metadata } from "next";
import DocumentsPage from "./_components/DocumentsPage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.documents);

export default DocumentsPage;
