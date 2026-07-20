import { ReactNode, useId } from "react";
import { cn } from "@/components/UI";

export function DataCard({
	title,
	children,
	action,
	className,
	padded = true,
}: {
	title: string;
	children: ReactNode;
	action?: ReactNode;
	className?: string;
	padded?: boolean;
	eyebrow?: string;
	description?: string;
}) {
	const titleId = useId();

	return (
		<section
			aria-labelledby={titleId}
			className={cn(
				"min-w-0 max-w-full overflow-hidden rounded-lg border border-app-border bg-app-surface shadow-[var(--app-shadow-tight)]",
				className,
			)}
		>
			<div className="flex min-h-12 flex-col gap-3 border-b border-app-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
				<h2
					className="min-w-0 break-words text-sm font-semibold text-app-text"
					id={titleId}
				>
					{title}
				</h2>
				{action ? <div className="min-w-0 shrink-0">{action}</div> : null}
			</div>
			<div className={padded ? "p-4" : ""}>{children}</div>
		</section>
	);
}
