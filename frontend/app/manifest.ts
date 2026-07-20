import type { MetadataRoute } from "next";
import { Brand } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
	return {
		background_color: "#0b100e",
		categories: ["business", "productivity", "utilities"],
		description: Brand.description,
		display: "standalone",
		icons: [
			{
				src: "/icon-192.png",
				sizes: "192x192",
				type: "image/png",
			},
			{
				src: "/icon-512.png",
				sizes: "512x512",
				type: "image/png",
			},
		],
		name: Brand.name,
		short_name: Brand.shortName,
		start_url: "/",
		theme_color: "#08776d",
	};
}
