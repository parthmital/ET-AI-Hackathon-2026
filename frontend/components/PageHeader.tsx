import type { ReactNode } from "react";
import { AppIcon, cn, type IconType } from "@/components/UI";

export function PageHeader({
	title,
	subtitle,
	icon: Icon,
	actions,
	className,
}: {
	title: string;
	subtitle?: string;
	icon?: IconType;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"mb-5 flex min-w-0 flex-col justify-between gap-3 lg:flex-row lg:items-end",
				className,
			)}
		>
			<div className="flex min-w-0 items-start gap-3">
				{Icon ? (
					<span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-app-border bg-app-surface text-app-primary shadow-[var(--app-shadow-tight)]">
						<AppIcon className="size-5" icon={Icon} />
					</span>
				) : null}
				<div className="min-w-0">
					<h1 className="break-words text-2xl font-semibold leading-tight text-app-text sm:text-3xl">
						{title}
					</h1>
					{subtitle ? (
						<p className="mt-1 max-w-2xl text-sm leading-6 text-app-muted">
							{subtitle}
						</p>
					) : null}
				</div>
			</div>
			{actions ? (
				<div className="flex min-w-0 flex-wrap gap-2 lg:shrink-0">
					{actions}
				</div>
			) : null}
		</div>
	);
}
