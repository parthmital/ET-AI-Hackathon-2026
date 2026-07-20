const Acronyms = new Set([
	"ai",
	"api",
	"csv",
	"docx",
	"et",
	"gpt",
	"hse",
	"hx",
	"llm",
	"oem",
	"oss",
	"pdf",
	"ppe",
	"rca",
	"sop",
	"txt",
	"v4",
	"xlsx",
]);

const SpecialWords: Record<string, string> = {
	deepseek: "DeepSeek",
};

const MinorTitleWords = new Set([
	"and",
	"as",
	"at",
	"by",
	"for",
	"from",
	"in",
	"of",
	"on",
	"or",
	"the",
	"to",
	"with",
]);

const ProviderNames: Record<string, string> = {
	deepseek: "DeepSeek",
	unconfigured: "Unconfigured",
};

function Capitalise(value: string) {
	return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function FormatToken(token: string, index = 0, total = 1) {
	const lower = token.toLowerCase();
	if (SpecialWords[lower]) return SpecialWords[lower];
	if (Acronyms.has(lower)) return lower.toUpperCase();
	if (index > 0 && index < total - 1 && MinorTitleWords.has(lower)) {
		return lower;
	}
	if (/^[a-z]+-\d+[a-z0-9-]*$/i.test(token)) return token.toUpperCase();
	if (token === lower) return Capitalise(token);
	return token;
}

export function FormatDisplayLabel(value: string | number | null | undefined) {
	if (value === null || value === undefined) return "Not available";
	const raw = String(value).trim();
	if (!raw) return "Not available";
	if (/^\d+\s*\/\s*\d+$/.test(raw)) return raw.replace(/\s+/g, "");
	if (/^[a-z]+-\d+[a-z0-9-]*$/i.test(raw)) return raw.toUpperCase();

	const normalised = raw.replace(/_/g, " ").replace(/\s+/g, " ");
	const tokens = normalised.split(" ").flatMap((token) => {
		if (/^\d+\/\d+$/.test(token)) return [token];
		if (/^[a-z]+-\d+[a-z0-9-]*$/i.test(token)) return [token.toUpperCase()];
		return token.split(/[/-]+/).filter(Boolean);
	});
	return tokens
		.map((token, index) => FormatToken(token, index, tokens.length))
		.join(" ");
}

export function FormatProviderName(provider: string | null | undefined) {
	const raw = provider?.trim();
	if (!raw) return "LLM";
	return ProviderNames[raw.toLowerCase()] ?? FormatDisplayLabel(raw);
}

export function FormatModelName(model: string | null | undefined) {
	const raw = model?.trim();
	if (!raw) return "Configured Model";
	const parts = raw.split("/");
	const modelName = parts.pop() ?? raw;
	const owner = parts.length ? `${FormatProviderName(parts.join("/"))} ` : "";
	const formattedModel = modelName
		.split(/[-_\s]+/)
		.filter(Boolean)
		.map((token) => {
			const lower = token.toLowerCase();
			if (SpecialWords[lower]) return SpecialWords[lower];
			if (Acronyms.has(lower)) return lower.toUpperCase();
			if (/^\d+[bkmt]$/i.test(token)) return token.toUpperCase();
			if (token === lower) return Capitalise(token);
			return token;
		})
		.join(" ");
	return `${owner}${formattedModel}`;
}
