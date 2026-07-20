import type { Metadata } from "next";
import CompliancePage from "./_components/CompliancePage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.compliance);

export default CompliancePage;
