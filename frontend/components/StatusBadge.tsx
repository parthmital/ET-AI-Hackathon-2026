import { cn } from "@/components/UI";
import { FormatDisplayLabel } from "@/lib/format";

export function StatusBadge({
	value,
	className,
}: {
	value: string | number;
	className?: string;
}) {
	const DisplayValue = FormatDisplayLabel(value);
	const toneKey = `${String(value)} ${DisplayValue}`.toLowerCase();
	const ToneClass =
		toneKey.includes("high") ||
		toneKey.includes("critical") ||
		toneKey.includes("open") ||
		toneKey.includes("failed") ||
		toneKey.includes("error") ||
		toneKey.includes("rejected") ||
		toneKey.includes("blocked") ||
		toneKey.includes("unsupported")
			? "border-tone-red-border bg-tone-red-bg text-tone-red-text"
			: toneKey.includes("medium") ||
				  toneKey.includes("warning") ||
				  toneKey.includes("uploading") ||
				  toneKey.includes("weak") ||
				  toneKey.includes("stale")
				? "border-tone-amber-border bg-tone-amber-bg text-tone-amber-text"
				: toneKey.includes("low") ||
					  toneKey.includes("closed") ||
					  toneKey.includes("ok") ||
					  toneKey.includes("complete") ||
					  toneKey.includes("accepted") ||
					  toneKey.includes("ready")
					? "border-tone-emerald-border bg-tone-emerald-bg text-tone-emerald-text"
					: "border-tone-slate-border bg-tone-slate-bg text-tone-slate-text";

	return (
		<span
			className={cn(
				"inline-flex max-w-full shrink-0 items-center rounded-full border px-2.5 py-1 text-left text-xs font-semibold leading-4",
				ToneClass,
				className,
			)}
		>
			<span className="min-w-0 truncate whitespace-nowrap">{DisplayValue}</span>
		</span>
	);
}
