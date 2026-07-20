import type { Metadata } from "next";
import AssetsPage from "./_components/AssetsPage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.assets);

export default AssetsPage;
