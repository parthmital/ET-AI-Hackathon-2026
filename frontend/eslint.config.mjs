import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default [
	{
		ignores: [
			".next/**",
			"node_modules/**",
			"out/**",
			"build/**",
			"next-env.d.ts",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ["**/*.{js,jsx,ts,tsx,mjs,cjs}"],
		plugins: {
			"@next/next": nextPlugin,
			"react-hooks": reactHooks,
		},
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		rules: {
			...nextPlugin.configs.recommended.rules,
			...nextPlugin.configs["core-web-vitals"].rules,
			...reactHooks.configs.recommended.rules,
		},
	},
];
