import type { Metadata } from "next";
import RcaPage from "./_components/RcaPage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.rca);

export default RcaPage;
