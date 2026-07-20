import type { Config } from "tailwindcss";

const config: Config = {
	content: [
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./lib/**/*.{js,ts,jsx,tsx,mdx}",
	],
	theme: {
		extend: {
			colors: {
				steel: "#40534D",
				panel: "#F2F6F4",
				line: "#CBD8D3",
				signal: "#006D75",
				alert: "#A8322D",
				warning: "#8A4B00",
			},
			boxShadow: {
				panel: "0 12px 28px rgba(20, 32, 29, 0.08)",
			},
		},
	},
	plugins: [],
};

export default config;
