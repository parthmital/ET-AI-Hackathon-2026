import type { Metadata } from "next";
import ChatPage from "./_components/ChatPage";
import { BuildPageMetadata, RouteSeo } from "@/lib/seo";

export const metadata: Metadata = BuildPageMetadata(RouteSeo.chat);

export default ChatPage;
