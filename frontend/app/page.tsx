import type { Metadata } from "next";
import CommandCentrePage from "./_components/CommandCentrePage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.home);

export default CommandCentrePage;
